import { useSyncStatus, formatRelative } from "@/lib/inventory-api";

/**
 * Compact health indicator for the Ecount → Neon nightly sync.
 * Renders as a coloured pill on inventory pages: green if both resources
 * synced cleanly, amber if any have a lastError. Hover for details.
 */
export function SyncStatusPill() {
  const { data: rows } = useSyncStatus();
  if (!rows || rows.length === 0) return null;

  const skus = rows.find((r) => r.resource === "skus");
  const inv = rows.find((r) => r.resource === "inventory");
  const anyError = rows.some((r) => r.lastError);
  const latest = rows
    .map((r) => r.lastSyncedAt)
    .filter((s): s is string => !!s)
    .sort()
    .at(-1);

  const dotClass = anyError ? "bg-amber-400" : "bg-emerald-400";
  const labelClass = anyError ? "text-amber-300" : "text-emerald-300";

  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#252525] border border-[#3a3a3a] text-xs"
      title={rows
        .map((r) => `${r.resource}: ${r.lastError ? `error — ${r.lastError.slice(0, 80)}` : `OK at ${r.lastSyncedAt}`}`)
        .join("\n")}
    >
      <span className={`w-2 h-2 rounded-full ${dotClass}`} />
      <span className={labelClass}>Ecount sync</span>
      <span className="text-[#9ca3af]">
        {anyError ? "오류 있음" : `최근 동기화 ${formatRelative(latest)}`}
        {skus && inv ? ` · ${skus.lastError ? "✗" : "✓"} SKUs · ${inv.lastError ? "✗" : "✓"} 재고` : ""}
      </span>
    </div>
  );
}
