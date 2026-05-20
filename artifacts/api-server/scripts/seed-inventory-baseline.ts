import "../src/loadEnv";
import pg from "pg";

async function main() {
  const t = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  console.log("=== new tables present? ===");
  for (const tbl of ["skus","suppliers","sku_suppliers","channels","sales_records","inventory_movements","purchase_orders","purchase_order_lines","forecast_runs","ecount_sync_state","system_settings"]) {
    const { rows } = await t.query(`SELECT COUNT(*)::int AS c FROM ${tbl}`);
    console.log(`  ${tbl.padEnd(24)} ${rows[0].c}`);
  }

  console.log("\n=== seeding channels (idempotent via ON CONFLICT) ===");
  await t.query(`
    INSERT INTO channels (code, display_name) VALUES
      ('ecount', 'Ecount ERP'),
      ('csv',    'CSV upload')
    ON CONFLICT (code) DO NOTHING
  `);

  console.log("=== seeding system_settings.source_of_truth = 'ecount' ===");
  await t.query(`
    INSERT INTO system_settings (key, value) VALUES ('source_of_truth', '"ecount"'::jsonb)
    ON CONFLICT (key) DO NOTHING
  `);

  console.log("\n=== verify seeds ===");
  const { rows: chans } = await t.query(`SELECT code, display_name FROM channels ORDER BY id`);
  chans.forEach(r => console.log(`  channel: ${r.code} — ${r.display_name}`));
  const { rows: settings } = await t.query(`SELECT key, value FROM system_settings`);
  settings.forEach(r => console.log(`  setting: ${r.key} = ${JSON.stringify(r.value)}`));

  await t.end();
}
main().catch(e => { console.error(e); process.exit(1); });
