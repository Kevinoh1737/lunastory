/**
 * Read-only SKU endpoints. During the Ecount bridge period, writes happen
 * via /api/ecount/sync — this router is just for browsing.
 *
 *   GET /api/skus              — paginated list with filters
 *   GET /api/skus/:code        — single SKU detail
 *   GET /api/skus/classes      — distinct class_cd_1 / class_cd_2 codes (for filter UIs)
 */
import { Router, type IRouter } from "express";
import { db, skusTable } from "@workspace/db";
import { and, eq, ilike, or, sql, asc, type SQL } from "drizzle-orm";

const router: IRouter = Router();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

function parseInt0(s: unknown, fallback: number, max?: number): number {
  if (typeof s !== "string") return fallback;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return max != null ? Math.min(n, max) : n;
}

router.get("/skus", async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const classCd1 = typeof req.query.class === "string" ? req.query.class : undefined;
  const prodType = typeof req.query.prodType === "string" ? req.query.prodType : undefined;
  const activeOnly = req.query.active !== "false"; // default true
  const limit = parseInt0(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const offset = parseInt0(req.query.offset, 0);

  const conditions: SQL[] = [];
  if (activeOnly) conditions.push(eq(skusTable.active, true));
  if (classCd1) conditions.push(eq(skusTable.classCd1, classCd1));
  if (prodType) conditions.push(eq(skusTable.prodType, prodType));
  if (q) {
    const pattern = `%${q}%`;
    const matcher = or(
      ilike(skusTable.skuCode, pattern),
      ilike(skusTable.displayName, pattern),
      ilike(skusTable.barCode, pattern),
    );
    if (matcher) conditions.push(matcher);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, total] = await Promise.all([
    db
      .select({
        skuCode: skusTable.skuCode,
        displayName: skusTable.displayName,
        sizeDes: skusTable.sizeDes,
        unit: skusTable.unit,
        prodType: skusTable.prodType,
        classCd1: skusTable.classCd1,
        classCd2: skusTable.classCd2,
        cont2: skusTable.cont2,
        cont3: skusTable.cont3,
        inPriceKrw: skusTable.inPriceKrw,
        outPriceKrw: skusTable.outPriceKrw,
        safeQty: skusTable.safeQty,
        cartonUnits: skusTable.cartonUnits,
        leadTimeDays: skusTable.leadTimeDays,
        ecountSyncedAt: skusTable.ecountSyncedAt,
      })
      .from(skusTable)
      .where(where)
      .orderBy(asc(skusTable.skuCode))
      .limit(limit)
      .offset(offset),
    db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(skusTable)
      .where(where)
      .then((r) => r[0]?.c ?? 0),
  ]);

  res.json({ total, limit, offset, items });
});

router.get("/skus/classes", async (_req, res): Promise<void> => {
  // Distinct class codes for filter dropdowns. Cheap query — 1500 rows.
  const rows = await db
    .select({ classCd1: skusTable.classCd1, classCd2: skusTable.classCd2 })
    .from(skusTable)
    .where(eq(skusTable.active, true));
  const level1 = new Map<string, number>();
  const level2 = new Map<string, number>();
  for (const r of rows) {
    if (r.classCd1) level1.set(r.classCd1, (level1.get(r.classCd1) ?? 0) + 1);
    if (r.classCd2) level2.set(r.classCd2, (level2.get(r.classCd2) ?? 0) + 1);
  }
  res.json({
    classCd1: [...level1.entries()].sort().map(([code, count]) => ({ code, count })),
    classCd2: [...level2.entries()].sort().map(([code, count]) => ({ code, count })),
  });
});

router.get("/skus/:code", async (req, res): Promise<void> => {
  const code = req.params.code;
  const [sku] = await db.select().from(skusTable).where(eq(skusTable.skuCode, code)).limit(1);
  if (!sku) {
    res.status(404).json({ error: "SKU not found" });
    return;
  }
  res.json(sku);
});

export default router;
