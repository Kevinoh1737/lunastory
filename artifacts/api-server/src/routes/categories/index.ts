import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, categoriesTable } from "@workspace/db";
import {
  ListCategoriesResponse,
  CreateCategoryBody,
  ListCategoriesResponseItem,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/categories", async (_req, res): Promise<void> => {
  const categories = await db
    .select()
    .from(categoriesTable)
    .orderBy(categoriesTable.id);

  res.json(ListCategoriesResponse.parse(categories));
});

router.post("/categories", async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, parentId } = parsed.data;

  const [category] = await db
    .insert(categoriesTable)
    .values({
      name,
      parentId: parentId || null,
    })
    .returning();

  res.status(201).json(ListCategoriesResponseItem.parse(category));
});

export default router;
