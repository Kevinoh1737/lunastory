/**
 * Second-pass migration: upload locally-staged Replit upload files to R2 and
 * rewrite the `/api/uploads/<basename>` URLs in the (already-migrated) Neon DB.
 *
 * Run after migrate-from-replit.ts has copied the rows, once a copy of
 * Replit's artifacts/api-server/uploads/ folder has been downloaded locally.
 *
 *   cd artifacts/api-server
 *   LOCAL_UPLOADS_DIR=/Users/kevinoh/Downloads/uploads \
 *   pnpm exec tsx scripts/migrate-uploads-from-local.ts
 *
 * Idempotent: each file is reuploaded (harmless, replaces same key) and only
 * rows whose URL still starts with `/api/uploads/` are touched.
 */
import "../src/loadEnv";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { uploadBuffer } from "../src/lib/r2";

const LOCAL_DIR = process.env.LOCAL_UPLOADS_DIR;
const TARGET_URL = process.env.DATABASE_URL;
if (!LOCAL_DIR) throw new Error("LOCAL_UPLOADS_DIR env var is required");
if (!TARGET_URL) throw new Error("DATABASE_URL env var is required");
if (!fs.existsSync(LOCAL_DIR)) throw new Error(`Directory not found: ${LOCAL_DIR}`);

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

// Columns to scan for `/api/uploads/<basename>` URLs.
const URL_COLUMNS: Array<{ table: string; column: string }> = [
  { table: "images", column: "image_url" },
  { table: "guide_images", column: "image_url" },
  { table: "videos", column: "video_url" },
  { table: "videos", column: "source_image_url" },
  { table: "videos", column: "source_video_url" },
  { table: "products", column: "reference_image_url" },
];

async function main(): Promise<void> {
  const target = new pg.Pool({ connectionString: TARGET_URL });

  // 1. Index files in the local dir.
  const entries = fs.readdirSync(LOCAL_DIR!, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  console.log(`Found ${files.length} file(s) under ${LOCAL_DIR}`);

  // 2. Upload each to R2 under the right prefix; build basename -> new URL map.
  const newUrl = new Map<string, string>();
  let uploaded = 0;
  for (const basename of files) {
    const key = keyForBasename(basename);
    const buf = fs.readFileSync(path.join(LOCAL_DIR!, basename));
    const url = await uploadBuffer(key, buf, contentTypeFor(basename));
    newUrl.set(basename, url);
    uploaded++;
    if (uploaded % 5 === 0) process.stdout.write(`\r  uploaded ${uploaded}/${files.length}`);
  }
  console.log(`\n  uploaded ${uploaded}/${files.length}`);

  // 3. For each URL column, find rows still pointing at /api/uploads/<basename>
  //    where that basename was uploaded, and rewrite.
  console.log(`\nRewriting DB URLs:`);
  let totalRowsUpdated = 0;
  for (const { table, column } of URL_COLUMNS) {
    let rowsUpdated = 0;
    for (const [basename, url] of newUrl) {
      const oldUrl = `/api/uploads/${basename}`;
      const { rowCount } = await target.query(
        `UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`,
        [url, oldUrl],
      );
      rowsUpdated += rowCount ?? 0;
    }
    console.log(`  ${table}.${column}: ${rowsUpdated} row(s) updated`);
    totalRowsUpdated += rowsUpdated;
  }

  // 4. Report any DB URLs that still reference /api/uploads (file not found locally).
  console.log(`\nLeftover /api/uploads/ URLs (file missing locally):`);
  for (const { table, column } of URL_COLUMNS) {
    const { rows } = await target.query(
      `SELECT ${column} FROM ${table} WHERE ${column} LIKE '/api/uploads/%'`,
    );
    if (rows.length) {
      console.log(`  ${table}.${column}: ${rows.length} stale`);
      rows.slice(0, 5).forEach((r: Record<string, unknown>) => console.log(`    ${r[column]}`));
    } else {
      console.log(`  ${table}.${column}: clean ✓`);
    }
  }

  console.log(`\n=== summary ===`);
  console.log(`  files uploaded to R2 : ${uploaded}`);
  console.log(`  DB rows updated      : ${totalRowsUpdated}`);
  await target.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
