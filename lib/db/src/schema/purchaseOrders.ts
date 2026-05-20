import {
  pgTable,
  text,
  serial,
  integer,
  numeric,
  date,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { suppliersTable } from "./suppliers";

/**
 * Shape of the container plan stored in `container_plan_json`.
 * Snapshot from the packing optimizer at the time the user picked a plan.
 */
export type ContainerPlanSnapshot = {
  containers: Array<{
    type: "20ft" | "40ft" | "40HC";
    skus: Array<{ skuId: number; quantity: number }>;
    cbmUsed: number;
    weightKg: number;
  }>;
  totalCostUsd: number;
  totalCbmFill: number; // 0..1
};

export const purchaseOrdersTable = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").references(() => suppliersTable.id),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"), // 'draft' | 'submitted' | 'shipped' | 'received'
  containerPlanJson: jsonb("container_plan_json").$type<ContainerPlanSnapshot>(),
  shippingQuoteUsd: numeric("shipping_quote_usd", { precision: 10, scale: 2 }),
  expectedReadyDate: date("expected_ready_date"),
  expectedArrivalDate: date("expected_arrival_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrdersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrder = typeof purchaseOrdersTable.$inferSelect;
