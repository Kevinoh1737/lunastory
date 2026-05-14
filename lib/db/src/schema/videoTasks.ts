import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const videoTasksTable = pgTable("video_tasks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVideoTaskSchema = createInsertSchema(videoTasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVideoTask = z.infer<typeof insertVideoTaskSchema>;
export type VideoTask = typeof videoTasksTable.$inferSelect;
