/**
 * Parser for the "이카운트 매출&반품 양식" Excel template.
 *
 * Header row defines 22 columns (Korean labels). Data rows below. Same
 * template handles sales AND returns — distinguished by sign of 수량 (qty):
 *   qty > 0 → sale
 *   qty < 0 → refund / return
 *
 * The Excel itself carries no Ecount-side slip ID (those are minted on
 * upload), so dedup keys off a content hash of the row's stable fields.
 */
import * as XLSX from "xlsx";
import crypto from "node:crypto";

/** Canonical field names for the columns we recognise. */
type CanonicalKey =
  | "date"
  | "lineNo"
  | "customerCode"
  | "customerName"
  | "operatorCode"
  | "warehouseCode"
  | "txnType"
  | "currency"
  | "exchangeRate"
  | "skuCode"
  | "skuName"
  | "size"
  | "quantity"
  | "unitPrice"
  | "amountForeign"
  | "supplyAmount"
  | "vat"
  | "remarks"
  | "createProductionSlip"
  | "unitPriceVatInclusive"
  | "managementItem"
  | "ecountMarker";

/**
 * Maps Excel header text → canonical key. Lenient on minor variations
 * (whitespace, ASCII parens). If the user's template adds/removes columns
 * over time, only the missing rows are warnings — known columns still map.
 */
const HEADER_MAP: Record<string, CanonicalKey> = {
  "일자": "date",
  "순번": "lineNo",
  "거래처코드": "customerCode",
  "거래처명": "customerName",
  "담당자": "operatorCode",
  "출하창고": "warehouseCode",
  "거래유형": "txnType",
  "통화": "currency",
  "환율": "exchangeRate",
  "품목코드": "skuCode",
  "품목명": "skuName",
  "규격": "size",
  "수량": "quantity",
  "단가": "unitPrice",
  "외화금액": "amountForeign",
  "공급가액": "supplyAmount",
  "부가세": "vat",
  "적요": "remarks",
  "생산전표생성": "createProductionSlip",
  "단가(vat포함)": "unitPriceVatInclusive",
  "관리항목": "managementItem",
  "Ecount": "ecountMarker",
};

function normalizeHeader(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

const NORMALIZED_HEADER_MAP: Record<string, CanonicalKey> = Object.fromEntries(
  Object.entries(HEADER_MAP).map(([k, v]) => [normalizeHeader(k), v]),
);

/** A single parsed row, in normalized form, before DB insert. */
export type ParsedSalesRow = {
  // Required for storage
  externalId: string; // SHA-256 hash of stable fields, first 32 hex chars
  soldAt: string; // YYYY-MM-DD
  skuCode: string;
  quantity: string; // numeric as string for NUMERIC(14,4)
  unitPriceKrw: string | null;
  isRefund: boolean;

  // Provenance / raw payload — preserved in raw_payload JSONB
  raw: Record<string, unknown>;

  // File context
  sourceRowIndex: number; // 1-based row in spreadsheet (after header)
};

export type ParseResult = {
  rows: ParsedSalesRow[];
  errors: Array<{ rowIndex: number; reason: string; rawRow: Record<string, unknown> }>;
  warnings: string[]; // top-level (e.g., unrecognised header column)
  recognisedColumns: number;
  totalColumns: number;
};

/** Parse "20260511" (or numeric 20260511, or Excel date) → "2026-05-11". */
function parseDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  // Excel can deliver dates as a serial number (cellDates=false) or a string
  if (typeof value === "number" && Number.isFinite(value)) {
    // YYYYMMDD as integer
    if (value > 19000000 && value < 30000000) {
      const s = String(Math.trunc(value));
      return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    }
    // Excel serial date
    const epochDays = value - 25569;
    const d = new Date(epochDays * 86400 * 1000);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }
  const s = String(value).trim();
  // 20260511 -> 2026-05-11
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  // 2026-05-11 / 2026/05/11
  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return null;
}

function parseNumber(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? String(n) : null;
}

function stableHash(parts: Array<string | null | undefined>): string {
  const input = parts.map((p) => p ?? "").join("|");
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 32);
}

export function parseEcountSalesExcel(buffer: Buffer): ParseResult {
  const wb = XLSX.read(buffer);
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: [], warnings: ["Workbook has no sheets"], recognisedColumns: 0, totalColumns: 0 };
  }
  const ws = wb.Sheets[sheetName];
  // header:1 gives raw arrays; raw:false converts cells to strings/numbers
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });

  if (matrix.length === 0) {
    return { rows: [], errors: [], warnings: ["Sheet is empty"], recognisedColumns: 0, totalColumns: 0 };
  }
  const headerRow = matrix[0];

  // Build column index → canonical key. Unknown columns are still kept in raw payload by original header text.
  const colToKey: Record<number, CanonicalKey> = {};
  const colToRawHeader: Record<number, string> = {};
  const warnings: string[] = [];
  let recognised = 0;
  headerRow.forEach((cell, i) => {
    const raw = String(cell ?? "").trim();
    colToRawHeader[i] = raw;
    if (!raw) return;
    const key = NORMALIZED_HEADER_MAP[normalizeHeader(cell)];
    if (key) {
      colToKey[i] = key;
      recognised++;
    } else {
      warnings.push(`Unrecognised column "${raw}" at index ${i} — kept in raw_payload only`);
    }
  });

  const rows: ParsedSalesRow[] = [];
  const errors: ParseResult["errors"] = [];

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.every((c) => c == null || c === "")) continue; // skip blank rows

    // Normalize to a {canonicalKey | rawHeader: value} object
    const raw: Record<string, unknown> = {};
    const fields: Partial<Record<CanonicalKey, unknown>> = {};
    row.forEach((cell, i) => {
      if (cell === undefined || cell === "") return;
      const key = colToKey[i];
      if (key) fields[key] = cell;
      const header = colToRawHeader[i] || `col_${i}`;
      raw[header] = cell;
    });

    const soldAt = parseDate(fields.date);
    const skuCode = fields.skuCode != null ? String(fields.skuCode).trim() : "";
    const quantity = parseNumber(fields.quantity);
    const unitPrice = parseNumber(fields.unitPrice);

    if (!soldAt) {
      errors.push({ rowIndex: r, reason: "Missing or invalid 일자", rawRow: raw });
      continue;
    }
    if (!skuCode) {
      errors.push({ rowIndex: r, reason: "Missing 품목코드", rawRow: raw });
      continue;
    }
    if (quantity == null) {
      errors.push({ rowIndex: r, reason: "Missing or invalid 수량", rawRow: raw });
      continue;
    }

    const qtyNum = Number(quantity);
    const externalId = stableHash([
      soldAt,
      String(fields.customerCode ?? ""),
      skuCode,
      quantity,
      unitPrice ?? "",
      String(fields.remarks ?? ""),
    ]);

    rows.push({
      externalId,
      soldAt,
      skuCode,
      quantity,
      unitPriceKrw: unitPrice,
      isRefund: qtyNum < 0,
      raw,
      sourceRowIndex: r,
    });
  }

  return {
    rows,
    errors,
    warnings,
    recognisedColumns: recognised,
    totalColumns: headerRow.length,
  };
}
