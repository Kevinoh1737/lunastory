import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Small key/value store for app-wide flags. Key `'source_of_truth'` carries
 * the Ecount → Luna Story handoff state:
 *   { "value": "ecount" }    (initial — Ecount is authoritative)
 *   { "value": "lunastory" } (after cutover — our DB is authoritative)
 */
export const systemSettingsTable = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertSystemSettingSchema = createInsertSchema(systemSettingsTable).omit({
  updatedAt: true,
});
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type SystemSetting = typeof systemSettingsTable.$inferSelect;
