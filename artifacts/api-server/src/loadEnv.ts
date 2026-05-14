/**
 * Loads `artifacts/api-server/.env` for local development if the file exists.
 *
 * This is a side-effect module — it must be imported *before* any module that
 * reads `process.env` at import time (e.g. ./app -> routes -> lib/r2).
 *
 * In production (Cloud Run) no `.env` file is present; env vars are injected by
 * the platform, so this is a no-op there.
 */
import { existsSync } from "node:fs";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
  console.log("[env] Loaded .env file for local development");
}
