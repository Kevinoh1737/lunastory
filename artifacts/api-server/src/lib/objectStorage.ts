import { Storage } from "@google-cloud/storage";
import { randomUUID } from "crypto";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

async function signGetUrl(bucketName: string, objectName: string, ttlSec: number): Promise<string> {
  const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method: "GET",
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Failed to sign object URL: ${response.status}`);
  }
  const json = await response.json() as { signed_url: string };
  return json.signed_url;
}

/**
 * Uploads a Buffer to GCS and returns a signed GET URL valid for `ttlSec` seconds.
 * Throws if DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set.
 */
export async function uploadBufferToStorage(
  buffer: Buffer,
  fileName: string,
  contentType: string,
  ttlSec: number = 7200
): Promise<string> {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    throw new Error(
      "DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set — object storage is not provisioned"
    );
  }
  const objectName = `video-source-uploads/${randomUUID()}-${fileName}`;
  const file = storageClient.bucket(bucketId).file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return signGetUrl(bucketId, objectName, ttlSec);
}
