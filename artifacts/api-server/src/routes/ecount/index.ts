/**
 * Ecount sync endpoints.
 *
 *   POST /api/ecount/sync          → run skus + inventory sync (synchronous)
 *   POST /api/ecount/sync/skus     → just SKUs
 *   POST /api/ecount/sync/inventory[?date=YYYYMMDD] → just inventory snapshot
 *   GET  /api/ecount/sync/status   → last sync state per resource
 *
 * Auth: if ECOUNT_SYNC_SECRET is set, the request must include header
 *   X-Sync-Secret: <value>. Used by Cloud Scheduler. If unset, endpoints
 *   are open (MVP-grade).
 */
import { Router, type IRouter } from "express";
import { db, ecountSyncStateTable } from "@workspace/db";
import { syncSkus, syncInventorySnapshots, syncAll } from "../../lib/ecount";

const router: IRouter = Router();

function checkSecret(req: { get: (h: string) => string | undefined }): boolean {
  const required = process.env.ECOUNT_SYNC_SECRET;
  if (!required) return true; // unauth in MVP / dev
  return req.get("x-sync-secret") === required;
}

router.post("/ecount/sync", async (req, res): Promise<void> => {
  if (!checkSecret(req)) { res.status(401).json({ error: "Bad sync secret" }); return; }
  try {
    const result = await syncAll();
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/ecount/sync/skus", async (req, res): Promise<void> => {
  if (!checkSecret(req)) { res.status(401).json({ error: "Bad sync secret" }); return; }
  try {
    res.json(await syncSkus());
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/ecount/sync/inventory", async (req, res): Promise<void> => {
  if (!checkSecret(req)) { res.status(401).json({ error: "Bad sync secret" }); return; }
  try {
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    res.json(await syncInventorySnapshots(date));
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/ecount/sync/status", async (_req, res): Promise<void> => {
  const rows = await db.select().from(ecountSyncStateTable);
  res.json(rows);
});

export default router;
