import { Link, useLocation } from "wouter";
import { SyncStatusPill } from "@/components/inventory/sync-status-pill";

/**
 * Shared header for the 제품 관리 (inventory) pages: title + sub-nav tabs +
 * Ecount sync health pill.
 */
export function InventoryTabs() {
  const [location] = useLocation();
  const tabs: Array<{ to: string; label: string; match: (p: string) => boolean }> = [
    { to: "/inventory/on-hand", label: "현재 재고", match: (p) => p.startsWith("/inventory/on-hand") },
    { to: "/inventory/skus", label: "SKU 마스터", match: (p) => p === "/inventory/skus" || p.startsWith("/inventory/skus/") },
  ];

  return (
    <div className="flex items-center justify-between border-b border-[#3a3a3a] px-6 py-3 bg-[#252525]/40">
      <div className="flex items-center gap-1">
        {tabs.map((t) => {
          const active = t.match(location);
          return (
            <Link
              key={t.to}
              href={t.to}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                active
                  ? "bg-[#333] text-[#4a9cf6]"
                  : "text-[#9ca3af] hover:text-[#e8e8e8] hover:bg-[#2f2f2f]"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <SyncStatusPill />
    </div>
  );
}
