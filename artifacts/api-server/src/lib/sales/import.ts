/**
 * Sales import orchestrator. Consumes the rows produced by the Excel parser,
 * looks up the target channel + SKU FK validity, and upserts into
 * sales_records with ON CONFLICT-do-nothing on (channel_id, external_id).
 *
 * Two modes:
 *   - dryRun: parse + classify (new vs duplicate vs unmapped vs error)
 *             without writing. Powers the preview UI before commit.
 *   - commit: same classification + actually persist new rows.
 */
import { db, salesRecordsTable, skusTable, channelsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import type { ParsedSalesRow, ParseResult } from "./ecount-excel-parser";

export type ImportClassification = {
  newRows: ParsedSalesRow[];
  duplicateRows: ParsedSalesRow[];
  unmappedSkuRows: ParsedSalesRow[];
  errorRows: ParseResult["errors"];
};

export type ImportSummary = {
  parsed: number;
  imported: number;
  duplicates: number;
  unmappedSkus: number;
  errors: number;
  unmappedSkuCodes: string[]; // unique codes for UI display
  warnings: string[];
  refundCount: number;
  durationMs: number;
};

const CHANNEL_CODE = "ecount-excel";

async function getChannelId(): Promise<number> {
  const [existing] = await db.select().from(channelsTable).where(eq(channelsTable.code, CHANNEL_CODE));
  if (existing) return existing.id;
  // Seed on first use (harmless if multiple importers race)
  const [created] = await db
    .insert(channelsTable)
    .values({ code: CHANNEL_CODE, displayName: "Ecount 매출 엑셀" })
    .onConflictDoNothing()
    .returning();
  if (created) return created.id;
  // Lost the race — re-read
  const [after] = await db.select().from(channelsTable).where(eq(channelsTable.code, CHANNEL_CODE));
  if (!after) throw new Error("Failed to seed ecount-excel channel");
  return after.id;
}

async function classify(parsed: ParseResult): Promise<ImportClassification> {
  const channelId = await getChannelId();

  // Validate which SKU codes exist in our master
  const skuCodes = [...new Set(parsed.rows.map((r) => r.skuCode))];
  const knownSkus = new Set<string>();
  if (skuCodes.length > 0) {
    const found = await db
      .select({ sku_code: skusTable.skuCode })
      .from(skusTable)
      .where(inArray(skusTable.skuCode, skuCodes));
    found.forEach((r) => knownSkus.add(r.sku_code));
  }

  // Detect duplicates by querying existing external_ids for this channel
  const externalIds = parsed.rows.map((r) => r.externalId);
  const dupeIds = new Set<string>();
  if (externalIds.length > 0) {
    const existing = await db
      .select({ external_id: salesRecordsTable.externalId })
      .from(salesRecordsTable)
      .where(
        and(
          eq(salesRecordsTable.channelId, channelId),
          inArray(salesRecordsTable.externalId, externalIds),
        ),
      );
    existing.forEach((r) => r.external_id && dupeIds.add(r.external_id));
  }

  const newRows: ParsedSalesRow[] = [];
  const duplicateRows: ParsedSalesRow[] = [];
  const unmappedSkuRows: ParsedSalesRow[] = [];
  for (const row of parsed.rows) {
    if (!knownSkus.has(row.skuCode)) {
      unmappedSkuRows.push(row);
      continue;
    }
    if (dupeIds.has(row.externalId)) {
      duplicateRows.push(row);
      continue;
    }
    newRows.push(row);
  }

  return { newRows, duplicateRows, unmappedSkuRows, errorRows: parsed.errors };
}

export async function importSales(parsed: ParseResult, mode: "dry-run" | "commit"): Promise<ImportSummary> {
  const t0 = Date.now();
  const channelId = await getChannelId();
  const cls = await classify(parsed);

  if (mode === "commit" && cls.newRows.length > 0) {
    const BATCH = 200;
    for (let i = 0; i < cls.newRows.length; i += BATCH) {
      const slice = cls.newRows.slice(i, i + BATCH);
      const values = slice.map((r) => ({
        channelId,
        skuCode: r.skuCode,
        externalId: r.externalId,
        soldAt: r.soldAt,
        quantity: r.quantity,
        unitPriceKrw: r.unitPriceKrw,
        isRefund: r.isRefund,
        rawPayload: r.raw,
      }));
      await db
        .insert(salesRecordsTable)
        .values(values)
        .onConflictDoNothing({
          target: [salesRecordsTable.channelId, salesRecordsTable.externalId],
        });
    }
  }

  const unique = new Set<string>();
  cls.unmappedSkuRows.forEach((r) => unique.add(r.skuCode));

  return {
    parsed: parsed.rows.length,
    imported: mode === "commit" ? cls.newRows.length : 0,
    duplicates: cls.duplicateRows.length,
    unmappedSkus: cls.unmappedSkuRows.length,
    errors: cls.errorRows.length,
    unmappedSkuCodes: [...unique].slice(0, 50),
    warnings: parsed.warnings,
    refundCount: cls.newRows.filter((r) => r.isRefund).length + (mode === "dry-run" ? cls.duplicateRows.filter((r) => r.isRefund).length : 0),
    durationMs: Date.now() - t0,
  };
}
