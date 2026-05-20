import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";
import { skusTable } from "./skus";
import { suppliersTable } from "./suppliers";

/**
 * Many-to-many join: a SKU can be sourced from one or more suppliers.
 * Composite primary key on (sku_id, supplier_id).
 */
export const skuSuppliersTable = pgTable(
  "sku_suppliers",
  {
    skuId: integer("sku_id")
      .notNull()
      .references(() => skusTable.id, { onDelete: "cascade" }),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliersTable.id),
  },
  (t) => [primaryKey({ columns: [t.skuId, t.supplierId] })],
);

export type SkuSupplier = typeof skuSuppliersTable.$inferSelect;
