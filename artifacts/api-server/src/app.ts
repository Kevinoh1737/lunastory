import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";

const app: Express = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Images and videos are stored in and served directly from Cloudflare R2.
// (The Replit-era local `/api/uploads` static mount was removed in the migration.)
app.use("/api", router);

export default app;
