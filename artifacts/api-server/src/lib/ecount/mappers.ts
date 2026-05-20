/**
 * Pure functions converting Ecount payloads to Drizzle insert shapes.
 * No DB I/O here — sync.ts wires these up.
 */
import type { InsertSku, InsertInventorySnapshot } from "@workspace/db";
import type { EcountBasicProduct, EcountInventoryBalanceRow } from "./client";

function s(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const str = String(v);
  return str === "" ? null : str;
}

/**
 * Ecount sends numbers as strings with trailing zeros (e.g. "29051.0000000000"
 * or "0.0000000000"). Numerics with all-zero values map to null (genuinely
 * unset), so forecast logic doesn't treat "no data" as "zero price".
 */
function n(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const str = String(v);
  if (str === "" || str === "0" || /^0+\.0+$/.test(str)) return null;
  return str;
}

export function ecountItemToSku(item: EcountBasicProduct): InsertSku {
  return {
    skuCode: String(item.PROD_CD ?? ""),
    displayName: String(item.PROD_DES ?? ""),
    sizeDes: s(item.SIZE_DES),
    unit: s(item.UNIT),
    barCode: s(item.BAR_CODE),
    prodType: s(item.PROD_TYPE),

    classCd1: s(item.CLASS_CD),
    classCd2: s(item.CLASS_CD2),
    classCd3: s(item.CLASS_CD3),

    cont1: s(item.CONT1),
    cont2: s(item.CONT2),
    cont3: s(item.CONT3),
    cont4: s(item.CONT4),
    cont5: s(item.CONT5),
    cont6: s(item.CONT6),

    inPriceKrw: n(item.IN_PRICE),
    outPriceKrw: n(item.OUT_PRICE),
    safeQty: n(item.SAFE_QTY),
    minQty: n(item.MIN_QTY),

    defaultWarehouse: s(item.WH_CD),
    custCode: s(item.CUST),
    remarks: s(item.REMARKS),

    ecountRaw: item,
    ecountSyncedAt: new Date(),
  };
}

export function ecountStockRowToSnapshot(
  row: EcountInventoryBalanceRow,
  options: { warehouseCode?: string; snapshotDate: string },
): InsertInventorySnapshot {
  return {
    skuCode: String(row.PROD_CD),
    warehouseCode: options.warehouseCode ?? "",
    snapshotDate: options.snapshotDate,
    balanceQty: String(row.BAL_QTY),
  };
}
