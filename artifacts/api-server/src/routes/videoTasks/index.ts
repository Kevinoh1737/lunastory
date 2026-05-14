import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, videoTasksTable, videosTable } from "@workspace/db";
import {
  CreateVideoTaskBody,
  UpdateVideoTaskBody,
  GetVideoTaskParams,
  UpdateVideoTaskParams,
  DeleteVideoTaskParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatVideoTask(row: typeof videoTasksTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/video-tasks", async (_req, res): Promise<void> => {
  try {
    const tasks = await db.select().from(videoTasksTable).orderBy(desc(videoTasksTable.createdAt));
    res.json(tasks.map(formatVideoTask));
  } catch (error: any) {
    console.error("listVideoTasks error:", error);
    res.status(500).json({ error: error?.message || "Failed to list video tasks" });
  }
});

router.post("/video-tasks", async (req, res): Promise<void> => {
  const parsed = CreateVideoTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [task] = await db
      .insert(videoTasksTable)
      .values({ name: parsed.data.name })
      .returning();
    res.status(201).json(formatVideoTask(task));
  } catch (error: any) {
    console.error("createVideoTask error:", error);
    res.status(500).json({ error: error?.message || "Failed to create video task" });
  }
});

router.get("/video-tasks/:id", async (req, res): Promise<void> => {
  const params = GetVideoTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  try {
    const [task] = await db
      .select()
      .from(videoTasksTable)
      .where(eq(videoTasksTable.id, params.data.id))
      .limit(1);
    if (!task) {
      res.status(404).json({ error: "Video task not found" });
      return;
    }
    res.json(formatVideoTask(task));
  } catch (error: any) {
    console.error("getVideoTask error:", error);
    res.status(500).json({ error: error?.message || "Failed to get video task" });
  }
});

router.patch("/video-tasks/:id", async (req, res): Promise<void> => {
  const params = UpdateVideoTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateVideoTaskBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  try {
    const updateData: Partial<typeof videoTasksTable.$inferInsert> = { updatedAt: new Date() };
    if (body.data.name !== undefined) updateData.name = body.data.name;

    const [task] = await db
      .update(videoTasksTable)
      .set(updateData)
      .where(eq(videoTasksTable.id, params.data.id))
      .returning();
    if (!task) {
      res.status(404).json({ error: "Video task not found" });
      return;
    }
    res.json(formatVideoTask(task));
  } catch (error: any) {
    console.error("updateVideoTask error:", error);
    res.status(500).json({ error: error?.message || "Failed to update video task" });
  }
});

router.delete("/video-tasks/:id", async (req, res): Promise<void> => {
  const params = DeleteVideoTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      const [task] = await tx
        .select()
        .from(videoTasksTable)
        .where(eq(videoTasksTable.id, params.data.id))
        .limit(1);
      if (!task) {
        throw Object.assign(new Error("Video task not found"), { statusCode: 404 });
      }

      await tx
        .update(videosTable)
        .set({ videoTaskId: null, updatedAt: new Date() })
        .where(eq(videosTable.videoTaskId, params.data.id));

      await tx.delete(videoTasksTable).where(eq(videoTasksTable.id, params.data.id));
    });

    res.sendStatus(204);
  } catch (error: any) {
    if (error?.statusCode === 404) {
      res.status(404).json({ error: "Video task not found" });
      return;
    }
    console.error("deleteVideoTask error:", error);
    res.status(500).json({ error: error?.message || "Failed to delete video task" });
  }
});

export default router;
