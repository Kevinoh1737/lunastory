import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, guideImagesTable } from "@workspace/db";
import { randomUUID } from "crypto";
import { uploadBuffer, deleteByPublicUrl } from "../lib/r2";
import {
  CreateGuideImageBody,
  ListGuideImagesResponseItem,
  ListGuideImagesResponse,
  ListGuideImagesQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/guide-images", async (req, res): Promise<void> => {
  const query = ListGuideImagesQueryParams.safeParse(req.query);

  try {
    if (query.success && query.data.type) {
      const images = await db
        .select()
        .from(guideImagesTable)
        .where(eq(guideImagesTable.type, query.data.type))
        .orderBy(guideImagesTable.createdAt);
      res.json(ListGuideImagesResponse.parse(images));
      return;
    }

    const images = await db.select().from(guideImagesTable).orderBy(guideImagesTable.createdAt);
    res.json(ListGuideImagesResponse.parse(images));
  } catch (err: unknown) {
    const cause = (err as any)?.cause?.message ?? "";
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[guide-images] GET failed:", msg, cause ? `| cause: ${cause}` : "");
    res.status(500).json({ error: "Failed to fetch guide images", detail: cause || msg });
  }
});

router.post("/guide-images", async (req, res): Promise<void> => {
  const parsed = CreateGuideImageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { type, imageBase64, name } = parsed.data;

  try {
    const fileName = `guide_${type}_${randomUUID()}.png`;
    const imageBuffer = Buffer.from(imageBase64, "base64");
    const imageUrl = await uploadBuffer(`guide-images/${fileName}`, imageBuffer, "image/png");

    const [image] = await db
      .insert(guideImagesTable)
      .values({ type, fileName, imageUrl, name })
      .returning();

    res.status(201).json(ListGuideImagesResponseItem.parse(image));
  } catch (err: unknown) {
    const cause = (err as any)?.cause?.message ?? "";
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[guide-images] POST failed:", msg, cause ? `| cause: ${cause}` : "");
    res.status(500).json({ error: "Failed to create guide image", detail: cause || msg });
  }
});

router.delete("/guide-images/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid guide image id" });
    return;
  }

  try {
    const [image] = await db
      .delete(guideImagesTable)
      .where(eq(guideImagesTable.id, id))
      .returning();

    if (!image) {
      res.status(404).json({ error: "Guide image not found" });
      return;
    }

    try {
      await deleteByPublicUrl(image.imageUrl);
    } catch (e) {
      console.warn("Failed to delete guide image object from R2:", e);
    }

    res.sendStatus(204);
  } catch (err: unknown) {
    const cause = (err as any)?.cause?.message ?? "";
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[guide-images] DELETE failed:", msg, cause ? `| cause: ${cause}` : "");
    res.status(500).json({ error: "Failed to delete guide image", detail: cause || msg });
  }
});

export default router;
