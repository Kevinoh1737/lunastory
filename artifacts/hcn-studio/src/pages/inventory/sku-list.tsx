import { useState } from "react";
import { useLocation } from "wouter";
import { useSkus, useSkuClasses, formatKrw } from "@/lib/inventory-api";
import { InventoryTabs } from "./inventory-tabs";

const PAGE_SIZE = 50;

export default function SkuListPage() {
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");
  const [classCd1, setClassCd1] = useState("");
  const [prodType, setProdType] = useState("");
  const [page, setPage] = useState(0);

  const { data, isLoading } = useSkus({
    q,
    class: classCd1 || undefined,
    prodType: prodType || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const { data: classes } = useSkuClasses();

  const total = data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <div className="min-h-screen flex flex-col bg-[#1e1e1e]">
      <InventoryTabs />
      <div className="flex-1 px-6 py-6 overflow-auto">
        <div className="max-w-[1400px] mx-auto space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-[#e8e8e8]">SKU 마스터</h1>
              <p className="text-xs text-[#9ca3af] mt-0.5">Ecount에서 동기화된 전체 SKU 목록</p>
            </div>
            <div className="text-xs text-[#9ca3af]">
              {isLoading ? "불러오는 중…" : `${total.toLocaleString("ko-KR")} SKU`}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3">
            <input
              type="text"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }}
              placeholder="SKU 코드, 상품명, 바코드 검색…"
              className="h-9 px-3 bg-[#1e1e1e] border border-[#3a3a3a] rounded-md text-sm text-[#e8e8e8] placeholder-[#666] focus:border-[#4a9cf6] focus:outline-none"
            />
            <select
              value={classCd1}
              onChange={(e) => { setClassCd1(e.target.value); setPage(0); }}
              className="h-9 px-3 bg-[#1e1e1e] border border-[#3a3a3a] rounded-md text-sm text-[#e8e8e8]"
            >
              <option value="">전체 분류</option>
              {classes?.classCd1.map((c) => (
                <option key={c.code} value={c.code}>{c.code} ({c.count.toLocaleString()})</option>
              ))}
            </select>
            <select
              value={prodType}
              onChange={(e) => { setProdType(e.target.value); setPage(0); }}
              className="h-9 px-3 bg-[#1e1e1e] border border-[#3a3a3a] rounded-md text-sm text-[#e8e8e8]"
            >
              <option value="">모든 품목</option>
              <option value="2">원재료 (2)</option>
              <option value="3">상품 (3)</option>
              <option value="4">제품 (4)</option>
              <option value="0">기타 (0)</option>
            </select>
          </div>

          <div className="border border-[#3a3a3a] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#252525] text-[#9ca3af] text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">SKU 코드</th>
                  <th className="text-left px-4 py-2.5 font-medium">상품명</th>
                  <th className="text-left px-4 py-2.5 font-medium">색상</th>
                  <th className="text-left px-4 py-2.5 font-medium">브랜드</th>
                  <th className="text-right px-4 py-2.5 font-medium">매입가</th>
                  <th className="text-right px-4 py-2.5 font-medium">판매가</th>
                  <th className="text-left px-4 py-2.5 font-medium">분류</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((it) => (
                  <tr
                    key={it.skuCode}
                    onClick={() => navigate(`/inventory/skus/${encodeURIComponent(it.skuCode)}`)}
                    className="border-t border-[#2a2a2a] hover:bg-[#252525] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-[#9ca3af]">{it.skuCode}</td>
                    <td className="px-4 py-2.5 text-[#e8e8e8]">{it.displayName}</td>
                    <td className="px-4 py-2.5 text-xs text-[#9ca3af]">{it.cont2 ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-[#9ca3af]">{it.cont3 ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#9ca3af]">{formatKrw(it.inPriceKrw)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#9ca3af]">{formatKrw(it.outPriceKrw)}</td>
                    <td className="px-4 py-2.5 text-xs text-[#9ca3af]">{it.classCd1 ? `${it.classCd1}${it.classCd2 ? "/"+it.classCd2 : ""}` : "—"}</td>
                  </tr>
                ))}
                {!isLoading && (data?.items.length ?? 0) === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-[#9ca3af] text-sm">결과 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between text-xs text-[#9ca3af]">
              <span>페이지 {page + 1} / {lastPage + 1}</span>
              <div className="flex gap-2">
                <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="px-3 py-1 rounded border border-[#3a3a3a] hover:bg-[#252525] disabled:opacity-40">이전</button>
                <button disabled={page >= lastPage} onClick={() => setPage((p) => Math.min(lastPage, p + 1))} className="px-3 py-1 rounded border border-[#3a3a3a] hover:bg-[#252525] disabled:opacity-40">다음</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
