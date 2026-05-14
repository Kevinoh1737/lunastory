# H&CN Studio — Complete Migration Guide

> Internal e-commerce asset creation tool (code name: LUNA STORY)
> Generated: 2026-05-14

---

## 1. Project Overview

H&CN Studio is a Korean-UI internal tool that lets designers generate AI product images and videos for e-commerce detail pages. The system takes product reference photos + designer prompts and produces Gemini-generated images, which are then downloaded and finished in Photoshop before upload to Cafe24.

### Architecture

```
Browser (hcn-studio SPA)
        │  HTTP/JSON
        ▼
API Server (Express 5)  ──── PostgreSQL DB
        │
        ├── Google Gemini API   (image generation + VLM analysis)
        ├── Google Veo 3.1      (video generation)
        ├── Runway Gen-4 Turbo  (video generation)
        ├── Kling AI 2.0        (video generation)
        ├── Replicate           (legacy video models)
        └── Google Cloud Storage (temp URLs for video source files)
```

---

## 2. Repository Structure

```
/
├── artifacts/
│   ├── api-server/          # Express 5 backend — the only process in production
│   │   ├── src/
│   │   │   ├── index.ts     # Entrypoint: reads PORT env var, calls app.listen
│   │   │   ├── app.ts       # Express app: CORS, JSON (50 MB limit), routes
│   │   │   ├── routes/      # Route handlers
│   │   │   │   ├── index.ts        # Mounts all sub-routers under /api
│   │   │   │   ├── images/         # Image generation + library endpoints
│   │   │   │   ├── products/       # Product CRUD
│   │   │   │   ├── categories/     # Category hierarchy
│   │   │   │   ├── tasks/          # Task (session) CRUD
│   │   │   │   ├── guideImages.ts  # Guide image library
│   │   │   │   ├── videos/         # Video CRUD + polling
│   │   │   │   ├── videoTasks/     # Video task (session) CRUD
│   │   │   │   └── health.ts       # GET /api/health → { status: "ok" }
│   │   │   └── lib/
│   │   │       ├── prompts.ts      # All Gemini prompt templates
│   │   │       ├── objectStorage.ts # GCS upload helper (Replit-specific — see §8)
│   │   │       └── ...
│   │   ├── uploads/         # Local disk: uploaded guide images (PNG/JPEG)
│   │   ├── build.ts         # esbuild bundler script → dist/index.cjs
│   │   └── package.json
│   │
│   └── hcn-studio/          # React 19 + Vite SPA
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx      # Router (wouter): /, /products, /tasks/:id, /video
│       │   ├── pages/
│       │   │   ├── asset-creator.tsx  # Main designer tool
│       │   │   ├── task-list.tsx
│       │   │   ├── product-list.tsx
│       │   │   └── video-studio.tsx
│       │   └── components/
│       ├── vite.config.ts   # Reads PORT + BASE_PATH env vars
│       └── package.json
│
├── lib/
│   ├── db/                  # Drizzle ORM (PostgreSQL)
│   │   ├── src/
│   │   │   ├── index.ts     # DB pool + drizzle client
│   │   │   └── schema/      # One file per table (see §4)
│   │   └── drizzle.config.ts
│   ├── api-spec/            # OpenAPI 3.1 spec (source of truth for API types)
│   ├── api-zod/             # Auto-generated Zod schemas from OpenAPI
│   ├── api-client-react/    # Auto-generated TanStack Query hooks (frontend)
│   └── integrations-gemini-ai/  # Shared Gemini AI helpers
│
├── pnpm-workspace.yaml      # Workspace + catalog versions
├── tsconfig.base.json
└── package.json
```

---

## 3. Environment Variables

All must be set before starting the API server. None have defaults — missing variables throw at startup.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ Yes | PostgreSQL connection string, e.g. `postgres://user:pass@host:5432/dbname` |
| `PORT` | ✅ Yes | Port for the API server to listen on (e.g. `8080`) |
| `GOOGLE_AI_API_KEY` | ✅ Yes | Google AI API key — used for Gemini 3.1 Flash Image (generation), Gemini 2.5 Flash (copy/VLM), Veo 3.1 (video) |
| `GOOGLE_AI_VLM_API_KEY` | ⚠️ Optional | Separate Google AI key for VLM analysis only. Falls back to `GOOGLE_AI_API_KEY` if not set |
| `RUNWAY_API_KEY` | ⚠️ Optional | Runway Gen-4 Turbo API key (image-to-video). Video tab won't work without it |
| `KLING_API_KEY` | ⚠️ Optional | Kling AI 2.0 API key (i2v + v2v). Used with KLING_API_SECRET for JWT auth |
| `KLING_API_SECRET` | ⚠️ Optional | Kling AI 2.0 API secret |
| `REPLICATE_API_TOKEN` | ⚠️ Optional | Replicate API token (legacy video models — minimax/wavespeedai) |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | ⚠️ Optional | GCS bucket name used to upload video source files so Runway/Kling can access them via signed URL. **This is Replit-specific — see §8** |

### Frontend-specific variables (build time for Vite)

| Variable | Required | Description |
|---|---|---|
| `PORT` | ✅ Yes | Dev server port (Vite reads this at startup) |
| `BASE_PATH` | ✅ Yes | URL base path for the SPA, e.g. `/` or `/studio` |
| `VITE_API_BASE_URL` | Check code | Base URL the frontend uses to call the API (check `src/lib/api.ts` or generated client config) |

---

## 4. Database

### Connection

PostgreSQL via `pg` pool + Drizzle ORM. Connection string from `DATABASE_URL` env var.

### Tables and Schema (DDL)

```sql
-- Hierarchical product categories
CREATE TABLE categories (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  parent_id  INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Products
CREATE TABLE products (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  description         TEXT NOT NULL,
  category            TEXT NOT NULL,   -- full path, e.g. "시즌&잡화 > 여름 시즌아이템"
  reference_image_url TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Top-level task/session units (groups a design session)
CREATE TABLE tasks (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Saved generated images
CREATE TABLE images (
  id                 SERIAL PRIMARY KEY,
  product_id         INTEGER REFERENCES products(id),
  task_id            INTEGER REFERENCES tasks(id),      -- nullable, set to NULL on task delete
  tag                TEXT NOT NULL,                     -- section tag: intro/problem/solution/trust/info
  file_name          TEXT NOT NULL,
  image_url          TEXT NOT NULL,                     -- /api/uploads/<filename>
  prompt             TEXT NOT NULL,
  model              TEXT NOT NULL,                     -- e.g. "gemini-3.1-flash-image"
  overlay_text       TEXT,
  status             TEXT NOT NULL DEFAULT 'draft',     -- 'draft' | 'saved'
  parent_id          INTEGER REFERENCES images(id),     -- for inpainting / lineage tree
  variation_group_id TEXT,                              -- UUID grouping parallel variations
  variation_index    INTEGER,
  mask_data          TEXT,                              -- base64 mask for inpainting
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Top-level video task/session groups
CREATE TABLE video_tasks (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Generated videos
CREATE TABLE videos (
  id                      SERIAL PRIMARY KEY,
  video_task_id           INTEGER REFERENCES video_tasks(id),
  name                    TEXT NOT NULL,
  file_name               TEXT NOT NULL,
  video_url               TEXT NOT NULL,
  source_type             TEXT NOT NULL,    -- 'i2v' | 'v2v'
  source_image_url        TEXT,
  source_video_url        TEXT,
  prompt                  TEXT NOT NULL,
  model                   TEXT NOT NULL,   -- 'runway' | 'kling' | 'veo' | 'replicate-*'
  replicate_prediction_id TEXT,
  status                  TEXT NOT NULL DEFAULT 'generating',  -- 'generating' | 'completed' | 'failed'
  error_message           TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reusable reference images (product / mood / model)
CREATE TABLE guide_images (
  id         SERIAL PRIMARY KEY,
  type       TEXT NOT NULL,      -- 'product' | 'mood' | 'model'
  file_name  TEXT NOT NULL,
  image_url  TEXT NOT NULL,      -- /api/uploads/<filename>
  name       TEXT,               -- optional display name
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

> **Note:** There is also a `conversations` / `messages` table in the schema files — these are legacy and not used by the current UI.

### Running Migrations

The project uses `drizzle-kit push` (schema-push, not SQL migration files):

```bash
# From repo root — pushes current schema to the target DB
DATABASE_URL=postgres://... pnpm --filter @workspace/db run push
```

To force-push (destructive):

```bash
DATABASE_URL=postgres://... pnpm --filter @workspace/db run push-force
```

---

## 5. File Storage

### Guide images and saved images

Uploaded files are stored on **local disk** at `artifacts/api-server/uploads/`. They are served statically at `/api/uploads/<filename>`.

On Antigravity you need **persistent disk storage** mounted at the path where the API server process runs, so that `uploads/` is not wiped between deploys/restarts.

Alternatively, replace the local disk writes with an object storage bucket (S3-compatible) and update the image URL pattern accordingly.

### Video source files (GCS — Replit-specific, must replace)

When a user triggers video generation via Runway or Kling, the source image is temporarily uploaded to **Google Cloud Storage** to generate a signed URL that the external video API can fetch. This upload logic is in:

```
artifacts/api-server/src/lib/objectStorage.ts
```

The current implementation authenticates to GCS using **Replit's sidecar service** at `http://127.0.0.1:1106`. This **will not work outside Replit**. See §8 for the full replacement plan.

---

## 6. API Endpoints Reference

All endpoints are prefixed with `/api`.

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check → `{ status: "ok" }` |
| GET/POST | `/products` | List / create products |
| GET/PUT/DELETE | `/products/:id` | Get / update / delete product |
| GET/POST | `/categories` | List / create categories |
| GET/POST | `/tasks` | List / create tasks |
| GET/PUT/DELETE | `/tasks/:id` | Get / update / delete task |
| GET/POST | `/guide-images` | List (optional `?type=product\|mood\|model`) / upload guide image |
| DELETE | `/guide-images/:id` | Delete guide image |
| GET | `/images` | List images (`?taskId=`, `?productId=`) |
| POST | `/images/save` | Save generated image to library |
| GET/DELETE | `/images/:id` | Get / delete image |
| POST | `/images/generate-gemini` | Generate single image (Gemini 3.1 Flash) |
| POST | `/images/generate-variations` | Generate 3 variations in parallel |
| POST | `/images/suggest-copy` | Generate marketing copy (Gemini 2.5 Flash) |
| POST | `/images/analyze-product` | VLM product analysis (9-field) |
| POST | `/images/upload-reference` | Upload reference image (returns base64) |
| GET | `/images/defaults` | Default prompts per section tag |
| GET | `/images/category-prompt-key` | Resolve category → prompt key (`?category=`) |
| GET/POST | `/video-tasks` | List / create video tasks |
| GET/PUT/DELETE | `/video-tasks/:id` | Get / update / delete video task |
| GET/POST | `/videos` | List / create (start generation) videos |
| GET/DELETE | `/videos/:id` | Get video status + poll / delete |
| GET | `/uploads/:filename` | Serve uploaded files (static) |

---

## 7. Build & Run Commands

### Prerequisites

- **Node.js**: v24
- **Package manager**: pnpm v10+
- Install: `npm install -g pnpm`

### Install dependencies

```bash
pnpm install
```

### Development

Start API server (port from `PORT` env):
```bash
pnpm --filter @workspace/api-server run dev
```

Start frontend (reads `PORT` + `BASE_PATH` env):
```bash
pnpm --filter @workspace/hcn-studio run dev
```

### Production build

```bash
# Build everything (typecheck + bundle)
pnpm run build

# Or individually:
pnpm --filter @workspace/api-server run build   # → artifacts/api-server/dist/index.cjs
pnpm --filter @workspace/hcn-studio run build   # → artifacts/hcn-studio/dist/public/
```

### Production run

The API server bundle is a CommonJS file:

```bash
node artifacts/api-server/dist/index.cjs
```

The frontend build is a static folder — serve it from the API server or a CDN. The API server does **not** currently serve the frontend static files; you need to either:
- Add `express.static` pointing at `dist/public/` in `app.ts`, or
- Serve via a CDN/reverse proxy (Nginx, Cloudflare Pages, etc.)

### Codegen (when changing the OpenAPI spec)

```bash
pnpm --filter @workspace/api-spec run codegen
```

---

## 8. Replit-Specific Code That Must Be Replaced

These parts of the codebase are tightly coupled to Replit infrastructure and must be adapted for Antigravity.

### 8.1 Object Storage (Critical — video generation will fail without this)

**File:** `artifacts/api-server/src/lib/objectStorage.ts`

The current implementation authenticates to GCS via Replit's local sidecar at `http://127.0.0.1:1106`. On any other host this will fail with a connection error.

**What it does:** When a user starts video generation (Runway/Kling), the source image is uploaded to GCS and a signed URL (valid 2 hours) is returned so the external video API can fetch the file.

**Replacement options:**

Option A — Use a regular GCS service account:
```typescript
import { Storage } from "@google-cloud/storage";
const storageClient = new Storage({
  keyFilename: "/path/to/service-account.json",
  // or: credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
});
```
Add env var: `GOOGLE_APPLICATION_CREDENTIALS_JSON` (service account JSON as string)

Option B — Use AWS S3 or any S3-compatible storage:
Replace the upload logic with `@aws-sdk/client-s3` + `getSignedUrl`.

Option C — Use Cloudflare R2 (S3-compatible, no egress fees):
Same as Option B with R2 endpoint.

### 8.2 Vite plugins (Non-critical — only affect dev experience)

**File:** `artifacts/hcn-studio/vite.config.ts`

Three plugins are Replit-only and should be removed for non-Replit hosting:
```typescript
// Remove these:
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { cartographer } from "@replit/vite-plugin-cartographer";
import { devBanner } from "@replit/vite-plugin-dev-banner";
```

They are already guarded by `process.env.REPL_ID !== undefined` so they will simply not load on non-Replit hosts — no code change strictly required, but cleaning them up removes unused dependencies.

### 8.3 BASE_PATH environment variable

**File:** `artifacts/hcn-studio/vite.config.ts`

The frontend reads `BASE_PATH` at dev/build time to set the Vite `base` option. On Antigravity, set `BASE_PATH=/` for root-hosted apps.

---

## 9. AI Services — API Keys and Model Names

| Service | Key(s) | Models Used | Purpose |
|---|---|---|---|
| Google AI (Gemini) | `GOOGLE_AI_API_KEY` | `gemini-3.1-flash-image-preview` | Image generation |
| Google AI (Gemini) | `GOOGLE_AI_API_KEY` | `gemini-2.5-flash` | VLM product analysis, copy suggestions |
| Google AI (Veo) | `GOOGLE_AI_API_KEY` | `veo-3.1-generate-preview` | Text/image-to-video |
| Google AI VLM | `GOOGLE_AI_VLM_API_KEY` | `gemini-2.5-flash` | Dedicated VLM key (optional) |
| Runway | `RUNWAY_API_KEY` | `gen4_turbo` | Image-to-video |
| Kling AI | `KLING_API_KEY` + `KLING_API_SECRET` | `kling-v2.5` | Image-to-video + video-to-video |
| Replicate | `REPLICATE_API_TOKEN` | `minimax/hailuo-ai-video-01-live`, `wavespeedai/wan-2.1-vace-480p` | Legacy video models |

> Gemini models are in preview — check [Google AI Studio](https://aistudio.google.com/) for current availability.

---

## 10. Request Size Limits

The Express server accepts JSON bodies up to **50 MB** (images are sent as base64 strings inline):

```typescript
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
```

On Antigravity, ensure the reverse proxy / load balancer also allows bodies of this size (Nginx: `client_max_body_size 50m`).

---

## 11. Step-by-Step Migration Checklist

- [ ] Provision a **PostgreSQL 14+** database
- [ ] Set `DATABASE_URL` and run `pnpm --filter @workspace/db run push` to create all tables
- [ ] Set all required environment variables (§3)
- [ ] Replace `objectStorage.ts` GCS sidecar authentication (§8.1) with a standard service account or S3-compatible storage
- [ ] Mount **persistent disk** at the working directory so `uploads/` survives restarts (or migrate to object storage for images too)
- [ ] Optionally remove Replit Vite plugins from `vite.config.ts` (§8.2)
- [ ] Run `pnpm install` then `pnpm run build`
- [ ] Start the API server: `node artifacts/api-server/dist/index.cjs`
- [ ] Serve the frontend static files from `artifacts/hcn-studio/dist/public/` (via CDN, Nginx, or add `express.static` to `app.ts`)
- [ ] Configure reverse proxy: route `/api/*` → API server, `/*` → static frontend
- [ ] Verify `/api/health` returns `{ "status": "ok" }`
- [ ] Test image generation end-to-end

---

## 12. Key Technical Notes

- **JSON body size**: Images are sent as raw base64 in request bodies — keep the 50 MB limit on both the API server and any upstream reverse proxy.
- **Gemini rate limits**: The `generate-variations` endpoint fires 3 concurrent Gemini requests. At high traffic, Gemini quota limits may cause failures. The single-image `generate-gemini` endpoint is the primary flow.
- **Video polling**: Video generation (Runway/Kling/Veo) is async. The frontend polls `GET /api/videos/:id` until `status` becomes `completed` or `failed`.
- **Drizzle push vs. migrate**: The project uses `drizzle-kit push` (no migration files). If you need proper migration tracking for production, generate migration files with `drizzle-kit generate` first, then run `drizzle-kit migrate`.
- **Node.js version**: Pinned to v24. Downgrading to v18/v20 may work but is untested.
- **TypeScript**: Source files use `.ts` with ES module imports. The API server is compiled to CJS by esbuild for production. Do not run `src/index.ts` directly in production — use the built `dist/index.cjs`.
