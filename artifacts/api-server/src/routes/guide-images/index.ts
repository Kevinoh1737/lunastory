import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, guideImagesTable } from "@workspace/db";
import multer from "multer";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  ListGuideImagesQueryParams,
  ListGuideImagesResponse,
  ListGuideImagesResponseItem,
  DeleteGuideImageParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const VALID_TYPES = ["product", "mood", "model"] as const;
type GuideImageType = typeof VALID_TYPES[number];

function parseGuideImageType(value: unknown): GuideImageType | null {
  if (typeof value === "string" && VALID_TYPES.includes(value as GuideImageType)) {
    return value as GuideImageType;
  }
  return null;
}

const uploadsDir = path.resolve("uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({ dest: uploadsDir });

router.get("/guide-images", async (req, res): Promise<void> => {
  const query = ListGuideImagesQueryParams.safeParse(req.query);
  const conditions = [];
  if (query.success && query.data.type) {
    conditions.push(eq(guideImagesTable.type, query.data.type));
  }
  const images = await db
    .select()
    .from(guideImagesTable)
    .where(conditions.length > 0 ? conditions[0] : undefined)
    .orderBy(guideImagesTable.createdAt);
  res.json(ListGuideImagesResponse.parse(images));
});

router.post(
  "/guide-images",
  upload.single("file"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }
    const type = parseGuideImageType(req.body.type);
    if (!type) {
      fs.unlinkSync(req.file.path);
      res.status(400).json({ error: "type must be one of: product, mood, model" });
      return;
    }

    const name = typeof req.body.name === "string" && req.body.name.trim() ? req.body.name.trim() : undefined;

    const ext = path.extname(req.file.originalname) || ".png";
    const fileName = `guide_${type}_${randomUUID()}${ext}`;
    const newPath = path.join(uploadsDir, fileName);
    fs.renameSync(req.file.path, newPath);

    const imageUrl = `/api/uploads/${fileName}`;

    const [image] = await db
      .insert(guideImagesTable)
      .values({
        type,
        fileName,
        imageUrl,
        name,
      })
      .returning();

    res.status(201).json(ListGuideImagesResponseItem.parse(image));
  }
);

router.delete("/guide-images/:id", async (req, res): Promise<void> => {
  const params = DeleteGuideImageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [image] = await db
    .delete(guideImagesTable)
    .where(eq(guideImagesTable.id, params.data.id))
    .returning();
  if (!image) {
    res.status(404).json({ error: "Guide image not found" });
    return;
  }
  const filePath = path.join(uploadsDir, image.fileName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  res.sendStatus(204);
});

export default router;
