import "../src/loadEnv";
import pg from "pg";

const COM_CODE = process.env.ECOUNT_COM_CODE!;
const USER_ID = process.env.ECOUNT_USER_ID!;
const API_CERT_KEY = process.env.ECOUNT_API_CERT_KEY!;

async function login() {
  const zoneRes = await fetch("https://sboapi.ecount.com/OAPI/V2/Zone", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ COM_CODE }),
  }).then(r => r.json() as Promise<{ Data: { ZONE: string } }>);
  const zone = zoneRes.Data.ZONE;
  const loginRes = await fetch(`https://sboapi${zone}.ecount.com/OAPI/V2/OAPILogin`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ COM_CODE, USER_ID, API_CERT_KEY, LAN_TYPE: "ko-KR", ZONE: zone }),
  }).then(r => r.json() as Promise<{ Data: { Datas: { SESSION_ID: string } } }>);
  return { zone, sessionId: loginRes.Data.Datas.SESSION_ID };
}

async function fetchAllItems(zone: string, sessionId: string) {
  const url = `https://sboapi${zone}.ecount.com/OAPI/V2/InventoryBasic/GetBasicProductsList?SESSION_ID=${sessionId}`;
  const r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ PROD_CD: "", PROD_TYPE: "" }),
  }).then(r => r.json() as Promise<{ Data: { Result: unknown; TotalCnt: number } }>);
  const raw = r.Data.Result;
  const items = typeof raw === "string" ? JSON.parse(raw) : raw;
  return items as Array<Record<string, unknown>>;
}

function pickStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s === "" ? null : s;
}
function pickNum(v: unknown): string | null {
  // Ecount sends quantities as strings with trailing zeros — keep as string for NUMERIC column
  if (v === null || v === undefined || v === "" || v === "0.0000000000" || v === "0.00") return null;
  return String(v);
}

async function main() {
  console.log("=== login ===");
  const { zone, sessionId } = await login();
  console.log(`zone=${zone}, sessionId=${sessionId.slice(0, 12)}…`);

  console.log("=== fetch SKU master ===");
  const items = await fetchAllItems(zone, sessionId);
  console.log(`got ${items.length} items`);

  // Pick 5 'real' products (non-empty name, prod_type != 3)
  const sample = items.filter(i => i.PROD_DES && i.PROD_TYPE !== "3").slice(0, 5);
  console.log(`ingesting ${sample.length} sample items into Neon...`);

  const t = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  for (const it of sample) {
    await t.query(`
      INSERT INTO skus (
        sku_code, display_name, size_des, unit, bar_code, prod_type,
        class_cd_1, class_cd_2, class_cd_3,
        cont1, cont2, cont3, cont4, cont5, cont6,
        in_price_krw, out_price_krw, safe_qty, min_qty,
        default_warehouse, cust_code, remarks,
        ecount_raw, ecount_synced_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NOW())
      ON CONFLICT (sku_code) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        in_price_krw = EXCLUDED.in_price_krw,
        ecount_raw   = EXCLUDED.ecount_raw,
        ecount_synced_at = NOW()
    `, [
      pickStr(it.PROD_CD), pickStr(it.PROD_DES) ?? "", pickStr(it.SIZE_DES), pickStr(it.UNIT),
      pickStr(it.BAR_CODE), pickStr(it.PROD_TYPE),
      pickStr(it.CLASS_CD), pickStr(it.CLASS_CD2), pickStr(it.CLASS_CD3),
      pickStr(it.CONT1), pickStr(it.CONT2), pickStr(it.CONT3),
      pickStr(it.CONT4), pickStr(it.CONT5), pickStr(it.CONT6),
      pickNum(it.IN_PRICE), pickNum(it.OUT_PRICE), pickNum(it.SAFE_QTY), pickNum(it.MIN_QTY),
      pickStr(it.WH_CD), pickStr(it.CUST), pickStr(it.REMARKS),
      JSON.stringify(it),
    ]);
  }

  console.log("\n=== query back from Neon ===");
  const { rows } = await t.query(`
    SELECT sku_code, display_name, size_des, cont2 AS color, cont3 AS brand,
           in_price_krw, class_cd_1, class_cd_2
    FROM skus ORDER BY sku_code
  `);
  rows.forEach((r: Record<string, unknown>) => {
    console.log(`  ${r.sku_code} | ${r.display_name} | color=${r.color} brand=${r.brand} | IN=${r.in_price_krw} class=${r.class_cd_1}/${r.class_cd_2}`);
  });

  await t.end();
}
main().catch(e => { console.error(e); process.exit(1); });
