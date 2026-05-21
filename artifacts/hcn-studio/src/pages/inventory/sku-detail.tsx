import { useRoute, Link } from "wouter";
import { useSku, useSkuHistory, formatKrw, formatQty, formatRelative } from "@/lib/inventory-api";
import { InventoryTabs } from "./inventory-tabs";

export default function SkuDetailPage() {
  const [, params] = useRoute("/inventory/skus/:code");
  const code = params?.code ? decodeURIComponent(params.code) : undefined;
  const { data: sku, isLoading, error } = useSku(code);
  const { data: history } = useSkuHistory(code);

  return (
    <div className="min-h-screen flex flex-col bg-[#1e1e1e]">
      <InventoryTabs />
      <div className="flex-1 px-6 py-6 overflow-auto">
        <div className="max-w-[1100px] mx-auto space-y-6">
          <Link href="/inventory/skus" className="text-xs text-[#9ca3af] hover:text-[#e8e8e8]">
            ← SKU 마스터로 돌아가기
          </Link>

          {isLoading ? (
            <div className="text-sm text-[#9ca3af]">불러오는 중…</div>
          ) : error || !sku ? (
            <div className="text-sm text-amber-300">SKU를 찾을 수 없습니다: {code}</div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-mono text-xs text-[#9ca3af]">{sku.skuCode}</div>
                  <h1 className="text-xl font-semibold text-[#e8e8e8] mt-1">{sku.displayName}</h1>
                  <div className="flex gap-2 mt-2 text-xs text-[#9ca3af]">
                    {sku.cont3 && <span className="px-2 py-0.5 rounded bg-[#252525] border border-[#3a3a3a]">브랜드: {sku.cont3}</span>}
                    {sku.cont2 && <span className="px-2 py-0.5 rounded bg-[#252525] border border-[#3a3a3a]">색상: {sku.cont2}</span>}
                    {sku.sizeDes && <span className="px-2 py-0.5 rounded bg-[#252525] border border-[#3a3a3a]">{sku.sizeDes}</span>}
                  </div>
                </div>
                <div className="text-right text-xs text-[#9ca3af]">
                  <div>Ecount 동기화 {formatRelative(sku.ecountSyncedAt)}</div>
                  {sku.barCode && <div className="font-mono mt-1">바코드 {sku.barCode}</div>}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card label="매입가 (Ecount)" value={formatKrw(sku.inPriceKrw)} />
                <Card label="판매가 (Ecount)" value={formatKrw(sku.outPriceKrw)} />
                <Card label="안전재고" value={sku.safeQty ? formatQty(sku.safeQty) : "—"} />
                <Card label="리드타임" value={sku.leadTimeDays ? `${sku.leadTimeDays}일` : "—"} />
              </div>

              <Section title="Ecount 필드">
                <Field label="품목 유형 (PROD_TYPE)" value={sku.prodType} />
                <Field label="단위 (UNIT)" value={sku.unit} />
                <Field label="분류 (CLASS_CD)" value={[sku.classCd1, sku.classCd2, sku.classCd3].filter(Boolean).join(" / ") || "—"} />
                <Field label="기본 창고 (WH_CD)" value={sku.defaultWarehouse} />
                <Field label="기본 매입처 (CUST)" value={sku.custCode} />
                <Field label="비고 (REMARKS)" value={sku.remarks} />
                {sku.cont1 && <Field label="CONT1" value={sku.cont1} />}
                {sku.cont4 && <Field label="CONT4" value={sku.cont4} />}
                {sku.cont5 && <Field label="CONT5" value={sku.cont5} />}
                {sku.cont6 && <Field label="CONT6" value={sku.cont6} />}
              </Section>

              <Section title="Luna Story 확장 필드 (Ecount에는 없음)">
                <Field label="무게 (g/단위)" value={sku.weightG ? `${sku.weightG}g` : "—"} />
                <Field label="박스당 개수" value={sku.cartonUnits != null ? `${sku.cartonUnits}` : "—"} />
                <Field label="박스 크기 (LxWxH cm)" value={
                  sku.cartonLCm && sku.cartonWCm && sku.cartonHCm
                    ? `${sku.cartonLCm} × ${sku.cartonWCm} × ${sku.cartonHCm}`
                    : "—"
                } />
                <Field label="공장 단가 (USD)" value={sku.unitCostUsd ? `$${sku.unitCostUsd}` : "—"} />
                <Field label="리드타임" value={sku.leadTimeDays ? `${sku.leadTimeDays}일` : "—"} />
                <Field label="메모" value={sku.notes} />
              </Section>

              <Section title="재고 스냅샷 히스토리 (최근 90일)">
                {history && history.items.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead className="text-xs text-[#9ca3af]">
                      <tr><th className="text-left py-2">날짜</th><th className="text-left py-2">창고</th><th className="text-right py-2">잔고</th><th className="text-right py-2">동기화</th></tr>
                    </thead>
                    <tbody>
                      {history.items.map((s) => (
                        <tr key={`${s.snapshotDate}-${s.warehouseCode}`} className="border-t border-[#2a2a2a]">
                          <td className="py-2 text-[#e8e8e8]">{s.snapshotDate}</td>
                          <td className="py-2 text-[#9ca3af] text-xs">{s.warehouseCode || "(전체)"}</td>
                          <td className="py-2 text-right tabular-nums text-[#e8e8e8]">{formatQty(s.balanceQty)}</td>
                          <td className="py-2 text-right text-xs text-[#9ca3af]">{formatRelative(s.syncedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-sm text-[#9ca3af]">아직 스냅샷이 없습니다. 첫 야간 동기화 이후에 표시됩니다.</div>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#252525] border border-[#3a3a3a] rounded-lg px-4 py-3">
      <div className="text-xs text-[#9ca3af]">{label}</div>
      <div className="text-base text-[#e8e8e8] mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#252525] border border-[#3a3a3a] rounded-lg px-5 py-4 space-y-3">
      <h2 className="text-sm font-semibold text-[#e8e8e8]">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between text-sm border-b border-[#2a2a2a] py-1.5">
      <span className="text-[#9ca3af]">{label}</span>
      <span className="text-[#e8e8e8]">{value || "—"}</span>
    </div>
  );
}
