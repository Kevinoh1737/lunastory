/**
 * Cloudflare R2 object storage helper (S3-compatible).
 *
 * Replaces the Replit-era local-disk `uploads/` storage and the Replit GCS
 * sidecar. All generated images, uploaded references and generated videos are
 * stored in a single R2 bucket and served to browsers directly from R2's
 * public URL / CDN (the bucket must have public access enabled).
 *
 * Required env vars (see artifacts/api-server/.env.example):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET, R2_PUBLIC_BASE_URL
 * Optional:
 *   R2_ENDPOINT — defaults to https://<account>.r2.cloudflarestorage.com
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required but was not provided.`);
  }
  return value;
}

const accountId = requireEnv("R2_ACCOUNT_ID");
const bucket = requireEnv("R2_BUCKET");
const publicBaseUrl = requireEnv("R2_PUBLIC_BASE_URL").replace(/\/+$/, "");

const client = new S3Client({
  region: "auto",
  endpoint:
    process.env.R2_ENDPOINT ||
    `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
  },
});

/** Build the public (CDN) URL for an object key. */
export function publicUrlForKey(key: string): string {
  return `${publicBaseUrl}/${key}`;
}

/** Extract the object key from a stored public URL, or null if it is not an R2 URL. */
export function keyFromPublicUrl(url: string): string | null {
  const prefix = `${publicBaseUrl}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}

/** True if the URL points at our R2 bucket's public base. */
export function isR2Url(url: string): boolean {
  return url.startsWith(`${publicBaseUrl}/`);
}

/** Upload a buffer to R2 and return its public URL. */
export async function uploadBuffer(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return publicUrlForKey(key);
}

/** Delete an object by key. */
export async function deleteObjectByKey(key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * Delete an object given a stored public URL. No-ops for legacy `/api/uploads/`
 * URLs or external URLs (nothing to delete in R2).
 */
export async function deleteByPublicUrl(url: string): Promise<void> {
  const key = keyFromPublicUrl(url);
  if (!key) return;
  await deleteObjectByKey(key);
}

/** Generate a time-limited presigned GET URL for an object key. */
export function presignGetUrl(key: string, ttlSec = 7200): Promise<string> {
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: ttlSec },
  );
}

/**
 * Fetch an R2-hosted object and return its raw bytes as base64 plus MIME type.
 * Returns null if the URL does not point at our R2 bucket — this also serves as
 * an SSRF guard, since only our own bucket's URLs are ever fetched.
 */
export async function fetchR2ObjectAsBase64(
  url: string,
): Promise<{ base64: string; mimeType: string } | null> {
  if (!isR2Url(url)) return null;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch R2 object ${url}: ${res.status}`);
  }
  const mimeType = res.headers.get("content-type") || "application/octet-stream";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { base64: buffer.toString("base64"), mimeType };
}
