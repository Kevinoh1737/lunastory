/**
 * Ecount → Luna Story sync orchestrator.
 *
 * Two resources today:
 *   - 'skus'      — full SKU master (mostly small, ~1500 rows; safe to pull every time)
 *   - 'inventory' — daily stock snapshot per SKU (~600 rows)
 *
 * Idempotent: `INSERT … ON CONFLICT … DO UPDATE` on both. Records progress
 * + last error to `ecount_sync_state` (one row per resource).
 *
 * Sales sync is intentionally deferred — we need to discover the sales
 * endpoint name first (see /artifacts/api-server/scripts/ecount-explore.ts).
 */
import { randomUUID } from "node:crypto";
import { db, skusTable, inventorySnapshotsTable, ecountSyncStateTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getBasicProductsList, getInventoryBalance } from "./client";
import { ecountItemToSku, ecountStockRowToSnapshot } from "./mappers";

export type SyncResult = {
  resource: "skus" | "inventory";
  runId: string;
  ok: boolean;
  rowsRead: number;
  rowsWritten: number;
  durationMs: number;
  error?: string;
};

async function recordSyncState(
  resource: SyncResult["resource"],
  runId: string,
  ok: boolean,
  error?: string,
): Promise<void> {
  await db
    .insert(ecountSyncStateTable)
    .values({
      resource,
      lastSyncedAt: new Date(),
      lastCursor: null,
      lastError: ok ? null : (error ?? "unknown"),
      lastRunId: runId,
    })
    .onConflictDoUpdate({
      target: ecountSyncStateTable.resource,
      set: {
        lastSyncedAt: new Date(),
        lastError: ok ? null : (error ?? "unknown"),
        lastRunId: runId,
      },
    });
}

export async function syncSkus(): Promise<SyncResult> {
  const runId = randomUUID();
  const t0 = Date.now();
  let rowsRead = 0;
  let rowsWritten = 0;
  try {
    const { items, totalCnt } = await getBasicProductsList();
    rowsRead = totalCnt || items.length;
    if (items.length === 0) {
      await recordSyncState("skus", runId, true);
      return { resource: "skus", runId, ok: true, rowsRead, rowsWritten: 0, durationMs: Date.now() - t0 };
    }

    // Upsert in batches to keep statement size reasonable
    const BATCH = 100;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH).map(ecountItemToSku);
      await db
        .insert(skusTable)
        .values(batch)
        .onConflictDoUpdate({
          target: skusTable.skuCode,
          set: {
            displayName: sql`EXCLUDED.display_name`,
            sizeDes: sql`EXCLUDED.size_des`,
            unit: sql`EXCLUDED.unit`,
            barCode: sql`EXCLUDED.bar_code`,
            prodType: sql`EXCLUDED.prod_type`,
            classCd1: sql`EXCLUDED.class_cd_1`,
            classCd2: sql`EXCLUDED.class_cd_2`,
            classCd3: sql`EXCLUDED.class_cd_3`,
            cont1: sql`EXCLUDED.cont1`,
            cont2: sql`EXCLUDED.cont2`,
            cont3: sql`EXCLUDED.cont3`,
            cont4: sql`EXCLUDED.cont4`,
            cont5: sql`EXCLUDED.cont5`,
            cont6: sql`EXCLUDED.cont6`,
            inPriceKrw: sql`EXCLUDED.in_price_krw`,
            outPriceKrw: sql`EXCLUDED.out_price_krw`,
            safeQty: sql`EXCLUDED.safe_qty`,
            minQty: sql`EXCLUDED.min_qty`,
            defaultWarehouse: sql`EXCLUDED.default_warehouse`,
            custCode: sql`EXCLUDED.cust_code`,
            remarks: sql`EXCLUDED.remarks`,
            ecountRaw: sql`EXCLUDED.ecount_raw`,
            ecountSyncedAt: sql`EXCLUDED.ecount_synced_at`,
          },
        });
      rowsWritten += batch.length;
    }

    await recordSyncState("skus", runId, true);
    return { resource: "skus", runId, ok: true, rowsRead, rowsWritten, durationMs: Date.now() - t0 };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordSyncState("skus", runId, false, msg);
    return { resource: "skus", runId, ok: false, rowsRead, rowsWritten, durationMs: Date.now() - t0, error: msg };
  }
}

export async function syncInventorySnapshots(baseDate?: string): Promise<SyncResult> {
  const runId = randomUUID();
  const t0 = Date.now();
  const date = baseDate ?? new Date().toISOString().slice(0, 10).replace(/-/g, "");
  // Format for DATE column: YYYY-MM-DD
  const snapshotDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  let rowsRead = 0;
  let rowsWritten = 0;
  try {
    // Pull one snapshot per warehouse so we keep per-warehouse history.
    // `ECOUNT_INVENTORY_WAREHOUSES` is a comma-separated list of WH_CD codes
    // (e.g. "200" = 덕영창고 from 창고별재고현황). If unset, falls back to
    // the all-warehouses-summed call (WH_CD="") for backward compatibility.
    const whEnv = process.env.ECOUNT_INVENTORY_WAREHOUSES;
    const warehouses = whEnv ? whEnv.split(",").map((s) => s.trim()).filter(Boolean) : [""];

    for (const wh of warehouses) {
      const { rows, totalCnt } = await getInventoryBalance({ baseDate: date, whCd: wh });
      rowsRead += totalCnt || rows.length;
      if (rows.length === 0) continue;

      const BATCH = 200;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows
          .slice(i, i + BATCH)
          .map((r) => ecountStockRowToSnapshot(r, { snapshotDate, warehouseCode: wh }));
        await db
          .insert(inventorySnapshotsTable)
          .values(batch)
          .onConflictDoUpdate({
            target: [
              inventorySnapshotsTable.skuCode,
              inventorySnapshotsTable.warehouseCode,
              inventorySnapshotsTable.snapshotDate,
            ],
            set: {
              balanceQty: sql`EXCLUDED.balance_qty`,
              syncedAt: sql`NOW()`,
            },
          });
        rowsWritten += batch.length;
      }
    }

    await recordSyncState("inventory", runId, true);
    return { resource: "inventory", runId, ok: true, rowsRead, rowsWritten, durationMs: Date.now() - t0 };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordSyncState("inventory", runId, false, msg);
    return { resource: "inventory", runId, ok: false, rowsRead, rowsWritten, durationMs: Date.now() - t0, error: msg };
  }
}

export async function syncAll(): Promise<{ skus: SyncResult; inventory: SyncResult }> {
  // SKUs first so inventory snapshots can FK-validate against a populated table.
  const skus = await syncSkus();
  const inventory = await syncInventorySnapshots();
  return { skus, inventory };
}
