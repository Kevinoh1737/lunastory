import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { skusTable } from "./skus";

/**
 * Event-sourced inventory ledger. Current on-hand per SKU is the sum of
 * `quantity` across all movements for that SKU (positive = in, negative = out).
 *
 * During the Ecount bridge period, the nightly sync emits a single
 * synthetic `adjust` row per SKU per day to reconcile stock-level deltas
 * (since Ecount's API typically exposes current levels, not movements).
 */
export const inventoryMovementsTable = pgTable(
  "inventory_movements",
  {
    id: serial("id").primaryKey(),
    skuId: integer("sku_id")
      .notNull()
      .references(() => skusTable.id),
    movementType: text("movement_type").notNull(), // 'po_receipt' | 'sale' | 'adjust' | 'return'
    quantity: integer("quantity").notNull(), // signed
    referenceType: text("reference_type"), // 'purchase_order' | 'sales_record' | null
    referenceId: integer("reference_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
  },
  (t) => [index("inventory_movements_sku_occurred_idx").on(t.skuId, t.occurredAt)],
);

export const insertInventoryMovementSchema = createInsertSchema(inventoryMovementsTable).omit({
  id: true,
  occurredAt: true,
});
export type InsertInventoryMovement = z.infer<typeof insertInventoryMovementSchema>;
export type InventoryMovement = typeof inventoryMovementsTable.$inferSelect;
