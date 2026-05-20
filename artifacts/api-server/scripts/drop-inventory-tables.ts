import "../src/loadEnv";
import pg from "pg";

async function main() {
  const t = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  // Drop in FK-respecting order (children first)
  const tables = [
    "sku_suppliers",
    "purchase_order_lines",
    "purchase_orders",
    "inventory_movements",
    "inventory_snapshots",
    "sales_records",
    "forecast_runs",
    "ecount_sync_state",
    "system_settings",
    "skus",
    "suppliers",
    "channels",
  ];
  for (const tbl of tables) {
    await t.query(`DROP TABLE IF EXISTS ${tbl} CASCADE`);
    console.log(`dropped ${tbl}`);
  }
  await t.end();
}
main().catch(e => { console.error(e); process.exit(1); });
