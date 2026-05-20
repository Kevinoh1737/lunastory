import {
  pgTable,
  text,
  date,
  numeric,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";
import { skusTable } from "./skus";

/**
 * Point-in-time stock balances mirrored from Ecount's
 * `InventoryBalance/GetListInventoryBalanceStatus` endpoint.
 *
 * One row per (sku_code, warehouse_code, snapshot_date). Upsert daily.
 *
 * During the bridge period (system_settings.source_of_truth = 'ecount'),
 * the nightly sync writes one row per SKU per warehouse per day with the
 * latest BAL_QTY from Ecount. The `inventory_movements` table is left empty
 * — Ecount's snapshots are the truth. After cutover to 'lunastory',
 * movements become first-class and snapshots can be derived from them.
 */
export const inventorySnapshotsTable = pgTable(
  "inventory_snapshots",
  {
    skuCode: text("sku_code")
      .notNull()
      .references(() => skusTable.skuCode),
    warehouseCode: text("warehouse_code").notNull().default(""),
    snapshotDate: date("snapshot_date").notNull(),
    balanceQty: numeric("balance_qty", { precision: 14, scale: 4 }).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.skuCode, t.warehouseCode, t.snapshotDate] })],
);

export type InventorySnapshot = typeof inventorySnapshotsTable.$inferSelect;
export type InsertInventorySnapshot = typeof inventorySnapshotsTable.$inferInsert;
