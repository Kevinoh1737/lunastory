/**
 * One-shot migration: copy live production data from the Replit-hosted Postgres
 * (and `/api/uploads/` static files) into the new Neon DB + Cloudflare R2.
 *
 * Run from artifacts/api-server so .env (DATABASE_URL, R2_*) loads automatically:
 *   cd artifacts/api-server
 *   SOURCE_DATABASE_URL='postgresql://...replit neon...' \
 *   REPLIT_BASE_URL='https://detail-page-builder.replit.app' \
 *   pnpm exec tsx scripts/migrate-from-replit.ts
 *
 * Idempotent: re-running uses ON CONFLICT (id) DO NOTHING.
 */
import "../src/loadEnv";
import pg from "pg";
import path from "node:path";
import { uploadBuffer } from "../src/lib/r2";

const SOURCE_URL = process.env.SOURCE_DATABASE_URL;
const TARGET_URL = process.env.DATABASE_URL;
const REPLIT_BASE = (process.env.REPLIT_BASE_URL ?? "").replace(/\/+$/, "");

if (!SOURCE_URL) throw new Error("SOURCE_DATABASE_URL env var is required");
if (!TARGET_URL) throw new Error("DATABASE_URL env var is required (target Neon)");
if (!REPLIT_BASE) throw new Error("REPLIT_BASE_URL env var is required");

const source = new pg.Pool({ connectionString: SOURCE_URL });
const target = new pg.Pool({ connectionString: TARGET_URL });

function keyForBasename(basename: string): string {
  if (basename.startsWith("guide_")) return `guide-images/${basename}`;
  if (basename.startsWith("ref_")) return `references/${basename}`;
  if (basename.startsWith("video_")) return `videos/${basename}`;
  if (basename.startsWith("source_image_") || basename.startsWith("source_video_")) {
    return `video-sources/${basename}`;
  }
  return `images/${basename}`;
}

function contentTypeFor(basename: string): string {
  const ext = path.extname(basename).toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
  };
  return map[ext] ?? "application/octet-stream";
}

const urlCache = new Map<string, string | null>();
const stats = { migrated: 0, skipped: 0, externalKept: 0, missing: 0 };

async function migrateUrl(srcUrl: string | null | undefined): Promise<string | null> {
  if (!srcUrl) return null;
  if (urlCache.has(srcUrl)) return urlCache.get(srcUrl)!;

  // External URL (Runway/Kling CDN, https://..., etc.) — preserve as-is.
  if (!srcUrl.startsWith("/api/uploads/")) {
    urlCache.set(srcUrl, srcUrl);
    stats.externalKept++;
    return srcUrl;
  }

  const basename = path.basename(srcUrl);
  const key = keyForBasename(basename);
  const fileUrl = `${REPLIT_BASE}/api/uploads/${basename}`;

  try {
    const res = await fetch(fileUrl);
    if (!res.ok) {
      console.warn(`  ! file 404/error: ${basename} (HTTP ${res.status}) — keeping original URL`);
      urlCache.set(srcUrl, srcUrl);
      stats.missing++;
      return srcUrl;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const newUrl = await uploadBuffer(key, buf, contentTypeFor(basename));
    urlCache.set(srcUrl, newUrl);
    stats.migrated++;
    return newUrl;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`  ! ${basename}: ${msg} — keeping original URL`);
    urlCache.set(srcUrl, srcUrl);
    stats.missing++;
    return srcUrl;
  }
}

function placeholders(n: number): string {
  return Array.from({ length: n }, (_, i) => `$${i + 1}`).join(", ");
}

async function copyPlain(table: string, columns: string[]): Promise<void> {
  const { rows } = await source.query(`SELECT * FROM ${table} ORDER BY id`);
  console.log(`\n[${table}] ${rows.length} row(s)`);
  for (const row of rows) {
    const vals = columns.map((c) => row[c]);
    await target.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders(columns.length)}) ON CONFLICT (id) DO NOTHING`,
      vals,
    );
  }
  await resetSequence(table);
  console.log(`  ✓ inserted into target`);
}

async function resetSequence(table: string): Promise<void> {
  await target.query(
    `SELECT setval(pg_get_serial_sequence($1, 'id'),
                   GREATEST(COALESCE((SELECT MAX(id) FROM ${table}), 0), 1),
                   (SELECT MAX(id) FROM ${table}) IS NOT NULL)`,
    [table],
  );
}

async function main(): Promise<void> {
  console.log(`source: ${SOURCE_URL!.replace(/:[^@]+@/, ":****@")}`);
  console.log(`target: ${TARGET_URL!.replace(/:[^@]+@/, ":****@")}`);
  console.log(`files : ${REPLIT_BASE}/api/uploads/...`);

  await copyPlain("categories", ["id", "name", "parent_id", "created_at"]);
  await copyPlain("tasks", ["id", "name", "created_at", "updated_at"]);
  await copyPlain("video_tasks", ["id", "name", "created_at", "updated_at"]);

  // products — has reference_image_url
  {
    const { rows } = await source.query(`SELECT * FROM products ORDER BY id`);
    console.log(`\n[products] ${rows.length} row(s)`);
    for (const r of rows) {
      const newRef = await migrateUrl(r.reference_image_url);
      await target.query(
        `INSERT INTO products (id, name, description, category, reference_image_url, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
        [r.id, r.name, r.description, r.category, newRef, r.created_at, r.updated_at],
      );
    }
    await resetSequence("products");
    console.log(`  ✓ inserted into target`);
  }

  // guide_images
  {
    const { rows } = await source.query(`SELECT * FROM guide_images ORDER BY id`);
    console.log(`\n[guide_images] ${rows.length} row(s)`);
    for (const r of rows) {
      const newUrl = (await migrateUrl(r.image_url)) ?? r.image_url;
      await target.query(
        `INSERT INTO guide_images (id, type, file_name, image_url, name, created_at)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
        [r.id, r.type, r.file_name, newUrl, r.name, r.created_at],
      );
    }
    await resetSequence("guide_images");
    console.log(`  ✓ inserted into target`);
  }

  // images — self-referential parent_id, so 2 passes
  {
    const { rows } = await source.query(`SELECT * FROM images ORDER BY id`);
    console.log(`\n[images] ${rows.length} row(s) — 2-pass for parent_id self-ref`);
    for (const r of rows) {
      const newUrl = (await migrateUrl(r.image_url)) ?? r.image_url;
      await target.query(
        `INSERT INTO images
         (id, product_id, task_id, tag, file_name, image_url, prompt, model,
          overlay_text, status, parent_id, variation_group_id, variation_index, mask_data,
          created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,$11,$12,$13,$14,$15)
         ON CONFLICT (id) DO NOTHING`,
        [
          r.id, r.product_id, r.task_id, r.tag, r.file_name, newUrl, r.prompt, r.model,
          r.overlay_text, r.status, r.variation_group_id, r.variation_index, r.mask_data,
          r.created_at, r.updated_at,
        ],
      );
    }
    // Pass 2: backfill parent_id
    let parentLinked = 0;
    for (const r of rows) {
      if (r.parent_id != null) {
        await target.query(`UPDATE images SET parent_id = $1 WHERE id = $2`, [r.parent_id, r.id]);
        parentLinked++;
      }
    }
    await resetSequence("images");
    console.log(`  ✓ inserted; ${parentLinked} parent_id link(s) restored`);
  }

  // videos
  {
    const { rows } = await source.query(`SELECT * FROM videos ORDER BY id`);
    console.log(`\n[videos] ${rows.length} row(s)`);
    for (const r of rows) {
      const newVideoUrl = (await migrateUrl(r.video_url)) ?? r.video_url ?? "";
      const newSrcImg = await migrateUrl(r.source_image_url);
      const newSrcVid = await migrateUrl(r.source_video_url);
      await target.query(
        `INSERT INTO videos
         (id, video_task_id, name, file_name, video_url, source_type,
          source_image_url, source_video_url, prompt, model, replicate_prediction_id,
          status, error_message, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (id) DO NOTHING`,
        [
          r.id, r.video_task_id, r.name, r.file_name, newVideoUrl, r.source_type,
          newSrcImg, newSrcVid, r.prompt, r.model, r.replicate_prediction_id,
          r.status, r.error_message, r.created_at, r.updated_at,
        ],
      );
    }
    await resetSequence("videos");
    console.log(`  ✓ inserted into target`);
  }

  console.log(`\n=== summary ===`);
  console.log(`  files uploaded to R2 : ${stats.migrated}`);
  console.log(`  external URLs kept   : ${stats.externalKept}`);
  console.log(`  missing/failed       : ${stats.missing}`);

  await source.end();
  await target.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
