import "../src/loadEnv";
import pg from "pg";
async function main() {
  const t = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const before = await t.query(`SELECT warehouse_code, COUNT(*)::int AS c FROM inventory_snapshots GROUP BY warehouse_code`);
  console.log("before:");
  before.rows.forEach((r: Record<string, unknown>) => console.log(`  WH_CD=${r.warehouse_code === "" ? "(empty)" : r.warehouse_code}: ${r.c}`));
  const del = await t.query(`DELETE FROM inventory_snapshots WHERE warehouse_code = ''`);
  console.log(`\ndeleted ${del.rowCount} empty-warehouse snapshot rows`);
  const after = await t.query(`SELECT warehouse_code, COUNT(*)::int AS c FROM inventory_snapshots GROUP BY warehouse_code`);
  console.log("\nafter:");
  after.rows.forEach((r: Record<string, unknown>) => console.log(`  WH_CD=${r.warehouse_code === "" ? "(empty)" : r.warehouse_code}: ${r.c}`));
  await t.end();
}
main().catch(e => { console.error(e); process.exit(1); });
