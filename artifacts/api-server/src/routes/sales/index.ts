/**
 * Sales upload endpoints.
 *
 *   POST /api/sales/import-excel?dryRun=true   - parse + classify without writing
 *   POST /api/sales/import-excel               - parse + commit
 *
 *   GET  /api/sales/imports                    - recent import events
 *                                                (derived from sales_records.imported_at)
 */
import { Router, type IRouter } from "express";
import multer from "multer";
import { db, salesRecordsTable, channelsTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { parseEcountSalesExcel } from "../../lib/sales/ecount-excel-parser";
import { importSales } from "../../lib/sales/import";

const router: IRouter = Router();

// In-memory multer — file is parsed immediately and never lands on disk.
// The xlsx files are small (tens of KB to a few MB) so this is fine for
// Cloud Run; the alternative would be R2 staging.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB hard cap
});

router.post("/sales/import-excel", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded under field name 'file'" });
    return;
  }
  const dryRun = req.query.dryRun === "true" || req.query.dryRun === "1";

  try {
    const parsed = parseEcountSalesExcel(req.file.buffer);
    const summary = await importSales(parsed, dryRun ? "dry-run" : "commit");
    res.json({
      mode: dryRun ? "dry-run" : "commit",
      filename: req.file.originalname,
      filesize: req.file.size,
      ...summary,
      // sample failed rows for debugging — capped to keep response small
      errorSamples: parsed.errors.slice(0, 10),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sales/import-excel] failed:", msg);
    res.status(500).json({ error: msg });
  }
});

router.get("/sales/imports", async (_req, res): Promise<void> => {
  // No dedicated import_events table yet — synthesize a feed from sales_records
  // grouped by minute of imported_at (rows in a single upload share a tight cluster).
  const rows = await db
    .select({
      bucket: sql<string>`date_trunc('minute', ${salesRecordsTable.importedAt})::text`,
      count: sql<number>`COUNT(*)::int`,
      refunds: sql<number>`COUNT(*) FILTER (WHERE ${salesRecordsTable.isRefund})::int`,
      firstSoldAt: sql<string>`MIN(${salesRecordsTable.soldAt})::text`,
      lastSoldAt: sql<string>`MAX(${salesRecordsTable.soldAt})::text`,
      channelCode: channelsTable.code,
    })
    .from(salesRecordsTable)
    .innerJoin(channelsTable, eq(salesRecordsTable.channelId, channelsTable.id))
    .groupBy(sql`date_trunc('minute', ${salesRecordsTable.importedAt})`, channelsTable.code)
    .orderBy(desc(sql`date_trunc('minute', ${salesRecordsTable.importedAt})`))
    .limit(20);
  res.json({ imports: rows });
});

export default router;
