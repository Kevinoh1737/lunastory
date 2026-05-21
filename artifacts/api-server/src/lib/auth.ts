/**
 * Soft-lock auth: a single shared password unlocks the app. On success the
 * server hands back an HMAC-signed token (`<expMs>.<hmac>`) that the client
 * stores in localStorage and sends as `Authorization: Bearer <token>`.
 *
 * This is a temporary measure until per-user auth is built. Designed to swap
 * out without touching route handlers.
 */
import crypto from "node:crypto";

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSecret(): string {
  const s = process.env.APP_AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "APP_AUTH_SECRET env var is required and must be at least 16 chars. " +
        "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"",
    );
  }
  return s;
}

export function checkPassword(submitted: string): boolean {
  const expected = process.env.APP_ACCESS_PASSWORD ?? "";
  if (!expected) return false;
  if (submitted.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(submitted), Buffer.from(expected));
}

export function issueToken(ttlMs: number = DEFAULT_TTL_MS): string {
  const exp = Date.now() + ttlMs;
  const payload = String(exp);
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("hex")
    .slice(0, 32);
  return `${payload}.${sig}`;
}

export function verifyToken(token: string | undefined | null): boolean {
  if (!token || typeof token !== "string") return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now()) return false;

  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(exp)
    .digest("hex")
    .slice(0, 32);

  // Constant-time compare; lengths must match for timingSafeEqual.
  if (sig.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function bearerFromHeader(header: string | undefined): string | null {
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}
