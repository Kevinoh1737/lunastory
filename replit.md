# H&CN Studio

## Overview

H&CN Studio is an e-commerce asset creation system for H&CN's platform. It helps designers and product developers create professional product detail pages using AI-generated images, and generate AI videos from images or existing videos.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/hcn-studio)
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **AI Image Generation**: Gemini 3.1 Flash Image (via Google AI API key)
- **AI Video Generation**: Replicate API (minimax/hailuo-ai-video-01-live for i2v, wavespeedai/wan-2.1-vace-480p for v2v) + Runway Gen-4 Turbo (i2v) + Kling AI 2.0 (i2v+v2v) + Google Veo 3.1 (i2v+v2v, model: veo-3.1-generate-preview)
- **AI Text/Copy**: Gemini 2.5 Flash (via Google AI API key)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Image processing**: Sharp

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/           # Express API server
│   └── hcn-studio/           # React + Vite frontend (H&CN Studio)
├── lib/
│   ├── api-spec/             # OpenAPI spec + Orval codegen config
│   ├── api-client-react/     # Generated React Query hooks
│   ├── api-zod/              # Generated Zod schemas from OpenAPI
│   ├── db/                   # Drizzle ORM schema + DB connection
│   └── integrations-gemini-ai/ # Gemini AI integration (legacy, no longer used)
├── scripts/
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Features

### 1. Asset Creator (디자이너 전용)
- **3 Variation generation**: "3개 Variation 생성" button generates 3 parallel images with temperature 0.3/0.5/0.7 for diversity
- 2-column layout: left panel (references + prompt) / right panel (working image + variation cards)
- Variation selection UI: 3 cards with thumbnails, click or "선택" button to set working image; selected card highlighted with border
- "3개 모두 저장" button to save all 3 variations to library at once
- AI image generation with Gemini 3.1 Flash Image (single via /generate-gemini, triple via /generate-variations)
- Multiple product reference image upload (up to 3 images)
- Category-aware automatic prompt system: BASE_CORE system instruction + context anchors + category-specific prompts + designer input
- 13 hardcoded category prompt groups (FURNITURE_TABLE_SOFA, SEASON_SUMMER, MAT_FOLDER, etc.)
- Optimized Gemini config: temperature varied per variation, top_p 0.9, safety settings
- Category prompt indicator badge in UI (shows active prompt key when product is selected)
- Prompt editor with pre-filled default prompts per section type
- 5 section tags: intro, problem, solution, trust, info
- LLM-powered marketing copy suggestions (Korean, reference-only)
- Direct save to library and download buttons on working image
- Image library with tag/status filtering
- Draft → Approved workflow
- VLM product analysis with 9-field exhaustive detail (colorMap, logoAndGraphics, trimAndBinding, material, constructionDetails, frontBackDifferences, labelAndTags, photographyTips)
- Multi-image analysis support (up to 3 product + 1 mood + 2 model references)

### 2. Product Manager
- Product CRUD (name, description, category)
- Hierarchical category selection (대분류 > 중분류)
- Inline new category creation

> 디자이너는 Asset Creator로 AI 이미지를 생성하고 Photoshop에서 마무리한 뒤 Cafe24에 직접 업로드한다. 시스템 안에는 별도의 상세페이지 조립 단계가 없다.

## Database Tables

- `products` - Product information (category stored as text, e.g., "시즌&잡화 > 여름 시즌아이템")
- `categories` - Hierarchical categories (id, name, parentId)
- `images` - Saved generated images with tags and metadata (+ parentId, variationGroupId, variationIndex, maskData for inpainting/tree history; taskId FK nullable)
- `tasks` - Top-level task/session units (id, title, description, createdAt, updatedAt)
- `guide_images` - Reusable reference images stored permanently (id, type, fileName, imageUrl, createdAt)

## API Endpoints

- Products: `/api/products`
- Categories: `/api/categories`
- Tasks: `/api/tasks`, `/api/tasks/:id` — full CRUD; delete nulls taskId on images
- Guide Images: `/api/guide-images` (optional `?type=product|mood|model`), `/api/guide-images/:id`
- Image Generation: `/api/images/generate-gemini` (single), `/api/images/generate-variations` (3 parallel)
- Copy Suggestions: `/api/images/suggest-copy`
- Images CRUD: `/api/images` (supports `?taskId=`, `?productId=`), `/api/images/save` (optional taskId/productId), `/api/images/{id}`
- Reference Upload: `/api/images/upload-reference`
- Default Prompts: `/api/images/defaults`
- Category Prompt Key: `/api/images/category-prompt-key?category=...`
- Product Analysis: `/api/images/analyze-product` (multi-image VLM, 9-field response)
- Static uploads: `/api/uploads/`

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection (auto-provisioned)
- `GOOGLE_AI_API_KEY` - Google AI API key for Gemini 3.1 Flash Image, Gemini 2.5 Flash, and Veo 3.1 video generation
- `REPLICATE_API_TOKEN` - Replicate API token (legacy video models)
- `RUNWAY_API_KEY` - Runway Gen-4 Turbo API key (i2v comparison)
- `KLING_API_KEY` + `KLING_API_SECRET` - Kling AI 2.0 API credentials (i2v+v2v comparison, JWT HS256 auth)

## Root Scripts

- `pnpm run build` — typecheck + build all packages
- `pnpm run typecheck` — full typecheck across all packages

## Codegen

- `pnpm --filter @workspace/api-spec run codegen` — regenerate API clients after spec changes
- `pnpm --filter @workspace/db run push` — push DB schema changes
