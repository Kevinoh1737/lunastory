import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const guideImagesTable = pgTable("guide_images", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  fileName: text("file_name").notNull(),
  imageUrl: text("image_url").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGuideImageSchema = createInsertSchema(guideImagesTable).omit({ id: true, createdAt: true });
export type InsertGuideImage = z.infer<typeof insertGuideImageSchema>;
export type GuideImage = typeof guideImagesTable.$inferSelect;
