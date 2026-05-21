import * as XLSX from "xlsx";
import * as fs from "node:fs";

const path = "/Users/kevinoh/lunastory/이카운트 매출&반품 양식.xls";
const buf = fs.readFileSync(path);
const wb = XLSX.read(buf);

console.log(`workbook sheets: ${wb.SheetNames.length}`);
for (const name of wb.SheetNames) {
  console.log(`\n=== sheet: "${name}" ===`);
  const ws = wb.Sheets[name];
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
  console.log(`range: ${ws["!ref"]} (${range.e.r - range.s.r + 1} rows × ${range.e.c - range.s.c + 1} cols)`);

  // Dump first 10 rows raw — header detection happens here
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false });
  console.log(`total parsed rows: ${rows.length}`);
  console.log(`\nfirst 12 rows (raw):`);
  rows.slice(0, 12).forEach((r, i) => {
    const cells = (r as unknown[]).slice(0, 25).map((c, j) => `${XLSX.utils.encode_col(j)}=${String(c ?? "").slice(0, 30)}`);
    console.log(`  R${i}: ${cells.filter((_, j) => (r as unknown[])[j]).join(" | ")}`);
  });
}
