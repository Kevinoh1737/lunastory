/**
 * Thin fetch + TanStack Query wrappers for the Phase 2 inventory endpoints.
 * Direct REST calls (no orval codegen) — when the inventory surface stabilises
 * we'll fold these into the OpenAPI spec.
 */
import { useQuery } from "@tanstack/react-query";
import { authHeader, handleUnauthorized } from "@/lib/auth";

export type SkuListItem = {
  skuCode: string;
  displayName: string;
  sizeDes: string | null;
  unit: string | null;
  prodType: string | null;
  classCd1: string | null;
  classCd2: string | null;
  cont2: string | null; // color (Luna Story convention)
  cont3: string | null; // brand
  inPriceKrw: string | null;
  outPriceKrw: string | null;
  safeQty: string | null;
  cartonUnits: number | null;
  leadTimeDays: number | null;
  ecountSyncedAt: string | null;
};

export type SkuDetail = SkuListItem & {
  barCode: string | null;
  classCd3: string | null;
  cont1: string | null;
  cont4: string | null;
  cont5: string | null;
  cont6: string | null;
  minQty: string | null;
  defaultWarehouse: string | null;
  custCode: string | null;
  remarks: string | null;
  weightG: number | null;
  cartonLCm: string | null;
  cartonWCm: string | null;
  cartonHCm: string | null;
  unitCostUsd: string | null;
  notes: string | null;
  active: boolean;
  productId: number | null;
  ecountRaw: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type OnHandItem = {
  sku_code: string;
  display_name: string;
  unit: string | null;
  class_cd_1: string | null;
  in_price_krw: string | null;
  balance_qty: string;
  snapshot_date: string | null;
  safe_qty: string | null;
};

export type Paged<T> = {
  total: number;
  limit: number;
  offset: number;
  items: T[];
};

export type SnapshotRow = {
  skuCode: string;
  warehouseCode: string;
  snapshotDate: string;
  balanceQty: string;
  syncedAt: string;
};

export type SyncStateRow = {
  resource: string;
  lastSyncedAt: string | null;
  lastCursor: string | null;
  lastError: string | null;
  lastRunId: string | null;
};

export type ImportSummary = {
  mode: "dry-run" | "commit";
  filename: string;
  filesize: number;
  parsed: number;
  imported: number;
  duplicates: number;
  unmappedSkus: number;
  errors: number;
  unmappedSkuCodes: string[];
  warnings: string[];
  refundCount: number;
  durationMs: number;
  errorSamples: Array<{ rowIndex: number; reason: string; rawRow: Record<string, unknown> }>;
};

export type ImportEvent = {
  bucket: string;
  count: number;
  refunds: number;
  firstSoldAt: string;
  lastSoldAt: string;
  channelCode: string;
};

export async function uploadSalesExcel(file: File, dryRun: boolean): Promise<ImportSummary> {
  const formData = new FormData();
  formData.append("file", file);
  const url = `/api/sales/import-excel${dryRun ? "?dryRun=true" : ""}`;
  const res = await fetch(url, { method: "POST", body: formData, headers: { ...authHeader() } });
  if (res.status === 401) { handleUnauthorized(); throw new Error("Unauthorized"); }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upload failed (HTTP ${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<ImportSummary>;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    headers: { Accept: "application/json", ...authHeader() },
  });
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error(`${path} → 401 Unauthorized`);
  }
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "" || v === false) continue;
    search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

// ---- SKU list ----------------------------------------------------------

type SkuListParams = {
  q?: string;
  class?: string;
  prodType?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
};

export function useSkus(params: SkuListParams = {}) {
  return useQuery({
    queryKey: ["skus", params],
    queryFn: () => getJson<Paged<SkuListItem>>(`/api/skus${qs(params)}`),
    placeholderData: (prev) => prev, // keep previous page while loading new one
  });
}

export function useSku(code: string | undefined) {
  return useQuery({
    queryKey: ["sku", code],
    queryFn: () => getJson<SkuDetail>(`/api/skus/${encodeURIComponent(code!)}`),
    enabled: !!code,
  });
}

export type SkuClasses = {
  classCd1: Array<{ code: string; count: number }>;
  classCd2: Array<{ code: string; count: number }>;
};

export function useSkuClasses() {
  return useQuery({
    queryKey: ["sku-classes"],
    queryFn: () => getJson<SkuClasses>("/api/skus/classes"),
  });
}

// ---- Inventory ---------------------------------------------------------

type OnHandParams = {
  q?: string;
  class?: string;
  nonZero?: boolean;
  limit?: number;
  offset?: number;
};

export function useOnHand(params: OnHandParams = {}) {
  return useQuery({
    queryKey: ["on-hand", params],
    queryFn: () => getJson<Paged<OnHandItem>>(`/api/inventory/on-hand${qs(params)}`),
    placeholderData: (prev) => prev,
  });
}

export function useSkuHistory(code: string | undefined, limit = 90) {
  return useQuery({
    queryKey: ["sku-history", code, limit],
    queryFn: () => getJson<{ skuCode: string; items: SnapshotRow[] }>(
      `/api/inventory/sku/${encodeURIComponent(code!)}/history?limit=${limit}`,
    ),
    enabled: !!code,
  });
}

// ---- Sync status -------------------------------------------------------

export function useSyncStatus() {
  return useQuery({
    queryKey: ["ecount-sync-status"],
    queryFn: () => getJson<SyncStateRow[]>("/api/ecount/sync/status"),
    refetchInterval: 30_000, // 30s — cheap query, keeps the pill fresh
  });
}

export function useImportHistory() {
  return useQuery({
    queryKey: ["sales-import-history"],
    queryFn: () => getJson<{ imports: ImportEvent[] }>("/api/sales/imports"),
  });
}

// ---- Helpers -----------------------------------------------------------

export function formatKrw(value: string | null | undefined): string {
  if (!value) return "—";
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return "—";
  return `₩${n.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}`;
}

export function formatQty(value: string | null | undefined): string {
  if (value == null) return "0";
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return "—";
  // strip trailing zeros / decimal-point if whole
  return Number.isInteger(n) ? n.toLocaleString("ko-KR") : n.toLocaleString("ko-KR", { maximumFractionDigits: 4 });
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "방금 전";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}
