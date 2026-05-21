import { useState } from "react";
import { useLocation } from "wouter";
import { useOnHand, formatKrw, formatQty } from "@/lib/inventory-api";
import { InventoryTabs } from "./inventory-tabs";

const PAGE_SIZE = 50;

export default function OnHandPage() {
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");
  const [nonZero, setNonZero] = useState(true);
  const [page, setPage] = useState(0);
  const { data, isLoading } = useOnHand({
    q,
    nonZero,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const total = data?.total ?? 0;
  const showing = data?.items.length ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <div className="min-h-screen flex flex-col bg-[#1e1e1e]">
      <InventoryTabs />
      <div className="flex-1 px-6 py-6 overflow-auto">
        <div className="max-w-[1400px] mx-auto space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-[#e8e8e8]">현재 재고</h1>
              <p className="text-xs text-[#9ca3af] mt-0.5">
                Ecount 야간 동기화 기준 · 마지막 스냅샷의 SKU별 잔고
              </p>
            </div>
            <div className="text-xs text-[#9ca3af]">
              {isLoading ? "불러오는 중…" : `${total.toLocaleString("ko-KR")} SKU · ${showing}개 표시 중`}
            </div>
          </div>

          <div className="flex gap-3 items-center">
            <input
              type="text"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }}
              placeholder="SKU 코드 또는 상품명 검색…"
              className="flex-1 h-9 px-3 bg-[#1e1e1e] border border-[#3a3a3a] rounded-md text-sm text-[#e8e8e8] placeholder-[#666] focus:border-[#4a9cf6] focus:outline-none"
            />
            <label className="inline-flex items-center gap-2 text-xs text-[#9ca3af] cursor-pointer">
              <input
                type="checkbox"
                checked={nonZero}
                onChange={(e) => { setNonZero(e.target.checked); setPage(0); }}
                className="w-4 h-4 accent-[#4a9cf6]"
              />
              재고 있는 항목만
            </label>
          </div>

          <div className="border border-[#3a3a3a] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#252525] text-[#9ca3af] text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">SKU 코드</th>
                  <th className="text-left px-4 py-2.5 font-medium">상품명</th>
                  <th className="text-right px-4 py-2.5 font-medium">잔고</th>
                  <th className="text-right px-4 py-2.5 font-medium">안전재고</th>
                  <th className="text-right px-4 py-2.5 font-medium">매입가 (KRW)</th>
                  <th className="text-left px-4 py-2.5 font-medium">분류</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((it) => {
                  const balance = Number.parseFloat(it.balance_qty || "0");
                  const safe = Number.parseFloat(it.safe_qty || "0");
                  const lowStock = safe > 0 && balance < safe;
                  return (
                    <tr
                      key={it.sku_code}
                      onClick={() => navigate(`/inventory/skus/${encodeURIComponent(it.sku_code)}`)}
                      className="border-t border-[#2a2a2a] hover:bg-[#252525] cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-[#9ca3af]">{it.sku_code}</td>
                      <td className="px-4 py-2.5 text-[#e8e8e8]">{it.display_name}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${lowStock ? "text-amber-300" : balance > 0 ? "text-[#e8e8e8]" : "text-[#666]"}`}>
                        {formatQty(it.balance_qty)} {it.unit ?? ""}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[#9ca3af]">
                        {it.safe_qty && safe > 0 ? formatQty(it.safe_qty) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[#9ca3af]">{formatKrw(it.in_price_krw)}</td>
                      <td className="px-4 py-2.5 text-xs text-[#9ca3af]">{it.class_cd_1 ?? "—"}</td>
                    </tr>
                  );
                })}
                {!isLoading && (data?.items.length ?? 0) === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-[#9ca3af] text-sm">결과 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between text-xs text-[#9ca3af]">
              <span>
                페이지 {page + 1} / {lastPage + 1}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="px-3 py-1 rounded border border-[#3a3a3a] hover:bg-[#252525] disabled:opacity-40 disabled:cursor-not-allowed transition"
                >이전</button>
                <button
                  disabled={page >= lastPage}
                  onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                  className="px-3 py-1 rounded border border-[#3a3a3a] hover:bg-[#252525] disabled:opacity-40 disabled:cursor-not-allowed transition"
                >다음</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
