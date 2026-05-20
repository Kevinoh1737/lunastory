import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Per-resource cursor for the nightly Ecount sync. One row per resource
 * ('skus' | 'inventory' | 'sales'). PK on `resource` so upserts are easy.
 */
export const ecountSyncStateTable = pgTable("ecount_sync_state", {
  resource: text("resource").primaryKey(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastCursor: text("last_cursor"),
  lastError: text("last_error"),
  lastRunId: text("last_run_id"),
});

export const insertEcountSyncStateSchema = createInsertSchema(ecountSyncStateTable);
export type InsertEcountSyncState = z.infer<typeof insertEcountSyncStateSchema>;
export type EcountSyncState = typeof ecountSyncStateTable.$inferSelect;
