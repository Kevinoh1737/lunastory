import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, videosTable } from "@workspace/db";
import { ListVideosQueryParams } from "@workspace/api-zod";
import multer from "multer";
import fs from "fs";
import path from "path";
import { randomUUID, createHmac } from "crypto";
import {
  uploadBuffer,
  deleteByPublicUrl,
  fetchR2ObjectAsBase64,
  isR2Url,
} from "../../lib/r2";
import {
  GoogleGenAI,
  type GenerateVideosOperation,
} from "@google/genai";
import {
  GenerateVideoBody,
  UpdateVideoBody,
  UpdateVideoParams,
  DeleteVideoParams,
  GetVideoStatusParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const uploadsDir = path.resolve("uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  dest: uploadsDir,
  fileFilter: (_req, file, cb) => {
    const allowed = ["video/mp4", "video/quicktime", "video/mov"];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp4|mov)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Only mp4 and mov video files are allowed"));
    }
  },
});

const uploadImage = multer({
  dest: uploadsDir,
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(jpg|jpeg|png|webp)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Only jpg, png, and webp image files are allowed"));
    }
  },
});

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY;
const KLING_API_KEY = process.env.KLING_API_KEY;
const KLING_API_SECRET = process.env.KLING_API_SECRET;
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;

// ─── Runway Gen-4 Turbo ──────────────────────────────────────────────────────

async function runwayCreateTask(prompt: string, imageUrl: string, durationSeconds: number = 5): Promise<{ id: string }> {
  const res = await fetch("https://api.dev.runwayml.com/v1/image_to_video", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RUNWAY_API_KEY}`,
      "Content-Type": "application/json",
      "X-Runway-Version": "2024-11-06",
    },
    body: JSON.stringify({
      model: "gen4_turbo",
      promptImage: imageUrl,
      promptText: prompt,
      ratio: "1280:720",
      duration: durationSeconds >= 10 ? 10 : 5,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Runway API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<{ id: string }>;
}

async function runwayGetTask(taskId: string): Promise<{
  id: string;
  status: string;
  output?: string[];
  failure?: string;
  failureCode?: string;
}> {
  const res = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
    headers: {
      Authorization: `Bearer ${RUNWAY_API_KEY}`,
      "X-Runway-Version": "2024-11-06",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Runway API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<{ id: string; status: string; output?: string[]; failure?: string; failureCode?: string }>;
}

// ─── Kling AI 2.0 ────────────────────────────────────────────────────────────

function buildKlingJwt(): string {
  const apiKey = KLING_API_KEY!;
  const apiSecret = KLING_API_SECRET!;
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ iss: apiKey, exp: now + 1800, nbf: now - 5 })
  ).toString("base64url");
  const sig = createHmac("sha256", apiSecret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}

async function klingCreateTask(
  sourceType: "i2v" | "v2v",
  prompt: string,
  sourceUrl: string,
  durationSeconds: number = 5
): Promise<{ task_id: string }> {
  const endpoint =
    sourceType === "i2v"
      ? "https://api.klingai.com/v1/videos/image2video"
      : "https://api.klingai.com/v1/videos/video2video";
  const modelName =
    sourceType === "i2v"
      ? "kling-v2-5-image-to-video-master"
      : "kling-v2-5-video-to-video";

  const bodyData: Record<string, unknown> = {
    model_name: modelName,
    prompt,
    cfg_scale: 0.5,
    mode: "std",
    duration: String(durationSeconds >= 10 ? 10 : 5),
  };
  if (sourceType === "i2v") {
    bodyData.image_url = sourceUrl;
  } else {
    bodyData.video_url = sourceUrl;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${buildKlingJwt()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(bodyData),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kling API error ${res.status}: ${text}`);
  }
  const json = await res.json() as { code: number; message: string; data: { task_id: string } };
  if (json.code !== 0) {
    throw new Error(`Kling API error: ${json.message}`);
  }
  return { task_id: json.data.task_id };
}

async function klingGetTask(
  taskId: string,
  sourceType: "i2v" | "v2v"
): Promise<{
  task_id: string;
  task_status: string;
  task_status_msg?: string;
  task_result?: { videos?: Array<{ url: string }> };
}> {
  const endpoint =
    sourceType === "i2v"
      ? `https://api.klingai.com/v1/videos/image2video/${taskId}`
      : `https://api.klingai.com/v1/videos/video2video/${taskId}`;

  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${buildKlingJwt()}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kling API error ${res.status}: ${text}`);
  }
  const json = await res.json() as {
    code: number;
    message: string;
    data: {
      task_id: string;
      task_status: string;
      task_status_msg?: string;
      task_result?: { videos?: Array<{ url: string }> };
    };
  };
  if (json.code !== 0) {
    throw new Error(`Kling API error: ${json.message}`);
  }
  return json.data;
}

// ─── Google Veo 3.1 ─────────────────────────────────────────────────────────

const VEO_MODEL_ID = "veo-3.1-generate-preview";

async function veoCreateOperation(
  prompt: string,
  sourceType: "i2v" | "v2v",
  durationSeconds: number = 5,
  imageBytes?: string,
  imageMimeType?: string,
  videoUri?: string
): Promise<{ operationName: string }> {
  const googleAI = new GoogleGenAI({ apiKey: GOOGLE_AI_API_KEY });

  const params: Parameters<typeof googleAI.models.generateVideos>[0] = {
    model: VEO_MODEL_ID,
    prompt,
    config: { aspectRatio: "16:9", numberOfVideos: 1, durationSeconds: Math.min(Math.max(durationSeconds, 5), 8) },
  };

  if (sourceType === "i2v" && imageBytes) {
    params.image = { imageBytes, mimeType: imageMimeType ?? "image/jpeg" };
  } else if (sourceType === "v2v" && videoUri) {
    params.video = { uri: videoUri };
  }

  const operation: GenerateVideosOperation = await googleAI.models.generateVideos(params);
  if (!operation.name) throw new Error("Veo operation returned no name");
  return { operationName: operation.name };
}

const VEO_SAFETY_KEYWORDS = ["safety", "policy", "content policy", "cannot generate", "unable to generate", "not generate", "prohibited"];

function isVeoSafetyError(message: string): boolean {
  const lower = message.toLowerCase();
  return VEO_SAFETY_KEYWORDS.some((kw) => lower.includes(kw));
}

function formatVeoErrorMessage(rawMessage: string): string {
  if (isVeoSafetyError(rawMessage)) {
    return "Veo 안전 정책에 의해 거절되었습니다. 아동·성인 콘텐츠는 Veo에서 생성할 수 없습니다. Kling 모델을 사용해주세요.";
  }
  return rawMessage;
}

async function veoGetOperation(operationName: string): Promise<{
  done: boolean;
  videos?: Array<{ uri: string }>;
  error?: { message: string };
}> {
  if (!GOOGLE_AI_API_KEY) throw new Error("GOOGLE_AI_API_KEY not set");

  const url = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${GOOGLE_AI_API_KEY}`;
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Veo operation poll failed ${res.status}: ${text}`);
  }

  const op = await res.json() as {
    name?: string;
    done?: boolean;
    error?: { message?: string; code?: number };
    response?: {
      generatedVideos?: Array<{ video?: { uri?: string } }>;
    };
  };

  if (!op.done) return { done: false };

  if (op.error) {
    const rawMsg = op.error.message ?? "Veo failed";
    return { done: true, error: { message: formatVeoErrorMessage(rawMsg) } };
  }

  const uris = (op.response?.generatedVideos ?? [])
    .map((gv) => gv.video?.uri ?? "")
    .filter(Boolean);
  return { done: true, videos: uris.map((uri) => ({ uri })) };
}

// ─── Veo cinematic prompt rewriter ───────────────────────────────────────────

const VEO_REWRITE_SYSTEM_PROMPT = `You are a Veo 3.1 cinematic prompt engineer. Your task is to rewrite a user's short video prompt into a rich, detailed cinematic prompt optimized for Veo 3.1 video generation.

The rewritten prompt must include all applicable elements from this list:
- Camera movement and angle (e.g., slow dolly-in, bird's-eye, low-angle tracking shot)
- Lens type and focal length (e.g., 85mm portrait lens, wide-angle 24mm)
- Lighting style (e.g., golden hour rim light, soft diffused studio light, dramatic chiaroscuro)
- Subject motion and behavior
- Scene composition and depth of field
- Film/video style (e.g., cinematic 4K, anamorphic, handheld documentary, slow motion 120fps)
- Color grading and mood (e.g., warm amber tones, desaturated noir palette)
- Atmosphere and environment details

Rules:
- Output ONLY the rewritten cinematic prompt. No explanations, no labels, no preambles.
- Write in English regardless of the input language.
- Keep under 300 words.
- Preserve the original subject and intent exactly.`;

async function rewritePromptForVeo(
  userPrompt: string,
  sourceType: "i2v" | "v2v"
): Promise<string> {
  if (!GOOGLE_AI_API_KEY) return userPrompt;
  try {
    const googleAI = new GoogleGenAI({ apiKey: GOOGLE_AI_API_KEY });
    const context =
      sourceType === "v2v"
        ? "The user wants to transform an existing video clip."
        : "The user wants to generate a video from a reference image.";
    const response = await googleAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${context}\n\nUser prompt: ${userPrompt}\n\nRewrite this into a cinematic Veo 3.1 prompt:`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: VEO_REWRITE_SYSTEM_PROMPT,
        temperature: 0.7,
      },
    });
    const rewritten = response.text?.trim();
    if (!rewritten) {
      console.warn("[veo-rewrite] Gemini returned empty response; using original prompt");
      return userPrompt;
    }
    return rewritten;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[veo-rewrite] Failed to rewrite prompt, falling back to original:", msg);
    return userPrompt;
  }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Downloads a finished video from an external model URL and re-hosts it in R2.
 * Returns the basename (stored in `videos.fileName`) and the public R2 URL.
 */
async function downloadVideoToR2(videoUrl: string): Promise<{ fileName: string; publicUrl: string }> {
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Failed to download video: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const fileName = `video_${randomUUID()}.mp4`;
  const publicUrl = await uploadBuffer(`videos/${fileName}`, buffer, "video/mp4");
  return { fileName, publicUrl };
}

function formatVideoRow(row: typeof videosTable.$inferSelect) {
  return {
    id: row.id,
    videoTaskId: row.videoTaskId ?? null,
    name: row.name,
    fileName: row.fileName,
    videoUrl: row.videoUrl,
    sourceType: row.sourceType,
    sourceImageUrl: row.sourceImageUrl ?? null,
    sourceVideoUrl: row.sourceVideoUrl ?? null,
    prompt: row.prompt,
    model: row.model,
    replicatePredictionId: row.replicatePredictionId ?? null,
    status: row.status,
    errorMessage: row.errorMessage ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Reads an R2-hosted image and returns its raw base64 bytes and MIME type.
 * Used for APIs (like Veo via Gemini) that require raw image bytes rather than
 * a public URL. Returns null if the URL is not an R2 URL (also an SSRF guard —
 * only our own bucket is ever fetched).
 */
async function readImageAsBytes(
  imageUrl: string
): Promise<{ imageBytes: string; mimeType: string } | null> {
  const result = await fetchR2ObjectAsBase64(imageUrl);
  if (!result) return null;
  return { imageBytes: result.base64, mimeType: result.mimeType };
}

/**
 * Resolves a source file URL to one that external video APIs (Runway/Kling)
 * can fetch. R2-hosted source files are already publicly accessible, so they
 * (and any other absolute URL) are returned as-is. Legacy `/api/uploads/`
 * paths are no longer supported — those files were never migrated to R2.
 */
async function resolveSourceUrlForExternalApi(fileUrl: string): Promise<string | null> {
  if (isR2Url(fileUrl)) return fileUrl;
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  console.warn(`[upload] Source URL is not an R2 or absolute URL, cannot resolve: ${fileUrl}`);
  return null;
}

// ─── Veo consecutive-poll-error tracking ─────────────────────────────────────
// In-memory counter keyed by video DB id. Resets to 0 on any successful poll.
// If the server restarts the counter resets — videos will retry rather than
// stay stuck, which is the safe direction.
const veoPollErrorCount = new Map<number, number>();
const VEO_MAX_CONSECUTIVE_ERRORS = 3;

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/videos", async (req, res): Promise<void> => {
  try {
    const query = ListVideosQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const videoTaskId = query.data.videoTaskId != null ? Number(query.data.videoTaskId) : null;
    const baseQuery = db.select().from(videosTable).orderBy(desc(videosTable.createdAt));
    const videos = videoTaskId != null
      ? await baseQuery.where(eq(videosTable.videoTaskId, videoTaskId))
      : await baseQuery;
    res.json(videos.map(formatVideoRow));
  } catch (error: any) {
    console.error("listVideos error:", error);
    res.status(500).json({ error: error?.message || "Failed to list videos" });
  }
});

router.post("/videos/generate-comparison", async (req, res): Promise<void> => {
  const parsed = GenerateVideoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { sourceType, prompt, sourceImageUrl, sourceVideoUrl, name, videoTaskId, models: requestedModels, durationSeconds = 5 } = parsed.data;

  if (sourceType === "i2v" && !sourceImageUrl) {
    res.status(400).json({ error: "sourceImageUrl is required for i2v comparison" });
    return;
  }
  if (sourceType === "v2v" && !sourceVideoUrl) {
    res.status(400).json({ error: "sourceVideoUrl is required for v2v comparison" });
    return;
  }

  const initialName = name?.trim() || `비교_${new Date().toLocaleDateString("ko-KR")}`;

  // Determine which adapters are active, optionally restricted by requestedModels.
  const runwayActive = !!(RUNWAY_API_KEY && sourceType === "i2v" && sourceImageUrl)
    && (!requestedModels || requestedModels.includes("runway-gen4-turbo"));
  const klingActive = !!(KLING_API_KEY && KLING_API_SECRET)
    && (!requestedModels || requestedModels.includes("kling-2.0"));
  const veoActive = !!GOOGLE_AI_API_KEY
    && (!requestedModels || requestedModels.includes("veo-3.1"));

  // All models that need a public URL (Runway, Kling, Veo v2v) share one GCS upload.
  // Veo i2v is the only case that still requires raw image bytes (Gemini API limitation:
  // gcsUri is not supported for image inputs).
  const needsPublicUrl = (runwayActive || klingActive || (veoActive && sourceType === "v2v"));
  const needsImageBytes = veoActive && sourceType === "i2v" && !!sourceImageUrl;

  let publicSourceUrl: string | null = null;
  let veoImageInput: { imageBytes: string; mimeType: string } | null = null;

  if (needsPublicUrl) {
    try {
      const rawUrl = sourceType === "i2v" ? sourceImageUrl! : sourceVideoUrl!;
      publicSourceUrl = await resolveSourceUrlForExternalApi(rawUrl);
      if (!publicSourceUrl) {
        console.warn("[upload] Could not resolve source to a public URL; models requiring a public URL will be skipped");
      }
    } catch (error: any) {
      console.warn("[upload] Skipping public-URL models due to upload error:", error?.message);
    }
  }

  if (needsImageBytes && sourceImageUrl) {
    try {
      // Veo i2v (Gemini API) requires raw image bytes; it does not support public URL inputs.
      // We only read bytes from our own R2 bucket to avoid SSRF.
      // If sourceImageUrl is not an R2 URL, Veo i2v will be skipped.
      veoImageInput = await readImageAsBytes(sourceImageUrl);
      if (!veoImageInput) {
        console.warn("[veo] Cannot read image bytes for Veo i2v: source is not an R2 URL. Veo i2v will be skipped.");
      }
    } catch (error: any) {
      console.warn("[veo] Could not load image bytes for Veo i2v:", error?.message);
    }
  }

  // Veo gets a Gemini-rewritten cinematic prompt; Runway and Kling keep the user's original.
  const veoPrompt = veoActive
    ? await rewritePromptForVeo(prompt, sourceType)
    : prompt;

  type AdapterResult = { model: string; predictionId: string; usedPrompt: string };
  const tasks: Array<Promise<AdapterResult>> = [];

  // Runway: i2v only — uses public signed URL (avoids base64 memory overhead)
  if (runwayActive && publicSourceUrl) {
    tasks.push(
      runwayCreateTask(prompt, publicSourceUrl, durationSeconds)
        .then((t) => ({ model: "runway-gen4-turbo", predictionId: t.id, usedPrompt: prompt }))
    );
  }

  // Kling: i2v and v2v — uses public signed URL
  if (klingActive && publicSourceUrl) {
    tasks.push(
      klingCreateTask(sourceType, prompt, publicSourceUrl, durationSeconds)
        .then((t) => ({ model: "kling-2.0", predictionId: t.task_id, usedPrompt: prompt }))
    );
  }

  // Veo: i2v uses raw image bytes (Gemini API limitation); v2v uses public signed URL via video.uri
  // Uses the Gemini-rewritten cinematic prompt for better Veo results.
  if (veoActive) {
    const hasI2vInput = sourceType === "i2v" && !!veoImageInput;
    const hasV2vInput = sourceType === "v2v" && !!publicSourceUrl;
    if (hasI2vInput || hasV2vInput) {
      tasks.push(
        veoCreateOperation(
          veoPrompt,
          sourceType,
          durationSeconds,
          veoImageInput?.imageBytes,
          veoImageInput?.mimeType,
          sourceType === "v2v" ? publicSourceUrl ?? undefined : undefined
        ).then((t) => ({ model: "veo-3.1", predictionId: t.operationName, usedPrompt: veoPrompt }))
      );
    }
  }

  if (tasks.length === 0) {
    res.status(400).json({
      error:
        "No comparison jobs could be started. Check that at least one model API key is configured " +
        "(RUNWAY_API_KEY, KLING_API_KEY, GOOGLE_AI_API_KEY) and that the source media URL " +
        "is a valid R2 or absolute URL.",
    });
    return;
  }

  const results = await Promise.allSettled(tasks);
  const insertedVideos: (typeof videosTable.$inferSelect)[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      const { model, predictionId, usedPrompt } = result.value;
      try {
        const [video] = await db
          .insert(videosTable)
          .values({
            name: `${initialName} [${model}]`,
            fileName: "",
            videoUrl: "",
            sourceType,
            sourceImageUrl: sourceImageUrl || null,
            sourceVideoUrl: sourceVideoUrl || null,
            prompt: usedPrompt,
            model,
            replicatePredictionId: predictionId,
            status: "generating",
            videoTaskId: videoTaskId ?? null,
          })
          .returning();
        insertedVideos.push(video);
      } catch (dbErr: any) {
        console.error(`DB insert failed for model ${model}:`, dbErr);
      }
    } else {
      console.error("Comparison adapter error:", result.reason);
    }
  }

  if (insertedVideos.length === 0) {
    const errors = results
      .filter((r) => r.status === "rejected")
      .map((r) => (r as PromiseRejectedResult).reason?.message || "Unknown error")
      .join("; ");
    res.status(400).json({ error: "All models failed: " + errors });
    return;
  }

  res.status(201).json(insertedVideos.map(formatVideoRow));
});

router.post("/videos/upload-source-image", uploadImage.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  try {
    const ext = path.extname(req.file.originalname) || ".jpg";
    const fileName = `source_image_${randomUUID()}${ext}`;
    const buffer = fs.readFileSync(req.file.path);
    const url = await uploadBuffer(
      `video-sources/${fileName}`,
      buffer,
      req.file.mimetype || "image/jpeg",
    );
    fs.unlinkSync(req.file.path);
    res.json({ url, fileName });
  } catch (error: any) {
    console.error("uploadSourceImage error:", error);
    res.status(500).json({ error: error?.message || "Failed to upload image" });
  }
});

router.post("/videos/upload-source", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  try {
    const ext = path.extname(req.file.originalname) || ".mp4";
    const fileName = `source_video_${randomUUID()}${ext}`;
    const buffer = fs.readFileSync(req.file.path);
    const url = await uploadBuffer(
      `video-sources/${fileName}`,
      buffer,
      req.file.mimetype || "video/mp4",
    );
    fs.unlinkSync(req.file.path);
    res.json({ url, fileName });
  } catch (error: any) {
    console.error("uploadSourceVideo error:", error);
    res.status(500).json({ error: error?.message || "Failed to upload video" });
  }
});

router.get("/videos/:id/status", async (req, res): Promise<void> => {
  const params = GetVideoStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  try {
    const [video] = await db.select().from(videosTable).where(eq(videosTable.id, params.data.id)).limit(1);
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    if (video.status !== "generating" || !video.replicatePredictionId) {
      res.json(formatVideoRow(video));
      return;
    }

    const model = video.model;

    // ── Runway ────────────────────────────────────────────────────────────
    if (model === "runway-gen4-turbo") {
      if (!RUNWAY_API_KEY) { res.json(formatVideoRow(video)); return; }
      const task = await runwayGetTask(video.replicatePredictionId);
      if (task.status === "SUCCEEDED") {
        const outputUrl = task.output?.[0];
        if (!outputUrl) {
          const [u] = await db.update(videosTable).set({ status: "error", errorMessage: "No output URL", updatedAt: new Date() }).where(eq(videosTable.id, video.id)).returning();
          res.json(formatVideoRow(u)); return;
        }
        const { fileName, publicUrl } = await downloadVideoToR2(outputUrl);
        const [u] = await db.update(videosTable).set({ status: "done", fileName, videoUrl: publicUrl, updatedAt: new Date() }).where(eq(videosTable.id, video.id)).returning();
        res.json(formatVideoRow(u));
      } else if (task.status === "FAILED") {
        const [u] = await db.update(videosTable).set({ status: "error", errorMessage: task.failure || task.failureCode || "Runway failed", updatedAt: new Date() }).where(eq(videosTable.id, video.id)).returning();
        res.json(formatVideoRow(u));
      } else {
        res.json(formatVideoRow(video));
      }
      return;
    }

    // ── Kling ─────────────────────────────────────────────────────────────
    if (model === "kling-2.0") {
      if (!KLING_API_KEY || !KLING_API_SECRET) { res.json(formatVideoRow(video)); return; }
      const srcType = (video.sourceType || "i2v") as "i2v" | "v2v";
      const task = await klingGetTask(video.replicatePredictionId, srcType);
      if (task.task_status === "succeed") {
        const outputUrl = task.task_result?.videos?.[0]?.url;
        if (!outputUrl) {
          const [u] = await db.update(videosTable).set({ status: "error", errorMessage: "No output URL", updatedAt: new Date() }).where(eq(videosTable.id, video.id)).returning();
          res.json(formatVideoRow(u)); return;
        }
        const { fileName, publicUrl } = await downloadVideoToR2(outputUrl);
        const [u] = await db.update(videosTable).set({ status: "done", fileName, videoUrl: publicUrl, updatedAt: new Date() }).where(eq(videosTable.id, video.id)).returning();
        res.json(formatVideoRow(u));
      } else if (task.task_status === "failed") {
        const [u] = await db.update(videosTable).set({ status: "error", errorMessage: task.task_status_msg || "Kling failed", updatedAt: new Date() }).where(eq(videosTable.id, video.id)).returning();
        res.json(formatVideoRow(u));
      } else {
        res.json(formatVideoRow(video));
      }
      return;
    }

    // ── Veo ───────────────────────────────────────────────────────────────
    if (model === "veo-2.0" || model === "veo-3.1") {
      if (!GOOGLE_AI_API_KEY) { res.json(formatVideoRow(video)); return; }
      let opResult: Awaited<ReturnType<typeof veoGetOperation>>;
      try {
        opResult = await veoGetOperation(video.replicatePredictionId);
        // Successful poll — reset consecutive error counter
        veoPollErrorCount.delete(video.id);
      } catch (veoErr: any) {
        const errMsg = veoErr?.message || "Veo 상태 조회 실패";
        const prev = veoPollErrorCount.get(video.id) ?? 0;
        const next = prev + 1;
        veoPollErrorCount.set(video.id, next);
        console.error(`[veo-poll] Poll error (${next}/${VEO_MAX_CONSECUTIVE_ERRORS}):`, errMsg);
        if (next >= VEO_MAX_CONSECUTIVE_ERRORS) {
          veoPollErrorCount.delete(video.id);
          const [u] = await db
            .update(videosTable)
            .set({ status: "error", errorMessage: `Veo 상태 조회 ${VEO_MAX_CONSECUTIVE_ERRORS}회 연속 실패: ${errMsg}`, updatedAt: new Date() })
            .where(eq(videosTable.id, video.id))
            .returning();
          res.json(formatVideoRow(u));
        } else {
          // Transient error — keep generating, return current row so frontend keeps polling
          res.json(formatVideoRow(video));
        }
        return;
      }
      if (opResult.done) {
        if (opResult.error) {
          const [u] = await db.update(videosTable).set({ status: "error", errorMessage: opResult.error.message, updatedAt: new Date() }).where(eq(videosTable.id, video.id)).returning();
          res.json(formatVideoRow(u)); return;
        }
        const outputUrl = opResult.videos?.[0]?.uri;
        if (!outputUrl) {
          const [u] = await db.update(videosTable).set({ status: "error", errorMessage: "No output URI from Veo", updatedAt: new Date() }).where(eq(videosTable.id, video.id)).returning();
          res.json(formatVideoRow(u)); return;
        }
        const { fileName, publicUrl } = await downloadVideoToR2(outputUrl);
        const [u] = await db.update(videosTable).set({ status: "done", fileName, videoUrl: publicUrl, updatedAt: new Date() }).where(eq(videosTable.id, video.id)).returning();
        res.json(formatVideoRow(u));
      } else {
        res.json(formatVideoRow(video));
      }
      return;
    }

    res.json(formatVideoRow(video));
  } catch (error: any) {
    console.error("getVideoStatus error:", error);
    res.status(500).json({ error: error?.message || "Failed to get video status" });
  }
});

router.patch("/videos/:id", async (req, res): Promise<void> => {
  const params = UpdateVideoParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateVideoBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  try {
    const updateData: Partial<typeof videosTable.$inferInsert> = { updatedAt: new Date() };
    if (body.data.name !== undefined) updateData.name = body.data.name;
    const [video] = await db.update(videosTable).set(updateData).where(eq(videosTable.id, params.data.id)).returning();
    if (!video) { res.status(404).json({ error: "Video not found" }); return; }
    res.json(formatVideoRow(video));
  } catch (error: any) {
    console.error("updateVideo error:", error);
    res.status(500).json({ error: error?.message || "Failed to update video" });
  }
});

router.delete("/videos/:id", async (req, res): Promise<void> => {
  const params = DeleteVideoParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  try {
    const [video] = await db.delete(videosTable).where(eq(videosTable.id, params.data.id)).returning();
    if (!video) { res.status(404).json({ error: "Video not found" }); return; }
    if (video.videoUrl) {
      try {
        await deleteByPublicUrl(video.videoUrl);
      } catch (e) {
        console.warn("Failed to delete video object from R2:", e);
      }
    }
    res.sendStatus(204);
  } catch (error: any) {
    console.error("deleteVideo error:", error);
    res.status(500).json({ error: error?.message || "Failed to delete video" });
  }
});

export default router;
