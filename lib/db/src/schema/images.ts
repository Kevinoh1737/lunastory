import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { tasksTable } from "./tasks";

export const imagesTable = pgTable("images", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => productsTable.id),
  taskId: integer("task_id").references(() => tasksTable.id),
  tag: text("tag").notNull(),
  fileName: text("file_name").notNull(),
  imageUrl: text("image_url").notNull(),
  prompt: text("prompt").notNull(),
  model: text("model").notNull(),
  overlayText: text("overlay_text"),
  status: text("status").notNull().default("draft"),
  parentId: integer("parent_id").references(() => imagesTable.id),
  variationGroupId: text("variation_group_id"),
  variationIndex: integer("variation_index"),
  maskData: text("mask_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertImageSchema = createInsertSchema(imagesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertImage = z.infer<typeof insertImageSchema>;
export type Image = typeof imagesTable.$inferSelect;
