import { pgTable, text, serial, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Sources of sales data. Seeded with:
 *   - 'ecount' — primary bridge during the Ecount-as-source-of-truth period
 *   - 'csv'    — manual CSV fallback / one-off backfills
 * Codes 'cafe24' / 'naver' / 'coupang' are reserved for direct channel
 * integrations after the Ecount cutover.
 */
export const channelsTable = pgTable("channels", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  displayName: text("display_name").notNull(),
  active: boolean("active").notNull().default(true),
});

export const insertChannelSchema = createInsertSchema(channelsTable).omit({ id: true });
export type InsertChannel = z.infer<typeof insertChannelSchema>;
export type Channel = typeof channelsTable.$inferSelect;
