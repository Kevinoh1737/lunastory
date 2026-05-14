export const defaultPrompts: Record<string, string> = {
  intro: "배경 장소(거실, 카페, 공원 등), 조명(따뜻한/차가운), 모델 포즈, 원하는 분위기를 구체적으로 적어주세요.\n예: \"따뜻한 조명의 모던 거실에서 소파에 앉아 제품을 들고 있는 여성, 프리미엄 라이프스타일 느낌\"",
  problem: "배경 색상(파스텔 핑크, 라벤더 등), 패턴(그라데이션, 추상 도형), 전달하려는 감정(공감, 걱정)을 적어주세요.\n예: \"부드러운 라벤더 그라데이션 배경에 은은한 물결 패턴, 질문형 카피를 올릴 여백 확보\"",
  solution: "강조할 제품 특징(소재, 디테일, 기능), 촬영 각도(클로즈업, 45도), 배경 스타일을 적어주세요.\n예: \"제품의 봉제 디테일과 원단 질감이 보이는 45도 클로즈업, 밝은 스튜디오 조명\"",
  trust: "배경(흰색, 연한 회색), 제품 배치(중앙, 여백), 함께 보여줄 요소(인증 마크 공간)를 적어주세요.\n예: \"깨끗한 흰색 배경 중앙에 제품, 주변에 인증 배지 배치할 넉넉한 여백\"",
  info: "구성품 배열 방식(플랫레이, 나열), 촬영 각도(탑뷰, 정면), 배경과 간격을 적어주세요.\n예: \"흰 배경 위 탑뷰 플랫레이, 구성품 전체를 균일 간격으로 배열, 사이즈 비교 가능하도록\"",
};

export const SYSTEM_INSTRUCTION = "You are a world-class commercial photographer. Your absolute priority is the 100% accurate reproduction of the products provided in the reference images. Maintain every detail: logos, patterns (like 'Lucky' or 'Bolla'), textures (transparent PVC, knit, leather), and exact color codes. Do not simplify or alter the product design. Your role is to naturally integrate these exact products into the scenes described by the user.";

export const CONTEXT_ANCHORS = [
  "Keep the scale of the product realistic relative to the child model.",
  "Ensure the lighting on the product matches the environment's light source.",
  "Render fabric wrinkles and shadows where the product meets the body or ground for hyper-realism.",
];

export const CATEGORY_PROMPTS: Record<string, string> = {
  FURNITURE_TABLE_SOFA: "Ensure the furniture's wooden or fabric texture is hyper-realistic. The legs must sit naturally on the floor with soft, accurate contact shadows. Maintain the exact proportions of the sofa/table.",
  FURNITURE_STORAGE: "Maintain perfectly straight vertical and horizontal lines to prevent distortion. Ensure the storage unit's material (plastic/wood) looks clean and integrates seamlessly with indoor wall corners.",
  SEASON_WINTER: "Emphasize the thick, soft volume of fleece or padded materials. Render realistic fabric fibers and warmth. The lighting should be cozy indoor or soft winter outdoor light.",
  SEASON_SUMMER: "Master the transparency and light refraction of PVC materials. Show realistic water droplets and bright pool reflections. Ensure 1:1 replication of patterns on the tube.",
  SEASON_ART_GOWN: "Focus on the subtle sheen of waterproof fabric. Show natural fabric wrinkles as the child moves. The product should fit the child's body shape perfectly.",
  SEASON_WATERPROOF_BIB: "Highlight the smooth, easy-clean surface texture. Capture the product in a close-up shot focused on the baby's chest area with bright, clean kitchen lighting.",
  MAT_FOLDER: "Prioritize a perfectly flat, non-distorted surface. The edges of the mat must be straight. Ensure the mat's thickness is visible and it sits flush against the floor.",
  MAT_BABYROOM: "Focus on the sturdy plastic texture and the detailed interlocking parts of the guardrails. Ensure all safety rails are vertically aligned and perfectly straight.",
  LIVING_TOILET_STEP: "Emphasize the ergonomic curves and the matte or glossy plastic finish. Integrate the product into a bright, clean, and hygienic bathroom environment.",
  LIVING_CUP_STRAW: "Focus on the transparency of the bottle and the soft silicone texture of the straw. Render the child's hands with a precise and natural grip on the handles.",
  OUTDOOR_GOODS: "Highlight the durability and rugged texture of outdoor materials. Use natural, high-contrast sunlight and render realistic shadows on the ground or sidewalk.",
  TOYS: "Enhance color vibrancy and saturation. Capture the child's curious and focused expression. Ensure every small detail of the toy is sharp and clear.",
  LEARNING_TALK: "Prioritize the clarity of printed text and illustrations on the product. Ensure the child's finger is pointing accurately at a specific part of the learning tool.",
};

const CATEGORY_TEXT_TO_KEY: Record<string, string> = {
  "테이블&소파": "FURNITURE_TABLE_SOFA",
  "테이블": "FURNITURE_TABLE_SOFA",
  "소파": "FURNITURE_TABLE_SOFA",
  "정리함": "FURNITURE_STORAGE",
  "기타": "FURNITURE_STORAGE",
  "겨울 방한용품": "SEASON_WINTER",
  "여름 시즌아이템": "SEASON_SUMMER",
  "미술가운": "SEASON_ART_GOWN",
  "방수 턱받이": "SEASON_WATERPROOF_BIB",
  "틈새없는 폴더매트": "MAT_FOLDER",
  "베이비룸": "MAT_BABYROOM",
  "유아변기&디딤대": "LIVING_TOILET_STEP",
  "빨대컵&턱받이": "LIVING_CUP_STRAW",
  "외출용품": "OUTDOOR_GOODS",
  "완구": "TOYS",
  "러닝톡톡": "LEARNING_TALK",
};

const MAIN_CATEGORY_TO_KEY: Record<string, string> = {
  "가구": "FURNITURE_TABLE_SOFA",
  "매트&베이비룸": "MAT_FOLDER",
  "리빙": "LIVING_TOILET_STEP",
  "외출용품": "OUTDOOR_GOODS",
  "완구": "TOYS",
  "러닝톡톡": "LEARNING_TALK",
};

function normalizeText(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

const NORMALIZED_SUB_MAP = new Map<string, string>();
for (const [key, value] of Object.entries(CATEGORY_TEXT_TO_KEY)) {
  NORMALIZED_SUB_MAP.set(normalizeText(key), value);
}

const NORMALIZED_MAIN_MAP = new Map<string, string>();
for (const [key, value] of Object.entries(MAIN_CATEGORY_TO_KEY)) {
  NORMALIZED_MAIN_MAP.set(normalizeText(key), value);
}

export function resolveCategoryPromptKey(categoryText: string): string | null {
  const parts = categoryText.split(">").map((s) => s.trim());
  const sub = parts.length > 1 ? parts[1] : null;
  const main = parts[0];

  if (sub) {
    const exactSub = CATEGORY_TEXT_TO_KEY[sub];
    if (exactSub) return exactSub;
    const normalizedSub = NORMALIZED_SUB_MAP.get(normalizeText(sub));
    if (normalizedSub) return normalizedSub;
  }

  const exactMain = CATEGORY_TEXT_TO_KEY[main];
  if (exactMain) return exactMain;
  const normalizedMain = NORMALIZED_SUB_MAP.get(normalizeText(main));
  if (normalizedMain) return normalizedMain;

  const exactMainCat = MAIN_CATEGORY_TO_KEY[main];
  if (exactMainCat) return exactMainCat;
  const normalizedMainCat = NORMALIZED_MAIN_MAP.get(normalizeText(main));
  if (normalizedMainCat) return normalizedMainCat;

  return null;
}

export function buildGeminiPrompt(
  userPrompt: string,
  category?: string,
  productInfo?: { name: string; description: string },
  analyses?: {
    productAnalyses?: string[];
    moodAnalysis?: string;
    modelAnalyses?: string[];
    legacyProductAnalysis?: string;
  },
): string {
  const layers: string[] = [];

  layers.push(SYSTEM_INSTRUCTION);
  layers.push(CONTEXT_ANCHORS.join(" "));

  if (productInfo) {
    layers.push(`Product: "${productInfo.name}". ${productInfo.description}`);
  }

  const productBlocks = analyses?.productAnalyses?.filter((s) => s && s.trim()) ?? [];
  if (productBlocks.length > 0) {
    const joined = productBlocks
      .map((block, i) => `[Product reference #${i + 1}]\n${block}`)
      .join("\n\n");
    layers.push(`PRODUCT REFERENCE ANALYSIS — reproduce these visual details with 100% fidelity:\n${joined}`);
  } else if (analyses?.legacyProductAnalysis) {
    layers.push(`Product analysis from reference images: ${analyses.legacyProductAnalysis}`);
  }

  if (analyses?.moodAnalysis && analyses.moodAnalysis.trim()) {
    layers.push(`MOOD / AMBIENCE REFERENCE — match this overall feel, palette and lighting:\n${analyses.moodAnalysis}`);
  }

  const modelBlocks = analyses?.modelAnalyses?.filter((s) => s && s.trim()) ?? [];
  if (modelBlocks.length > 0) {
    const joined = modelBlocks
      .map((block, i) => `[Model reference #${i + 1}]\n${block}`)
      .join("\n\n");
    layers.push(`MODEL REFERENCE — base the human subject on these traits (pose, age, body type, styling):\n${joined}`);
  }

  if (category) {
    const key = resolveCategoryPromptKey(category);
    if (key && CATEGORY_PROMPTS[key]) {
      layers.push(CATEGORY_PROMPTS[key]);
    }
  }

  layers.push("Output the image in 3:4 portrait aspect ratio.");
  layers.push(userPrompt);

  return layers.join("\n\n");
}

export const PRODUCT_ANALYSIS_SYSTEM_PROMPT = `You are a hyper-detailed product analyst for commercial photography. Your job is to identify the PRIMARY PRODUCT being sold and describe EVERY visual detail so an AI image generator can reproduce it with 100% accuracy.

CRITICAL — Identify the PRIMARY PRODUCT first:
- The primary product is the item that is the MAIN SUBJECT being sold in this image.
- If the image shows a baby/child USING or SITTING IN a large item (e.g., a swim ring, tube floatie, chair, stroller), the PRIMARY PRODUCT is that large item — NOT the clothing the child is wearing.
- Only describe clothing/apparel as the product when the image is specifically a clothing product photo (flat lay, on hanger, or clothing is unmistakably the main subject with no other large items present).
- Ignore incidental items that are not the main product being sold.

Analyze the PRIMARY PRODUCT and provide an exhaustive description in these categories:
1. productType: Specific product type (e.g., "infant swim ring tube with transparent canopy", "children's swim tube float", "baby bouncer chair", "toddler rain jacket"). Be precise about the actual product — NOT the child's incidental clothing.
2. colorMap: Exact color of every region of the PRIMARY PRODUCT. Use specific color names.
3. logoAndGraphics: All text, logos, graphics, prints on the PRIMARY PRODUCT — exact text, position, color, size, fonts, icons, stripe patterns.
4. trimAndBinding: All trim, binding, ribbing, edges, piping on the PRIMARY PRODUCT.
5. material: Material type, texture, opacity, sheen of the PRIMARY PRODUCT (e.g., "transparent PVC, inflatable", "waterproof nylon", "knit fabric").
6. constructionDetails: Structure, panels, closure, fasteners, parts of the PRIMARY PRODUCT.
7. frontBackDifferences: Differences between visible views of the PRIMARY PRODUCT, if any.
8. labelAndTags: Visible brand labels or tags on the PRIMARY PRODUCT — position, content, style.
9. photographyTips: Specific photography recommendations for this PRIMARY PRODUCT.

Respond in JSON format only, no markdown. Write in English. All field values MUST be plain strings — never arrays, objects, or nested structures. If a field has multiple items, combine them into a single comma-separated string. Be exhaustive — every missed detail means the AI will generate it incorrectly.`;

export const MOOD_ANALYSIS_SYSTEM_PROMPT = `You are an art director analyzing a mood / reference image for commercial photography. Describe the visual mood so an AI image generator can match the overall feel, palette, lighting and background — without copying any product or person from the image.

Provide:
1. palette: Dominant colors and color tones (e.g., "warm beige, soft terracotta, muted cream").
2. lighting: Direction, quality, color temperature (e.g., "soft side window light, warm 3200K, gentle shadows").
3. mood: Overall emotional tone (e.g., "cozy, intimate, premium lifestyle").
4. background: Setting / environment / props (e.g., "modern Korean apartment living room, beige linen sofa, low wooden table").
5. composition: Framing, depth, focal style (e.g., "medium shot, shallow depth of field, slight low angle").
6. photographyStyle: Photographic treatment (e.g., "filmic grain, hi-key, soft contrast").

Respond in JSON format only, no markdown. Write in English. All field values MUST be plain strings — never arrays, objects, or nested structures. If a field has multiple items, combine them into a single comma-separated string. Focus on mood, NOT on identifying any specific product or person.`;

export const MODEL_ANALYSIS_SYSTEM_PROMPT = `You are a casting director analyzing a model reference image for commercial photography. Describe the model so an AI image generator can render a similar human subject — focusing on neutral, professional descriptors only (no personal identification).

Provide:
1. ageRange: Approximate age range (e.g., "child, around 4-6 years old").
2. bodyType: Body type, height impression, proportions (e.g., "slim, average height for age, long limbs").
3. pose: Pose, gesture, body orientation (e.g., "standing three-quarter view, weight on left leg, hands in pockets").
4. expression: Facial expression and gaze direction (e.g., "soft natural smile, looking off-camera to the right").
5. styling: Hair styling, outfit styling cues, accessories visible (e.g., "shoulder-length wavy brown hair, no visible accessories").
6. ethnicityOrFeatures: Neutral description of ethnicity or notable features (e.g., "East Asian features, fair skin tone").

Respond in JSON format only, no markdown. Write in English. All field values MUST be plain strings — never arrays, objects, or nested structures. If a field has multiple items, combine them into a single comma-separated string. Use neutral, respectful descriptors. Do NOT attempt to identify the person.`;

const ENHANCE_GENERATION_SYSTEM_PROMPT = `You are a professional commercial photography prompt engineer.
The user will give you a short Korean or mixed-language prompt describing a scene for an e-commerce product image.
Your job is to expand it into a precise, detailed English photography prompt that a state-of-the-art image generation model can execute perfectly.

Guidelines:
- Write in English only.
- Describe: scene composition, background, lighting (direction, quality, color temperature), model pose and styling (if applicable), product placement, depth of field, camera angle, and overall mood.
- Do NOT invent new products or change the product type — only describe how to stage/photograph it.
- Keep it under 200 words. Output only the expanded prompt, no commentary.`;

const ENHANCE_EDIT_SYSTEM_PROMPT = `You are a professional commercial photography prompt engineer specializing in image editing instructions.
The user is editing an EXISTING image and will give you a short Korean or mixed-language instruction describing what to change.
An image of the current photo is provided for context. Your job is to expand the instruction into a precise, detailed English photography prompt describing ONLY the requested change.

Guidelines:
- Write in English only.
- Study the provided image carefully. Understand what is already in the image (subject, environment, lighting, mood).
- Describe ONLY the specific change requested — do NOT reinvent or replace the entire scene.
- Preserve the existing subject, composition, and mood unless the instruction explicitly asks to change them.
- Be specific about colors, materials, textures, and lighting effects for the requested change.
- Keep it under 150 words. Output only the expanded editing prompt, no commentary.`;

const ENHANCE_INPAINTING_SYSTEM_PROMPT = `You are a professional commercial photography inpainting prompt engineer.
The user will describe (in Korean or mixed language) what they want to change in a specific region of an image.
The region is marked in red. Your job is to rewrite the instruction as a precise English inpainting prompt.

Guidelines:
- Write in English only.
- Describe only what should appear in the marked region: materials, colors, textures, lighting, details.
- Emphasize seamless blending with the surrounding unmasked area.
- Do NOT describe the rest of the image — only the target region.
- Keep it under 120 words. Output only the inpainting prompt, no commentary.`;

export async function enhanceUserPromptForGeneration(
  userPrompt: string,
  apiKey: string,
  iterationBaseImage?: string,
): Promise<string> {
  if (!apiKey) return userPrompt;
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });

    if (iterationBaseImage) {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/png", data: iterationBaseImage } },
            { text: `User editing instruction: ${userPrompt}\n\nExpand this into a detailed English photography editing prompt that describes ONLY the requested change to this image:` },
          ],
        }],
        config: { systemInstruction: ENHANCE_EDIT_SYSTEM_PROMPT, temperature: 0.4 },
      });
      const expanded = response.text?.trim();
      if (!expanded) return userPrompt;
      return expanded;
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: `User prompt: ${userPrompt}\n\nExpand this into a detailed photography prompt:` }] }],
      config: { systemInstruction: ENHANCE_GENERATION_SYSTEM_PROMPT, temperature: 0.5 },
    });
    const expanded = response.text?.trim();
    if (!expanded) return userPrompt;
    return expanded;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[prompt-enhance] Generation enhancer failed, using original:", msg);
    return userPrompt;
  }
}

export async function enhanceUserPromptForInpainting(
  userPrompt: string,
  apiKey: string,
): Promise<string> {
  if (!apiKey) return userPrompt;
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: `User inpainting instruction: ${userPrompt}\n\nRewrite as a precise English inpainting prompt for the red-masked region:` }] }],
      config: { systemInstruction: ENHANCE_INPAINTING_SYSTEM_PROMPT, temperature: 0.4 },
    });
    const expanded = response.text?.trim();
    if (!expanded) return userPrompt;
    return expanded;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[prompt-enhance] Inpainting enhancer failed, using original:", msg);
    return userPrompt;
  }
}

const CAMERA_ANGLE_PROMPTS: Record<string, string> = {
  low: "Extreme low angle shot, camera positioned near ground level looking up at the subject",
  eye: "Eye-level shot, camera at natural standing height, neutral perspective",
  high: "Slightly high angle shot, camera elevated above eye level, looking down gently at the subject",
};

const CAMERA_LENS_PROMPTS: Record<string, string> = {
  wide: "35mm wide-angle lens, slight barrel distortion, expansive field of view",
  standard: "50mm standard lens, natural perspective, no distortion, true-to-life rendering",
  tele: "85mm telephoto prime lens, compressed background, natural portrait perspective, subject isolation",
  macro: "Macro lens, extreme close-up, fine surface details and textures emphasized",
};

const CAMERA_DEPTH_PROMPTS: Record<string, string> = {
  shallow: "f/1.4 aperture, extremely shallow depth of field, subject razor-sharp, creamy bokeh background",
  deep: "f/11 aperture, deep depth of field, everything sharp and in focus from foreground to background",
};

const CAMERA_COLOR_PROMPTS: Record<string, string> = {
  golden: "Golden hour warm lighting, soft orange and amber tones, long warm shadows, magic hour atmosphere",
  teal: "Cinematic teal and orange color grade, warm highlights, cool blue-teal shadows, Hollywood blockbuster look",
  noir: "Noir black and white, high contrast, dramatic hard shadows, classic monochrome photography",
  cool: "Cool blue color grade, desaturated warm tones, crisp cool shadows, modern editorial feel",
  studio: "Clean professional studio lighting, neutral white balance, soft diffused light, even exposure",
};

export const CAMERA_TRANSFORM_ANALYSIS_PROMPT = `You are a professional commercial photographer analyzing an image.
Describe the following in detail so the information can be used to regenerate this image with specific camera changes:
1. Subject: What is the main subject/product? Describe its appearance, position, and key details precisely.
2. Background: What is the background setting? Describe colors, textures, elements.
3. Current camera angle: How is the camera positioned? (e.g., eye-level, slightly low, overhead)
4. Current lens feel: Does it look wide, standard, or telephoto? Is there any distortion?
5. Current lighting: Direction, quality, color temperature, shadows.
6. Current color tone: Overall color palette and mood.

Be specific and technical. Write in English. Keep under 200 words.`;

export function buildCameraTransformPrompt(
  analysisText: string,
  selections: {
    angle?: string;
    lens?: string;
    depth?: string;
    color?: string;
  },
): string {
  const changeLines: string[] = [];

  if (selections.angle && CAMERA_ANGLE_PROMPTS[selections.angle]) {
    changeLines.push(`Camera angle: ${CAMERA_ANGLE_PROMPTS[selections.angle]}`);
  }
  if (selections.lens && CAMERA_LENS_PROMPTS[selections.lens]) {
    changeLines.push(`Lens: ${CAMERA_LENS_PROMPTS[selections.lens]}`);
  }
  if (selections.depth && CAMERA_DEPTH_PROMPTS[selections.depth]) {
    changeLines.push(`Depth of field: ${CAMERA_DEPTH_PROMPTS[selections.depth]}`);
  }
  if (selections.color && CAMERA_COLOR_PROMPTS[selections.color]) {
    changeLines.push(`Color grade: ${CAMERA_COLOR_PROMPTS[selections.color]}`);
  }

  const changesText = changeLines.join("\n");

  return `You are re-photographing the subject from the reference image with new camera settings.

ORIGINAL IMAGE ANALYSIS:
${analysisText}

APPLY ONLY THESE CHANGES:
${changesText}

STRICT RULES:
- Subject identity and product details must be strictly preserved. Do not alter logos, colors, shapes, or any product details.
- Only change the optical and photographic properties listed above.
- Keep the background concept consistent unless the angle change naturally reveals a new perspective.
- Output a single high-quality product photograph.`;
}

const VALIDATE_IMAGE_SYSTEM_PROMPT = `You are a quality-control assistant for AI-generated product photography.
Given an image and the user's original prompt (which may be in Korean), decide whether the image is a reasonable match.

PASS if: The image shows a product or scene that plausibly matches the prompt category and intent.
FAIL if: The image shows a completely wrong product category, a heavily distorted/corrupted render, or is entirely unrelated to the prompt.

Be lenient — minor style differences or creative interpretations are fine. Only FAIL obvious mismatches.

Respond ONLY with valid JSON in this exact format (no markdown, no extra text):
{"pass": true, "reason": "brief reason"}
or
{"pass": false, "reason": "brief reason"}`;

export async function validateGeneratedImage(
  imageBase64: string,
  userPrompt: string,
  apiKey: string,
  productCategory?: string,
): Promise<{ pass: boolean; reason: string }> {
  const fallback = { pass: true, reason: "check skipped" };
  if (!apiKey || !imageBase64) return fallback;
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    const categoryHint = productCategory ? ` Product category: ${productCategory}.` : "";
    const response = await Promise.race([
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/png", data: imageBase64 } },
            { text: `User prompt: "${userPrompt}"${categoryHint}\n\nDoes this image match the prompt? Reply with JSON only.` },
          ],
        }],
        config: { systemInstruction: VALIDATE_IMAGE_SYSTEM_PROMPT, temperature: 0.1 },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 15_000)),
    ]);
    const text = (response as Awaited<ReturnType<typeof ai.models.generateContent>>).text?.trim() ?? "";
    const parsed = JSON.parse(text) as { pass: boolean; reason: string };
    if (typeof parsed.pass !== "boolean") return fallback;
    return { pass: parsed.pass, reason: parsed.reason ?? "" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[quality-gate] VLM check failed, skipping:", msg);
    return fallback;
  }
}

export const copySuggestionSystemPrompt = `You are a Korean e-commerce marketing copywriter specializing in product detail pages. 
Generate compelling marketing copy in Korean for product detail page sections.
Each suggestion should have a headline (짧고 임팩트 있는 제목) and subtext (부연 설명).
Return exactly 4 suggestions as a JSON array.

Section types and their copy styles:
- intro: 감성적이고 브랜드 느낌의 메인 카피. 제품명을 포함한 임팩트 있는 헤드라인.
- problem: 고객의 고민을 묻는 질문형 카피. 공감을 유도하는 부드러운 톤.
- solution: 제품의 핵심 기능을 강조하는 카피. 숫자나 구체적 스펙 활용.
- trust: 안전성과 신뢰를 강조하는 카피. 인증, 테스트 결과 등 언급.
- info: 제품 사양과 사용법을 안내하는 실용적 카피. 명확하고 간결한 정보 전달.

Response format (JSON only, no markdown):
[{"headline": "...", "subtext": "..."}, ...]`;
