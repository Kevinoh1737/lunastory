import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";

export const skusTable = pgTable("skus", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => productsTable.id),
  skuCode: text("sku_code").notNull().unique(),
  displayName: text("display_name").notNull(),

  // Factory cost in USD (numeric stays as string in JS to preserve precision)
  unitCostUsd: numeric("unit_cost_usd", { precision: 10, scale: 2 }),
  weightG: integer("weight_g"),

  // Per-master-carton packing
  cartonUnits: integer("carton_units"),
  cartonLCm: numeric("carton_l_cm", { precision: 6, scale: 1 }),
  cartonWCm: numeric("carton_w_cm", { precision: 6, scale: 1 }),
  cartonHCm: numeric("carton_h_cm", { precision: 6, scale: 1 }),

  leadTimeDays: integer("lead_time_days").default(180),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertSkuSchema = createInsertSchema(skusTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSku = z.infer<typeof insertSkuSchema>;
export type Sku = typeof skusTable.$inferSelect;
