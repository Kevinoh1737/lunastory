import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";
import { requireAuth } from "./middleware/requireAuth";

const app: Express = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Images and videos are stored in and served directly from Cloudflare R2.
// Soft-lock: requireAuth gates every /api/* path except the public allowlist
// in middleware/requireAuth.ts (healthz, auth/*, ecount/sync*).
app.use("/api", requireAuth, router);

export default app;
