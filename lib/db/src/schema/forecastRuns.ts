import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * One row per LLM-assisted forecast call, kept for auditability.
 * `input_json` contains the structured prompt context (sales window, on-hand,
 * notes); `output_json` contains the per-SKU recommended qty + reasoning.
 */
export const forecastRunsTable = pgTable("forecast_runs", {
  id: serial("id").primaryKey(),
  engine: text("engine").notNull(), // e.g. 'gemini-2.5-flash-v1'
  horizonDays: integer("horizon_days").notNull(),
  inputJson: jsonb("input_json").notNull(),
  outputJson: jsonb("output_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertForecastRunSchema = createInsertSchema(forecastRunsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertForecastRun = z.infer<typeof insertForecastRunSchema>;
export type ForecastRun = typeof forecastRunsTable.$inferSelect;
