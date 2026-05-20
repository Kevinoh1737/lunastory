/**
 * Read-only inventory endpoints.
 *
 *   GET /api/inventory/on-hand            — current on-hand (latest snapshot per SKU)
 *   GET /api/inventory/sku/:code/history  — snapshot history for one SKU
 */
import { Router, type IRouter } from "express";
import { db, inventorySnapshotsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 2000;

function parseInt0(s: unknown, fallback: number, max?: number): number {
  if (typeof s !== "string") return fallback;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return max != null ? Math.min(n, max) : n;
}

/**
 * Latest snapshot per SKU, joined to SKU master for name + class + price.
 * Uses Postgres DISTINCT ON for efficiency.
 *
 *   ?q=substring     (matches sku_code or display_name)
 *   ?class=00001     (filter by class_cd_1)
 *   ?nonZero=true    (hide SKUs with 0 balance)
 *   ?limit / ?offset
 */
router.get("/inventory/on-hand", async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const classCd1 = typeof req.query.class === "string" ? req.query.class : undefined;
  const nonZero = req.query.nonZero === "true";
  const limit = parseInt0(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const offset = parseInt0(req.query.offset, 0);

  const whereClauses: string[] = [];
  const params: unknown[] = [];
  if (q) {
    params.push(`%${q}%`);
    const i = params.length;
    whereClauses.push(`(s.sku_code ILIKE $${i} OR s.display_name ILIKE $${i})`);
  }
  if (classCd1) {
    params.push(classCd1);
    whereClauses.push(`s.class_cd_1 = $${params.length}`);
  }
  if (nonZero) {
    whereClauses.push(`COALESCE(agg.balance_qty, 0) <> 0`);
  }
  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  // DISTINCT ON gives us the latest snapshot per (sku_code, warehouse) — for
  // the on-hand view we want one row per SKU, so we pre-aggregate across
  // warehouses too (SUM of latest balances per warehouse).
  const baseSql = `
    WITH latest AS (
      SELECT DISTINCT ON (sku_code, warehouse_code)
             sku_code, warehouse_code, balance_qty, snapshot_date
      FROM inventory_snapshots
      ORDER BY sku_code, warehouse_code, snapshot_date DESC
    ),
    agg AS (
      SELECT sku_code,
             SUM(balance_qty)::numeric(14,4) AS balance_qty,
             MAX(snapshot_date) AS snapshot_date
      FROM latest
      GROUP BY sku_code
    )
    SELECT s.sku_code, s.display_name, s.unit, s.class_cd_1, s.in_price_krw,
           COALESCE(agg.balance_qty, 0) AS balance_qty,
           agg.snapshot_date,
           s.safe_qty
    FROM skus s
    LEFT JOIN agg ON agg.sku_code = s.sku_code
    ${whereSql}
    ORDER BY s.sku_code
    LIMIT ${limit} OFFSET ${offset}
  `;
  const countSql = `
    WITH latest AS (
      SELECT DISTINCT ON (sku_code, warehouse_code) sku_code, warehouse_code, balance_qty
      FROM inventory_snapshots
      ORDER BY sku_code, warehouse_code, snapshot_date DESC
    ),
    agg AS (
      SELECT sku_code, SUM(balance_qty)::numeric(14,4) AS balance_qty
      FROM latest GROUP BY sku_code
    )
    SELECT COUNT(*)::int AS c FROM skus s
    LEFT JOIN agg ON agg.sku_code = s.sku_code
    ${whereSql}
  `;

  const [{ rows: items }, { rows: countRows }] = await Promise.all([
    db.$client.query(baseSql, params),
    db.$client.query(countSql, params),
  ]);
  res.json({ total: countRows[0]?.c ?? 0, limit, offset, items });
});

router.get("/inventory/sku/:code/history", async (req, res): Promise<void> => {
  const code = req.params.code;
  const limit = parseInt0(req.query.limit, 90, 365);
  const rows = await db
    .select()
    .from(inventorySnapshotsTable)
    .where(eq(inventorySnapshotsTable.skuCode, code))
    .orderBy(desc(inventorySnapshotsTable.snapshotDate))
    .limit(limit);
  res.json({ skuCode: code, items: rows });
});

export default router;
