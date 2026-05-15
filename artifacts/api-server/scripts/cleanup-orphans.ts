import "../src/loadEnv";
import pg from "pg";

async function main() {
  const target = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  console.log("=== before ===");
  for (const t of ["tasks","video_tasks","images","videos","guide_images","products"]) {
    const { rows } = await target.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
    console.log(`  ${t.padEnd(15)} ${rows[0].c}`);
  }

  const imgDel = await target.query(`DELETE FROM images WHERE image_url LIKE '/api/uploads/%' OR image_url = ''`);
  const vidDel = await target.query(`
    DELETE FROM videos
    WHERE (source_image_url LIKE '/api/uploads/%' OR source_image_url IS NULL)
      AND (video_url LIKE '/api/uploads/%' OR video_url = '' OR video_url IS NULL)
  `);
  console.log(`\n  deleted ${imgDel.rowCount} orphan image row(s)`);
  console.log(`  deleted ${vidDel.rowCount} orphan video row(s)`);

  console.log("\n=== after ===");
  for (const t of ["tasks","video_tasks","images","videos","guide_images","products"]) {
    const { rows } = await target.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
    console.log(`  ${t.padEnd(15)} ${rows[0].c}`);
  }

  console.log("\n=== leftover /api/uploads URLs (should be none) ===");
  let anyLeft = false;
  for (const [t,c] of [["images","image_url"],["guide_images","image_url"],["videos","video_url"],["videos","source_image_url"],["videos","source_video_url"],["products","reference_image_url"]] as const) {
    const { rows } = await target.query(`SELECT COUNT(*)::int AS c FROM ${t} WHERE ${c} LIKE '/api/uploads/%'`);
    if (rows[0].c > 0) { console.log(`  ${t}.${c}: ${rows[0].c} stale`); anyLeft = true; }
  }
  if (!anyLeft) console.log("  none ✓");

  await target.end();
}
main().catch(e => { console.error(e); process.exit(1); });
