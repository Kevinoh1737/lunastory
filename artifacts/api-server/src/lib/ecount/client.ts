/**
 * Ecount Open API client.
 *
 * Reads credentials from env (ECOUNT_COM_CODE / ECOUNT_USER_ID /
 * ECOUNT_API_CERT_KEY) and exposes typed wrappers for the endpoints we
 * use during the bridge period:
 *   - getBasicProductsList  → SKU master (1500-ish rows)
 *   - getInventoryBalance   → stock snapshot per SKU
 *
 * Sessions are cached in-memory until they expire so we don't burn the
 * 6000-call-per-hour quota on logins. Subsequent calls auto-discover the
 * zone on first use.
 */

const ECOUNT_ENV = (process.env.ECOUNT_ENV ?? "sandbox") as "sandbox" | "prod";
const HOST_PREFIX = ECOUNT_ENV === "prod" ? "oapi" : "sboapi";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} env var is required (Ecount client cannot start)`);
  return v;
}

type ZoneData = { ZONE: string; DOMAIN: string };
type LoginData = { Datas?: { SESSION_ID?: string }; Code?: string; Message?: string };
type EcountResponse<T> = {
  Status: number | string;
  Data?: T;
  Errors?: unknown;
  Error?: unknown;
};

let cachedZone: string | null = null;
let cachedSession: { sessionId: string; zone: string; acquiredAt: number } | null = null;

// Sessions on Ecount typically last for the day; we re-login if older than 8 hours
// or if a call comes back with a session-expired error.
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
  if (!res.ok) {
    throw new Error(`Ecount ${url}: HTTP ${res.status} ${res.statusText} — ${text.slice(0, 200)}`);
  }
  return parsed as T;
}

async function resolveZone(): Promise<string> {
  if (cachedZone) return cachedZone;
  const url = `https://${HOST_PREFIX}.ecount.com/OAPI/V2/Zone`;
  const COM_CODE = requireEnv("ECOUNT_COM_CODE");
  const resp = await postJson<EcountResponse<ZoneData>>(url, { COM_CODE });
  if (String(resp.Status) !== "200" || !resp.Data?.ZONE) {
    throw new Error(`Ecount Zone returned Status=${resp.Status} (${JSON.stringify(resp.Errors)})`);
  }
  cachedZone = resp.Data.ZONE;
  return cachedZone;
}

export async function getSession(force = false): Promise<{ sessionId: string; zone: string }> {
  const now = Date.now();
  if (
    !force &&
    cachedSession &&
    now - cachedSession.acquiredAt < SESSION_TTL_MS
  ) {
    return cachedSession;
  }
  const zone = await resolveZone();
  const url = `https://${HOST_PREFIX}${zone}.ecount.com/OAPI/V2/OAPILogin`;
  const COM_CODE = requireEnv("ECOUNT_COM_CODE");
  const USER_ID = requireEnv("ECOUNT_USER_ID");
  const API_CERT_KEY = requireEnv("ECOUNT_API_CERT_KEY");
  const resp = await postJson<EcountResponse<LoginData>>(url, {
    COM_CODE, USER_ID, API_CERT_KEY, LAN_TYPE: "ko-KR", ZONE: zone,
  });
  const sessionId = resp.Data?.Datas?.SESSION_ID;
  if (!sessionId) {
    throw new Error(`Ecount login failed: Code=${resp.Data?.Code} Message=${resp.Data?.Message}`);
  }
  cachedSession = { sessionId, zone, acquiredAt: now };
  return cachedSession;
}

function endpointUrl(zone: string, path: string, sessionId: string): string {
  return `https://${HOST_PREFIX}${zone}.ecount.com/OAPI/V2/${path}?SESSION_ID=${sessionId}`;
}

/**
 * Some Ecount endpoints return `Data.Result` as a JSON-encoded string instead
 * of a real array — normalize so callers always get an array.
 */
function unwrapResult<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch { return []; }
  }
  if (raw && typeof raw === "object") return [raw as T];
  return [];
}

export type EcountBasicProduct = Record<string, unknown>; // 86 fields — typed loosely on purpose
export type EcountInventoryBalanceRow = { PROD_CD: string; BAL_QTY: number | string };

export async function getBasicProductsList(opts: { prodCd?: string; prodType?: string } = {}): Promise<{
  totalCnt: number;
  items: EcountBasicProduct[];
}> {
  const { sessionId, zone } = await getSession();
  const url = endpointUrl(zone, "InventoryBasic/GetBasicProductsList", sessionId);
  const resp = await postJson<EcountResponse<{ Result: unknown; TotalCnt?: number }>>(url, {
    PROD_CD: opts.prodCd ?? "",
    PROD_TYPE: opts.prodType ?? "",
  });
  if (String(resp.Status) !== "200") {
    throw new Error(`Ecount GetBasicProductsList Status=${resp.Status} ${JSON.stringify(resp.Errors)}`);
  }
  return {
    totalCnt: resp.Data?.TotalCnt ?? 0,
    items: unwrapResult<EcountBasicProduct>(resp.Data?.Result),
  };
}

export async function getInventoryBalance(opts: { prodCd?: string; whCd?: string; baseDate?: string } = {}): Promise<{
  totalCnt: number;
  rows: EcountInventoryBalanceRow[];
}> {
  const { sessionId, zone } = await getSession();
  const url = endpointUrl(zone, "InventoryBalance/GetListInventoryBalanceStatus", sessionId);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const resp = await postJson<EcountResponse<{ Result: unknown; TotalCnt?: number }>>(url, {
    PROD_CD: opts.prodCd ?? "",
    WH_CD: opts.whCd ?? "",
    BASE_DATE: opts.baseDate ?? today,
  });
  if (String(resp.Status) !== "200") {
    throw new Error(`Ecount GetListInventoryBalanceStatus Status=${resp.Status} ${JSON.stringify(resp.Errors)}`);
  }
  return {
    totalCnt: resp.Data?.TotalCnt ?? 0,
    rows: unwrapResult<EcountInventoryBalanceRow>(resp.Data?.Result),
  };
}

/** Test-only: reset cached zone + session (used by integration tests). */
export function _resetClient(): void {
  cachedZone = null;
  cachedSession = null;
}
