import {
  pgTable,
  text,
  serial,
  integer,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { skusTable } from "./skus";

/**
 * Event-sourced inventory ledger. Reserved for the post-cutover period when
 * Luna Story becomes the source of truth. During the Ecount bridge, this
 * table stays empty — daily stock levels live in `inventory_snapshots` instead.
 */
export const inventoryMovementsTable = pgTable(
  "inventory_movements",
  {
    id: serial("id").primaryKey(),
    skuCode: text("sku_code")
      .notNull()
      .references(() => skusTable.skuCode),
    movementType: text("movement_type").notNull(), // 'po_receipt' | 'sale' | 'adjust' | 'return'
    quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull(), // signed
    referenceType: text("reference_type"), // 'purchase_order' | 'sales_record' | null
    referenceId: integer("reference_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
  },
  (t) => [index("inventory_movements_sku_occurred_idx").on(t.skuCode, t.occurredAt)],
);

export const insertInventoryMovementSchema = createInsertSchema(inventoryMovementsTable).omit({
  id: true,
  occurredAt: true,
});
export type InsertInventoryMovement = z.infer<typeof insertInventoryMovementSchema>;
export type InventoryMovement = typeof inventoryMovementsTable.$inferSelect;
