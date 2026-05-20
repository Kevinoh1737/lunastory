import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  numeric,
  date,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { channelsTable } from "./channels";
import { skusTable } from "./skus";

/**
 * One row per channel-sale-line, normalized across channels.
 * Deduped by (channel_id, external_id) so re-running an Ecount sync or
 * re-uploading a CSV is idempotent.
 */
export const salesRecordsTable = pgTable(
  "sales_records",
  {
    id: serial("id").primaryKey(),
    channelId: integer("channel_id")
      .notNull()
      .references(() => channelsTable.id),
    skuId: integer("sku_id").references(() => skusTable.id),
    externalId: text("external_id"),
    soldAt: date("sold_at").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceKrw: numeric("unit_price_krw", { precision: 10, scale: 0 }),
    isRefund: boolean("is_refund").notNull().default(false),
    rawPayload: jsonb("raw_payload"),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sales_records_channel_external_uq").on(t.channelId, t.externalId),
    index("sales_records_sku_date_idx").on(t.skuId, t.soldAt),
  ],
);

export const insertSalesRecordSchema = createInsertSchema(salesRecordsTable).omit({
  id: true,
  importedAt: true,
});
export type InsertSalesRecord = z.infer<typeof insertSalesRecordSchema>;
export type SalesRecord = typeof salesRecordsTable.$inferSelect;
