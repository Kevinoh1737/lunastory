import {
  pgTable,
  text,
  integer,
  boolean,
  numeric,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";

/**
 * SKU master. Primary key is `sku_code` (text) — identical to Ecount's PROD_CD,
 * which is the natural key in their system (e.g. "44ALS002CMCV-2007P"). Sync
 * upserts become trivial: `INSERT ... ON CONFLICT (sku_code) DO UPDATE`.
 *
 * Columns are split into two groups:
 *   1. Mirrored-from-Ecount fields (overwritten on every sync)
 *   2. Luna-Story-only extension fields (Ecount doesn't track these — user maintains)
 */
export const skusTable = pgTable("skus", {
  skuCode: text("sku_code").primaryKey(), // = Ecount PROD_CD

  // --- Mirrored from Ecount (read-only during bridge period) -------------
  displayName: text("display_name").notNull(), // PROD_DES
  sizeDes: text("size_des"), // SIZE_DES (e.g. "200x120x4cm")
  unit: text("unit"), // UNIT (EA, kg, …)
  barCode: text("bar_code"), // BAR_CODE
  prodType: text("prod_type"), // PROD_TYPE ('0','2','3','4' — service/material/product)

  classCd1: text("class_cd_1"), // CLASS_CD  (level-1 category code)
  classCd2: text("class_cd_2"), // CLASS_CD2
  classCd3: text("class_cd_3"), // CLASS_CD3

  // Ecount has 6 user-defined text fields + 10 numeric. Real data shows
  // this company uses: CONT1=size-marker, CONT2=color, CONT3=brand.
  // Labels live in app config, not the DB.
  cont1: text("cont1"),
  cont2: text("cont2"),
  cont3: text("cont3"),
  cont4: text("cont4"),
  cont5: text("cont5"),
  cont6: text("cont6"),

  inPriceKrw: numeric("in_price_krw", { precision: 14, scale: 4 }), // IN_PRICE
  outPriceKrw: numeric("out_price_krw", { precision: 14, scale: 4 }), // OUT_PRICE
  safeQty: numeric("safe_qty", { precision: 14, scale: 4 }), // SAFE_QTY (safety stock target)
  minQty: numeric("min_qty", { precision: 14, scale: 4 }), // MIN_QTY (min order qty)

  defaultWarehouse: text("default_warehouse"), // WH_CD
  custCode: text("cust_code"), // CUST (primary supplier code in Ecount)
  remarks: text("remarks"), // REMARKS

  // Full Ecount payload for safety — lets us add new mapped fields later
  // without re-syncing all 1500 items
  ecountRaw: jsonb("ecount_raw"),
  ecountSyncedAt: timestamp("ecount_synced_at", { withTimezone: true }),

  // --- Luna Story extensions (user-maintained, NOT touched by Ecount sync) -
  productId: integer("product_id").references(() => productsTable.id), // optional link to image-gen products
  weightG: integer("weight_g"),
  cartonUnits: integer("carton_units"),
  cartonLCm: numeric("carton_l_cm", { precision: 6, scale: 1 }),
  cartonWCm: numeric("carton_w_cm", { precision: 6, scale: 1 }),
  cartonHCm: numeric("carton_h_cm", { precision: 6, scale: 1 }),
  leadTimeDays: integer("lead_time_days").default(180),
  unitCostUsd: numeric("unit_cost_usd", { precision: 10, scale: 2 }), // factory USD cost (distinct from IN_PRICE which is KRW)
  notes: text("notes"),

  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertSkuSchema = createInsertSchema(skusTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertSku = z.infer<typeof insertSkuSchema>;
export type Sku = typeof skusTable.$inferSelect;
