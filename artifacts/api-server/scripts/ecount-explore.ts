/**
 * Ecount Open API exploration script.
 *
 * Goal: hit Zone → Login → ViewInventoryProducts → InventoryBalance with the
 * test credentials in artifacts/api-server/.env, dump the raw payloads, and
 * print the field shape of one SKU + one stock row so we can refine our
 * Drizzle schema (lib/db/src/schema/skus.ts, salesRecords.ts, inventoryMovements.ts)
 * to match Ecount's reality.
 *
 * Run from artifacts/api-server:
 *   pnpm exec tsx scripts/ecount-explore.ts
 *   ECOUNT_ENV=sandbox pnpm exec tsx scripts/ecount-explore.ts   # force sandbox
 *   ECOUNT_ENV=prod    pnpm exec tsx scripts/ecount-explore.ts   # force prod
 */
import "../src/loadEnv";

const COM_CODE = process.env.ECOUNT_COM_CODE;
const USER_ID = process.env.ECOUNT_USER_ID;
const API_CERT_KEY = process.env.ECOUNT_API_CERT_KEY;
const FORCED_ENV = process.env.ECOUNT_ENV as "sandbox" | "prod" | undefined;

if (!COM_CODE || !USER_ID || !API_CERT_KEY) {
  console.error("Missing ECOUNT_COM_CODE / ECOUNT_USER_ID / ECOUNT_API_CERT_KEY in .env");
  process.exit(1);
}

type ZoneResult = {
  Data: { ZONE: string; DOMAIN: string; EXPIRE_DATE?: string };
  Status: string;
  Error: unknown;
};
type LoginResult = {
  Data?: { Datas?: { SESSION_ID?: string; EXPIRE_DATE?: string } };
  Status: string;
  Error?: unknown;
};

async function postJson(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { _raw: text };
  }
  if (!res.ok) {
    console.error(`HTTP ${res.status} ${res.statusText} from ${url}`);
    console.error(JSON.stringify(parsed, null, 2));
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return parsed;
}

async function tryZone(envName: "sandbox" | "prod"): Promise<ZoneResult> {
  const host = envName === "prod" ? "oapi" : "sboapi";
  const url = `https://${host}.ecount.com/OAPI/V2/Zone`;
  console.log(`[zone:${envName}] POST ${url}`);
  const resp = (await postJson(url, { COM_CODE })) as ZoneResult;
  console.log(`  → Status: ${resp.Status}, ZONE: ${resp.Data?.ZONE ?? "?"}, DOMAIN: ${resp.Data?.DOMAIN ?? "?"}`);
  if (String(resp.Status) !== "200") throw new Error(`Zone returned Status ${resp.Status}`);
  return resp;
}

async function login(envName: "sandbox" | "prod", zone: string): Promise<string> {
  const host = envName === "prod" ? "oapi" : "sboapi";
  // Login URL pattern: https://{host}{ZONE}.ecount.com/OAPI/V2/OAPILogin
  const url = `https://${host}${zone}.ecount.com/OAPI/V2/OAPILogin`;
  console.log(`[login:${envName}] POST ${url}`);
  const resp = (await postJson(url, {
    COM_CODE,
    USER_ID,
    API_CERT_KEY,
    LAN_TYPE: "ko-KR",
    ZONE: zone,
  })) as LoginResult;
  console.log(`  → Status: ${resp.Status}`);
  console.log(`  → Full login Data: ${JSON.stringify(resp.Data, null, 2)}`);
  const sessionId = resp.Data?.Datas?.SESSION_ID;
  if (!sessionId) {
    console.error("Login response:", JSON.stringify(resp, null, 2));
    throw new Error("Login returned no SESSION_ID");
  }
  console.log(`  → SESSION_ID acquired (${sessionId.length} chars), expires ${resp.Data?.Datas?.EXPIRE_DATE ?? "?"}`);
  return sessionId;
}

async function viewItems(envName: "sandbox" | "prod", zone: string, sessionId: string): Promise<unknown> {
  const host = envName === "prod" ? "oapi" : "sboapi";
  const url = `https://${host}${zone}.ecount.com/OAPI/V2/InventoryBasic/ViewInventoryProducts?SESSION_ID=${sessionId}`;
  console.log(`[items:${envName}] POST ${url.split("?")[0]}?SESSION_ID=…`);
  // Empty PROD_CD = list all; we'll restrict by PROD_TYPE to merchandise-ish if needed
  return await postJson(url, { PROD_CD: "", PROD_TYPE: "" });
}

async function viewInventoryBalance(envName: "sandbox" | "prod", zone: string, sessionId: string): Promise<unknown> {
  const host = envName === "prod" ? "oapi" : "sboapi";
  const url = `https://${host}${zone}.ecount.com/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatus?SESSION_ID=${sessionId}`;
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
  console.log(`[stock:${envName}] POST ${url.split("?")[0]}?SESSION_ID=… (BASE_DATE=${today})`);
  return await postJson(url, { PROD_CD: "", WH_CD: "", BASE_DATE: today });
}

function describeFields(obj: Record<string, unknown>, label: string): void {
  console.log(`\n=== Field shape: ${label} ===`);
  const keys = Object.keys(obj);
  console.log(`  ${keys.length} fields`);
  for (const k of keys) {
    const v = obj[k];
    const t = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
    const sample = JSON.stringify(v).slice(0, 60);
    console.log(`  ${k.padEnd(28)} ${t.padEnd(7)} ${sample}`);
  }
}

async function main(): Promise<void> {
  console.log(`COM_CODE=${COM_CODE}, USER_ID=${USER_ID}, API_CERT_KEY=${API_CERT_KEY?.slice(0, 6)}…`);

  // Default to sandbox (test certification keys live there); user can force prod via ECOUNT_ENV=prod.
  const order: Array<"sandbox" | "prod"> = FORCED_ENV ? [FORCED_ENV] : ["sandbox", "prod"];
  let envName: "sandbox" | "prod" | null = null;
  let zone: string | null = null;
  for (const e of order) {
    try {
      const z = await tryZone(e);
      envName = e;
      zone = z.Data.ZONE;
      break;
    } catch (err: unknown) {
      console.warn(`  ${e} zone failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (!envName || !zone) throw new Error("Could not resolve zone from either prod or sandbox");
  console.log(`\n✓ Using env=${envName}, zone=${zone}\n`);

  const sessionId = await login(envName, zone);
  console.log();

  // First, validate the URL pattern with the known-good InventoryBalance endpoint
  let stockResp: { Data?: { Result?: Array<Record<string, unknown>>; TotalCnt?: number }; Status: string } | null = null;
  try {
    stockResp = (await viewInventoryBalance(envName, zone, sessionId)) as typeof stockResp;
    console.log(`  → Status: ${stockResp?.Status}, TotalCnt: ${stockResp?.Data?.TotalCnt ?? "?"}`);
    if (stockResp?.Data?.Result?.[0]) describeFields(stockResp.Data.Result[0], "InventoryBalance[0]");
    else console.log(`  Result: ${JSON.stringify(stockResp?.Data?.Result).slice(0, 200)}`);
  } catch (e) {
    console.error("InventoryBalance failed:", e instanceof Error ? e.message : e);
  }

  // Try several possible item-list endpoint names (docs are ambiguous on which to use)
  console.log();
  const candidates = ["InventoryBasic/GetBasicProductsList"];
  const host = envName === "prod" ? "oapi" : "sboapi";
  for (const path of candidates) {
    const url = `https://${host}${zone}.ecount.com/OAPI/V2/${path}?SESSION_ID=${sessionId}`;
    try {
      const r = (await postJson(url, { PROD_CD: "", PROD_TYPE: "" })) as { Status?: unknown; Data?: { Result?: unknown; TotalCnt?: unknown }; Errors?: unknown; Error?: unknown };
      console.log(`  ${path}: Status=${r.Status}, TotalCnt=${r.Data?.TotalCnt ?? "?"}`);
      if (String(r.Status) !== "200") {
        console.log(`    Errors:`, JSON.stringify(r.Errors).slice(0, 300));
        console.log(`    Error:`, JSON.stringify(r.Error).slice(0, 300));
      }
      let result: unknown = r.Data?.Result;
      // Ecount's docs sometimes wrap arrays as JSON strings — parse if necessary
      if (typeof result === "string") {
        try { result = JSON.parse(result); } catch { /* leave as string */ }
      }
      const firstItem = Array.isArray(result) ? (result[0] as Record<string, unknown>) : result && typeof result === "object" ? (result as Record<string, unknown>) : null;
      if (firstItem) {
        describeFields(firstItem, `${path}[0]`);
        // Save full payload + stop
        const fs = await import("node:fs");
        fs.writeFileSync("/tmp/ecount-explore-output.json", JSON.stringify({ env: envName, zone, endpoint: path, itemsResp: r, stockResp }, null, 2));
        console.log(`\nFull payload written to /tmp/ecount-explore-output.json`);
        return;
      }
    } catch (e) {
      console.log(`  ${path}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log("\nNo items-list endpoint matched under InventoryBasic/. Falling back to Sales endpoint candidates...");

  // Sales — from screenshot 3.09 series, the endpoint is something like Sale/GetListData or SaveSale
  const salesCandidates = [
    "Sale/GetListData",
    "Sale/GetSaleList",
    "Sale/GetList",
    "Sale/GetSale",
    "Sale/View",
    "SaleBasic/GetListData",
    "SaleBasic/GetSaleList",
  ];
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  for (const path of salesCandidates) {
    const url = `https://${host}${zone}.ecount.com/OAPI/V2/${path}?SESSION_ID=${sessionId}`;
    try {
      const r = (await postJson(url, { BASE_DATE_FROM: fmt(monthAgo), BASE_DATE_TO: fmt(today) })) as { Status?: unknown; Data?: { Result?: unknown; TotalCnt?: unknown }; Errors?: unknown };
      console.log(`  ${path}: Status=${r.Status}, TotalCnt=${r.Data?.TotalCnt ?? "?"}`);
      if (String(r.Status) === "200" && r.Data?.Result) {
        const result = r.Data.Result;
        const firstSale = Array.isArray(result) ? (result[0] as Record<string, unknown>) : null;
        if (firstSale) {
          describeFields(firstSale, `${path}[0]`);
          const fs = await import("node:fs");
          fs.writeFileSync("/tmp/ecount-explore-output.json", JSON.stringify({ env: envName, zone, salesEndpoint: path, salesResp: r, stockResp }, null, 2));
          console.log(`\nFull payload written to /tmp/ecount-explore-output.json`);
          return;
        }
      } else {
        console.log(`    Errors:`, JSON.stringify(r.Errors).slice(0, 200));
      }
    } catch (e) {
      console.log(`  ${path}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // (Stock + sales payloads are persisted inside the success branches above.)
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
