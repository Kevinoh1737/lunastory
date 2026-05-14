import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { videoTasksTable } from "./videoTasks";

export const videosTable = pgTable("videos", {
  id: serial("id").primaryKey(),
  videoTaskId: integer("video_task_id").references(() => videoTasksTable.id),
  name: text("name").notNull(),
  fileName: text("file_name").notNull(),
  videoUrl: text("video_url").notNull(),
  sourceType: text("source_type").notNull(),
  sourceImageUrl: text("source_image_url"),
  sourceVideoUrl: text("source_video_url"),
  prompt: text("prompt").notNull(),
  model: text("model").notNull(),
  replicatePredictionId: text("replicate_prediction_id"),
  status: text("status").notNull().default("generating"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVideoSchema = createInsertSchema(videosTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type Video = typeof videosTable.$inferSelect;
