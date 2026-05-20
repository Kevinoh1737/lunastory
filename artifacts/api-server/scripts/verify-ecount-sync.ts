import "../src/loadEnv";
import pg from "pg";
async function main() {
  const t = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const skus = await t.query(`SELECT COUNT(*)::int AS c FROM skus`);
  const snaps = await t.query(`SELECT COUNT(*)::int AS c FROM inventory_snapshots`);
  const state = await t.query(`SELECT resource, last_synced_at, last_error, last_run_id FROM ecount_sync_state ORDER BY resource`);
  const byType = await t.query(`SELECT prod_type, COUNT(*)::int AS c FROM skus GROUP BY prod_type ORDER BY prod_type`);
  const sample = await t.query(`
    SELECT s.sku_code, s.display_name, s.cont2 AS color, s.cont3 AS brand,
           s.in_price_krw, ip.balance_qty
    FROM skus s
    LEFT JOIN inventory_snapshots ip ON ip.sku_code = s.sku_code
    WHERE s.display_name LIKE '%클린매트%' OR s.display_name LIKE '%항균%'
    ORDER BY s.sku_code LIMIT 5
  `);
  console.log(`skus:                ${skus.rows[0].c}`);
  console.log(`inventory_snapshots: ${snaps.rows[0].c}`);
  console.log(`\nsync state:`);
  state.rows.forEach((r: Record<string, unknown>) => console.log(`  ${r.resource}: ${r.last_synced_at} | error=${r.last_error ?? 'none'}`));
  console.log(`\nprod_type distribution:`);
  byType.rows.forEach((r: Record<string, unknown>) => console.log(`  ${r.prod_type}: ${r.c}`));
  console.log(`\nsample products with stock:`);
  sample.rows.forEach((r: Record<string, unknown>) => console.log(`  ${r.sku_code} | ${r.display_name} | color=${r.color ?? '-'} brand=${r.brand ?? '-'} | ₩${r.in_price_krw ?? '-'} | qty=${r.balance_qty ?? '0'}`));
  await t.end();
}
main();
