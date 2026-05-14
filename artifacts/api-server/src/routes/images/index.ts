import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, imagesTable, productsTable } from "@workspace/db";
import { GoogleGenAI, Modality, HarmCategory, HarmBlockThreshold } from "@google/genai";
import multer from "multer";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { uploadBuffer, deleteByPublicUrl } from "../../lib/r2";
import {
  GenerateGeminiImageBody,
  GenerateGeminiImageResponse,
  GenerateVariationsBody,
  GenerateVariationsResponse,
  AnalyzeProductRefBody,
  AnalyzeProductRefResponse,
  AnalyzeMoodRefBody,
  AnalyzeMoodRefResponse,
  AnalyzeModelRefBody,
  AnalyzeModelRefResponse,
  SuggestCopyBody,
  SuggestCopyResponse,
  ListImagesQueryParams,
  ListImagesResponse,
  ListImagesResponseItem,
  SaveImageBody,
  UpdateImageBody,
  UpdateImageResponse,
  UploadReferenceImageResponse,
  CameraTransformBody,
  CameraTransformResponse,
} from "@workspace/api-zod";
import {
  defaultPrompts,
  copySuggestionSystemPrompt,
  buildGeminiPrompt,
  resolveCategoryPromptKey,
  CATEGORY_PROMPTS,
  PRODUCT_ANALYSIS_SYSTEM_PROMPT,
  MOOD_ANALYSIS_SYSTEM_PROMPT,
  MODEL_ANALYSIS_SYSTEM_PROMPT,
  enhanceUserPromptForGeneration,
  enhanceUserPromptForInpainting,
  CAMERA_TRANSFORM_ANALYSIS_PROMPT,
  buildCameraTransformPrompt,
  validateGeneratedImage,
} from "../../lib/prompts";

const router: IRouter = Router();

const uploadsDir = path.resolve("uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({ dest: uploadsDir });

const googleAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
const vlmAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_VLM_API_KEY || process.env.GOOGLE_AI_API_KEY });

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`[Timeout] ${label} exceeded ${ms / 1000}s`)), ms)
    ),
  ]);
}

console.log("[images] AI key presence check:", {
  GOOGLE_AI_API_KEY: !!process.env.GOOGLE_AI_API_KEY,
  GOOGLE_AI_VLM_API_KEY: !!process.env.GOOGLE_AI_VLM_API_KEY,
  vlmUsingDedicatedKey: !!process.env.GOOGLE_AI_VLM_API_KEY,
});

router.post("/images/generate-gemini", async (req, res): Promise<void> => {
  const parsed = GenerateGeminiImageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    prompt,
    tag,
    referenceImages,
    productId,
    productAnalysis,
    productAnalyses,
    moodAnalysis,
    modelAnalyses,
    isInpainting,
    preExpandedUserPrompt,
    imageSize,
    iterationBaseImage,
  } = parsed.data;

  try {
    let productCategory: string | undefined;
    let productInfo: { name: string; description: string } | undefined;
    if (productId) {
      const [product] = await db
        .select({
          name: productsTable.name,
          description: productsTable.description,
          category: productsTable.category,
        })
        .from(productsTable)
        .where(eq(productsTable.id, productId))
        .limit(1);
      if (product) {
        productCategory = product.category;
        productInfo = { name: product.name, description: product.description };
      }
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY || "";
    const userPromptExpanded = preExpandedUserPrompt
      ?? (isInpainting
        ? await enhanceUserPromptForInpainting(prompt, apiKey)
        : await enhanceUserPromptForGeneration(prompt, apiKey, iterationBaseImage ?? undefined));

    const enhancedPrompt = buildGeminiPrompt(userPromptExpanded, productCategory, productInfo, {
      productAnalyses,
      moodAnalysis,
      modelAnalyses,
      legacyProductAnalysis: productAnalysis,
    });
    const promptKey = productCategory ? resolveCategoryPromptKey(productCategory) : null;

    console.log("[generate-gemini] prompt:", prompt);
    console.log("[generate-gemini] userPromptExpanded:", userPromptExpanded);
    console.log("[generate-gemini] isInpainting:", isInpainting ?? false);
    console.log("[generate-gemini] preExpandedUserPrompt provided:", !!preExpandedUserPrompt);
    console.log("[generate-gemini] iterationBaseImage:", !!iterationBaseImage);
    console.log("[generate-gemini] productCategory:", productCategory || "none");
    console.log("[generate-gemini] promptKey:", promptKey || "none");
    console.log("[generate-gemini] referenceImages count:", referenceImages?.length || 0);

    const parts: any[] = [];

    if (iterationBaseImage) {
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: iterationBaseImage,
        },
      });
    }

    if (referenceImages && referenceImages.length > 0) {
      for (const imgBase64 of referenceImages) {
        parts.push({
          inlineData: {
            mimeType: "image/png",
            data: imgBase64,
          },
        });
      }
      const refLabel = referenceImages.length > 1
        ? "Using these product images as reference"
        : "Using this product image as reference";
      const iterationPrefix = iterationBaseImage
        ? "Generate new visual variations of this image, maintain its exact style, composition and subject matter: "
        : "";
      parts.push({ text: `${iterationPrefix}${refLabel}, ${enhancedPrompt}` });
    } else if (iterationBaseImage) {
      parts.push({ text: `Generate new visual variations of this image, maintain its exact style, composition and subject matter: ${enhancedPrompt}` });
    } else {
      parts.push({ text: enhancedPrompt });
    }

    const temperatures = [0.4, 0.6, 0.7];
    const maxAttempts = temperatures.length;
    let imageBase64 = "";
    let qualityGatePassed = true;
    let qualityGateAttempts = 0;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const temperature = temperatures[attempt];
      const response = await withTimeout(
        googleAI.models.generateContent({
          model: "gemini-3.1-flash-image-preview",
          contents: [{ role: "user", parts }],
          config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
            temperature,
            topP: 0.9,
            imageConfig: {
              aspectRatio: "3:4",
              imageSize: imageSize ?? "1K",
            },
            safetySettings: [
              {
                category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
              },
              {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
              },
            ],
          },
        }),
        90_000,
        `generate-gemini[attempt ${attempt + 1}]`
      );

      let candidateBase64 = "";
      if (response.candidates && response.candidates[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            candidateBase64 = part.inlineData.data || "";
            break;
          }
        }
      }
      imageBase64 = candidateBase64;
      qualityGateAttempts = attempt + 1;

      const gateResult = await validateGeneratedImage(imageBase64, prompt, apiKey, productCategory);
      console.log(`[quality-gate] attempt ${attempt + 1} ${gateResult.pass ? "PASS" : "FAIL"}: ${gateResult.reason}`);

      if (gateResult.pass) {
        qualityGatePassed = true;
        break;
      }

      qualityGatePassed = false;
      if (attempt < maxAttempts - 1) {
        console.log(`[quality-gate] Retrying generation (attempt ${attempt + 2})...`);
      }
    }

    res.json(
      GenerateGeminiImageResponse.parse({
        imageBase64,
        prompt,
        enhancedPrompt,
        userPromptExpanded,
        model: "gemini-3.1-flash-image",
        tag,
        qualityGatePassed,
        qualityGateAttempts,
      })
    );
  } catch (error: any) {
    console.error("Gemini generation error:", safeErrorMessage(error));
    res.status(500).json({ error: safeErrorMessage(error) || "Failed to generate image" });
  }
});

router.post("/images/generate-variations", async (req, res): Promise<void> => {
  const parsed = GenerateVariationsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    prompt,
    referenceImages,
    productId,
    productAnalysis,
    productAnalyses,
    moodAnalysis,
    modelAnalyses,
  } = parsed.data;

  try {
    let productCategory: string | undefined;
    let productInfo: { name: string; description: string } | undefined;
    if (productId) {
      const [product] = await db
        .select({
          name: productsTable.name,
          description: productsTable.description,
          category: productsTable.category,
        })
        .from(productsTable)
        .where(eq(productsTable.id, productId))
        .limit(1);
      if (product) {
        productCategory = product.category;
        productInfo = { name: product.name, description: product.description };
      }
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY || "";
    const userPromptExpanded = await enhanceUserPromptForGeneration(prompt, apiKey);

    const enhancedPrompt = buildGeminiPrompt(userPromptExpanded, productCategory, productInfo, {
      productAnalyses,
      moodAnalysis,
      modelAnalyses,
      legacyProductAnalysis: productAnalysis,
    });

    console.log("[generate-variations] prompt:", prompt);
    console.log("[generate-variations] userPromptExpanded:", userPromptExpanded);
    console.log("[generate-variations] productCategory:", productCategory || "none");
    console.log("[generate-variations] referenceImages count:", referenceImages?.length || 0);

    const parts: any[] = [];
    if (referenceImages && referenceImages.length > 0) {
      for (const imgBase64 of referenceImages) {
        parts.push({ inlineData: { mimeType: "image/png", data: imgBase64 } });
      }
      const refLabel = referenceImages.length > 1
        ? "Using these product images as reference"
        : "Using this product image as reference";
      parts.push({ text: `${refLabel}, ${enhancedPrompt}` });
    } else {
      parts.push({ text: enhancedPrompt });
    }

    const temperatures = [0.3, 0.5, 0.7];
    const variationGroupId = randomUUID();

    const results = await Promise.all(
      temperatures.map(async (temperature, idx) => {
        const response = await withTimeout(
          googleAI.models.generateContent({
            model: "gemini-3.1-flash-image-preview",
            contents: [{ role: "user", parts }],
            config: {
              responseModalities: [Modality.IMAGE, Modality.TEXT],
              temperature,
              topP: 0.9,
              safetySettings: [
                {
                  category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                  threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                },
                {
                  category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                  threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                },
              ],
            },
          }),
          90_000,
          `generate-variations[${idx + 1}]`
        );

        let imageBase64 = "";
        if (response.candidates && response.candidates[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
              imageBase64 = part.inlineData.data || "";
              break;
            }
          }
        }
        return { imageBase64, index: idx + 1 };
      })
    );

    const validatedVariations = await Promise.all(
      results.map(async (item) => {
        const gateResult = await validateGeneratedImage(item.imageBase64, prompt, apiKey, productCategory);
        console.log(`[quality-gate] variations[${item.index}] ${gateResult.pass ? "PASS" : "FAIL"}: ${gateResult.reason}`);
        return {
          ...item,
          rejected: !gateResult.pass,
          rejectionReason: gateResult.pass ? undefined : gateResult.reason,
        };
      })
    );

    res.json(
      GenerateVariationsResponse.parse({
        variationGroupId,
        userPromptExpanded,
        variations: validatedVariations,
      })
    );
  } catch (error: any) {
    console.error("Variations generation error:", safeErrorMessage(error));
    res.status(500).json({ error: safeErrorMessage(error) || "Failed to generate variations" });
  }
});

function coerceToStrings(raw: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (val === null || val === undefined) {
      // skip — let fallback handle it
    } else if (typeof val === 'string') {
      result[key] = val;
    } else if (Array.isArray(val)) {
      result[key] = val.join(', ');
    } else if (typeof val === 'object') {
      result[key] = Object.entries(val as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');
    } else {
      result[key] = String(val);
    }
  }
  return result;
}

function safeErrorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    try {
      const e = error as any;
      return e.message || e.statusText || e.status || JSON.stringify(e) || "Unknown error";
    } catch {
      return "Unknown error";
    }
  }
  return String(error);
}

function extractTextFromResponse(response: any): string {
  try {
    const parts = response?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (typeof part?.text === "string" && part.text.length > 0) {
          return part.text;
        }
      }
    }
  } catch {}
  try {
    const t = response?.text;
    if (typeof t === "string") return t;
  } catch {}
  return "";
}

async function runVlmAnalysis(image: string, systemInstruction: string): Promise<unknown> {
  const response = await vlmAI.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/png", data: image } },
          { text: "Analyze this reference image as instructed. Respond as JSON only." },
        ],
      },
    ],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      maxOutputTokens: 4096,
    },
  });

  const text = extractTextFromResponse(response) || "{}";
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

router.post("/images/analyze-product-ref", async (req, res): Promise<void> => {
  const parsed = AnalyzeProductRefBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const raw = (await runVlmAnalysis(parsed.data.image, PRODUCT_ANALYSIS_SYSTEM_PROMPT)) as Record<string, unknown>;
    const fallback = {
      productType: "Unknown product",
      colorMap: "Unable to analyze colors",
      logoAndGraphics: "No logos or graphics detected",
      trimAndBinding: "No trim details detected",
      material: "Unknown material",
      constructionDetails: "Standard construction",
      frontBackDifferences: "Single view only",
      labelAndTags: "No labels detected",
      photographyTips: "Use standard product photography techniques",
    };
    const sanitized = coerceToStrings(raw);
    const merged = { ...fallback, ...sanitized };
    res.json(AnalyzeProductRefResponse.parse(merged));
  } catch (error: unknown) {
    console.error("Product ref analysis error:", safeErrorMessage(error));
    res.status(500).json({ error: safeErrorMessage(error) || "Failed to analyze product reference" });
  }
});

router.post("/images/analyze-mood-ref", async (req, res): Promise<void> => {
  const parsed = AnalyzeMoodRefBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const raw = (await runVlmAnalysis(parsed.data.image, MOOD_ANALYSIS_SYSTEM_PROMPT)) as Record<string, unknown>;
    const fallback = {
      palette: "Neutral mixed tones",
      lighting: "Soft ambient lighting",
      mood: "Neutral",
      background: "Unspecified background",
      composition: "Standard medium shot",
      photographyStyle: "Clean commercial style",
    };
    const sanitized = coerceToStrings(raw);
    const merged = { ...fallback, ...sanitized };
    res.json(AnalyzeMoodRefResponse.parse(merged));
  } catch (error: unknown) {
    console.error("Mood ref analysis error:", safeErrorMessage(error));
    res.status(500).json({ error: safeErrorMessage(error) || "Failed to analyze mood reference" });
  }
});

router.post("/images/analyze-model-ref", async (req, res): Promise<void> => {
  const parsed = AnalyzeModelRefBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const raw = (await runVlmAnalysis(parsed.data.image, MODEL_ANALYSIS_SYSTEM_PROMPT)) as Record<string, unknown>;
    const fallback = {
      ageRange: "Unspecified",
      bodyType: "Average build",
      pose: "Neutral standing pose",
      expression: "Neutral expression",
      styling: "Casual styling",
      ethnicityOrFeatures: "Unspecified features",
    };
    const sanitized = coerceToStrings(raw);
    const merged = { ...fallback, ...sanitized };
    res.json(AnalyzeModelRefResponse.parse(merged));
  } catch (error: unknown) {
    console.error("Model ref analysis error:", safeErrorMessage(error));
    res.status(500).json({ error: safeErrorMessage(error) || "Failed to analyze model reference" });
  }
});

router.post("/images/suggest-copy", async (req, res): Promise<void> => {
  const parsed = SuggestCopyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { productName, productDescription, tag, imageBase64 } = parsed.data;

  try {
    const userPrompt = imageBase64
      ? `제품명: ${productName}
제품 설명: ${productDescription}
섹션 타입: ${tag}

첨부된 이미지는 이 제품의 ${tag} 섹션용으로 생성된 이미지입니다. 이미지의 분위기, 색감, 구도를 분석하여 이미지와 자연스럽게 어울리는 마케팅 카피 4개를 생성해주세요.`
      : `제품명: ${productName}
제품 설명: ${productDescription}
섹션 타입: ${tag}

이 제품의 ${tag} 섹션에 적합한 마케팅 카피 4개를 생성해주세요.`;

    const parts: any[] = [{ text: userPrompt }];
    if (imageBase64) {
      parts.unshift({
        inlineData: {
          mimeType: "image/png",
          data: imageBase64,
        },
      });
    }

    const response = await vlmAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: copySuggestionSystemPrompt,
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
      },
    });

    const text = extractTextFromResponse(response) || "[]";
    let suggestions;
    try {
      suggestions = JSON.parse(text);
    } catch {
      suggestions = [
        { headline: "매력적인 제품", subtext: "당신의 일상을 바꿔줄 특별한 제품" },
        { headline: "새로운 경험", subtext: "지금까지 없던 편리함을 만나보세요" },
        { headline: "프리미엄 퀄리티", subtext: "최고급 소재로 만든 특별한 제품" },
        { headline: "스마트한 선택", subtext: "합리적인 가격에 최고의 품질" },
      ];
    }

    res.json(SuggestCopyResponse.parse({ suggestions }));
  } catch (error: unknown) {
    console.error("Copy suggestion error:", safeErrorMessage(error));
    res.status(500).json({ error: safeErrorMessage(error) || "Failed to suggest copy" });
  }
});

router.get("/images", async (req, res): Promise<void> => {
  const query = ListImagesQueryParams.safeParse(req.query);
  const conditions = [];

  if (query.success) {
    if (query.data.productId) {
      conditions.push(eq(imagesTable.productId, query.data.productId));
    }
    if (query.data.taskId) {
      conditions.push(eq(imagesTable.taskId, query.data.taskId));
    }
    if (query.data.tag) {
      conditions.push(eq(imagesTable.tag, query.data.tag));
    }
    if (query.data.status) {
      conditions.push(eq(imagesTable.status, query.data.status));
    }
  }

  const images = await db
    .select()
    .from(imagesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(imagesTable.createdAt);

  res.json(ListImagesResponse.parse(images));
});

router.post("/images/save", async (req, res): Promise<void> => {
  const parsed = SaveImageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { imageBase64, productId, taskId, tag, prompt, model, overlayText, status, parentId } = parsed.data;

  const idSegment = taskId ? `task${taskId}` : (productId ? `prod${productId}` : "nosrc");
  const fileName = `${tag}_${idSegment}_${randomUUID()}.png`;

  const imageBuffer = Buffer.from(imageBase64, "base64");
  const imageUrl = await uploadBuffer(`images/${fileName}`, imageBuffer, "image/png");

  const [image] = await db
    .insert(imagesTable)
    .values({
      productId: productId ?? null,
      taskId: taskId ?? null,
      tag,
      fileName,
      imageUrl,
      prompt,
      model,
      overlayText: overlayText || null,
      status: status || "draft",
      parentId: parentId ?? null,
    })
    .returning();

  res.status(201).json(
    ListImagesResponseItem.parse(image)
  );
});

router.patch("/images/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const parsed = UpdateImageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.tag !== undefined) updateData.tag = parsed.data.tag;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.overlayText !== undefined) updateData.overlayText = parsed.data.overlayText;

  const [image] = await db
    .update(imagesTable)
    .set(updateData)
    .where(eq(imagesTable.id, id))
    .returning();

  if (!image) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  res.json(UpdateImageResponse.parse(image));
});

router.delete("/images/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [image] = await db
    .delete(imagesTable)
    .where(eq(imagesTable.id, id))
    .returning();

  if (!image) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  try {
    await deleteByPublicUrl(image.imageUrl);
  } catch (e) {
    console.warn("Failed to delete image object from R2:", e);
  }

  res.sendStatus(204);
});

router.post("/images/upload-reference", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const ext = path.extname(req.file.originalname) || ".png";
  const fileName = `ref_${randomUUID()}${ext}`;

  const buffer = fs.readFileSync(req.file.path);
  const url = await uploadBuffer(
    `references/${fileName}`,
    buffer,
    req.file.mimetype || "image/png",
  );
  fs.unlinkSync(req.file.path);

  res.json(UploadReferenceImageResponse.parse({ url, fileName }));
});

router.get("/images/defaults", (_req, res): void => {
  res.json(defaultPrompts);
});

router.get("/images/category-prompt-key", (req, res): void => {
  const category = req.query.category as string;
  if (!category) {
    res.json({ key: null, prompt: null });
    return;
  }
  const key = resolveCategoryPromptKey(category);
  res.json({
    key,
    prompt: key ? CATEGORY_PROMPTS[key] : null,
  });
});

router.post("/images/camera-transform", async (req, res): Promise<void> => {
  const parsed = CameraTransformBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { imageBase64, angle, lens, depth, color } = parsed.data;

  if (!angle && !lens && !depth && !color) {
    res.status(400).json({ error: "At least one preset must be selected" });
    return;
  }

  try {
    // Step 1: VLM analysis — understand the original image
    const analysisResponse = await withTimeout(
      vlmAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "image/png", data: imageBase64 } },
              { text: "Analyze this image as instructed." },
            ],
          },
        ],
        config: {
          systemInstruction: CAMERA_TRANSFORM_ANALYSIS_PROMPT,
          temperature: 0.2,
          maxOutputTokens: 512,
        },
      }),
      30_000,
      "camera-transform-analysis"
    );

    const analysisText = extractTextFromResponse(analysisResponse) || "A product photograph.";

    // Step 2: Build camera-language prompt + generate transformed image
    const transformPrompt = buildCameraTransformPrompt(analysisText, { angle, lens, depth, color });

    console.log("[camera-transform] analysis:", analysisText);
    console.log("[camera-transform] transformPrompt:", transformPrompt);

    const genResponse = await withTimeout(
      googleAI.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "image/png", data: imageBase64 } },
              { text: transformPrompt },
            ],
          },
        ],
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
          temperature: 0.4,
          topP: 0.9,
          imageConfig: { aspectRatio: "3:4", imageSize: "1K" },
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          ],
        },
      }),
      90_000,
      "camera-transform-generate"
    );

    let resultBase64 = "";
    if (genResponse.candidates && genResponse.candidates[0]?.content?.parts) {
      for (const part of genResponse.candidates[0].content.parts) {
        if (part.inlineData) {
          resultBase64 = part.inlineData.data || "";
          break;
        }
      }
    }

    if (!resultBase64) {
      res.status(500).json({ error: "Image generation returned no image" });
      return;
    }

    res.json(CameraTransformResponse.parse({ imageBase64: resultBase64, analysisText }));
  } catch (error: any) {
    console.error("Camera transform error:", safeErrorMessage(error));
    res.status(500).json({ error: safeErrorMessage(error) || "Failed to transform image" });
  }
});

export default router;
