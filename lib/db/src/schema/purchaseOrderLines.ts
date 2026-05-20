import { pgTable, serial, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { purchaseOrdersTable } from "./purchaseOrders";
import { skusTable } from "./skus";

export const purchaseOrderLinesTable = pgTable("purchase_order_lines", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id")
    .notNull()
    .references(() => purchaseOrdersTable.id, { onDelete: "cascade" }),
  skuId: integer("sku_id")
    .notNull()
    .references(() => skusTable.id),
  quantity: integer("quantity").notNull(),
  unitCostUsd: numeric("unit_cost_usd", { precision: 10, scale: 2 }),
});

export const insertPurchaseOrderLineSchema = createInsertSchema(purchaseOrderLinesTable).omit({
  id: true,
});
export type InsertPurchaseOrderLine = z.infer<typeof insertPurchaseOrderLineSchema>;
export type PurchaseOrderLine = typeof purchaseOrderLinesTable.$inferSelect;
