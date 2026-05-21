import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  uploadSalesExcel,
  useImportHistory,
  formatRelative,
  type ImportSummary,
} from "@/lib/inventory-api";
import { InventoryTabs } from "./inventory-tabs";

type Phase = "idle" | "previewing" | "previewed" | "committing" | "committed" | "error";

export default function SalesImportPage() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const { data: history } = useImportHistory();

  function resetAll() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setPhase("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  function pickFile(next: File | null) {
    if (!next) return;
    setFile(next);
    setPreview(null);
    setResult(null);
    setError(null);
    setPhase("idle");
  }

  async function runPreview() {
    if (!file) return;
    setPhase("previewing");
    setError(null);
    try {
      const summary = await uploadSalesExcel(file, true);
      setPreview(summary);
      setPhase("previewed");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  async function runCommit() {
    if (!file) return;
    setPhase("committing");
    setError(null);
    try {
      const summary = await uploadSalesExcel(file, false);
      setResult(summary);
      setPhase("committed");
      // refresh history pill
      qc.invalidateQueries({ queryKey: ["sales-import-history"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#1e1e1e]">
      <InventoryTabs />
      <div className="flex-1 px-6 py-6 overflow-auto">
        <div className="max-w-[1000px] mx-auto space-y-6">
          <div>
            <h1 className="text-xl font-semibold text-[#e8e8e8]">판매 데이터 가져오기</h1>
            <p className="text-xs text-[#9ca3af] mt-0.5">
              이카운트에 업로드하는 매출&반품 엑셀 파일을 동일하게 여기에도 업로드하세요. 중복 행은 자동으로 걸러집니다.
            </p>
          </div>

          {/* Drop / pick zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files?.[0] ?? null);
            }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragging
                ? "border-[#4a9cf6] bg-[#1f2a3a]"
                : "border-[#3a3a3a] hover:border-[#4a9cf6] bg-[#252525]"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="space-y-1">
                <p className="text-sm text-[#e8e8e8] font-medium">{file.name}</p>
                <p className="text-xs text-[#9ca3af]">{(file.size / 1024).toFixed(1)} KB</p>
                <p className="text-xs text-[#666] mt-2">파일을 바꾸려면 클릭하세요</p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-[#e8e8e8]">매출&반품 양식 (.xls / .xlsx) 파일을 끌어다 놓으세요</p>
                <p className="text-xs text-[#9ca3af]">또는 클릭해서 선택</p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          {file && phase !== "committed" && (
            <div className="flex gap-3">
              <button
                onClick={runPreview}
                disabled={phase === "previewing" || phase === "committing"}
                className="px-4 h-9 rounded-md border border-[#3a3a3a] text-sm text-[#e8e8e8] hover:bg-[#252525] disabled:opacity-50"
              >
                {phase === "previewing" ? "분석 중..." : "1. 미리보기"}
              </button>
              <button
                onClick={runCommit}
                disabled={phase !== "previewed" || phase === "committing"}
                className="px-5 h-9 rounded-md bg-[#4a9cf6] hover:bg-[#3b82f6] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {phase === "committing" ? "업로드 중..." : "2. 업로드 확정"}
              </button>
              <button
                onClick={resetAll}
                className="px-3 h-9 text-xs text-[#9ca3af] hover:text-[#e8e8e8]"
              >
                초기화
              </button>
            </div>
          )}

          {error && (
            <div className="border border-red-700 bg-red-900/20 text-red-300 text-sm rounded-md px-4 py-3">
              <strong>오류:</strong> {error}
            </div>
          )}

          {/* Preview summary */}
          {(phase === "previewed" || phase === "committed") && (preview || result) && (
            <SummaryCard
              summary={result ?? preview!}
              committed={phase === "committed"}
            />
          )}

          {/* Import history */}
          <div className="space-y-3 mt-8">
            <h2 className="text-sm font-semibold text-[#e8e8e8]">최근 업로드</h2>
            {history && history.imports.length > 0 ? (
              <div className="border border-[#3a3a3a] rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[#252525] text-[#9ca3af] text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium">시각</th>
                      <th className="text-right px-4 py-2.5 font-medium">행 수</th>
                      <th className="text-right px-4 py-2.5 font-medium">반품</th>
                      <th className="text-left px-4 py-2.5 font-medium">판매 일자 범위</th>
                      <th className="text-left px-4 py-2.5 font-medium">채널</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.imports.map((e, i) => (
                      <tr key={`${e.bucket}-${i}`} className="border-t border-[#2a2a2a]">
                        <td className="px-4 py-2.5 text-[#e8e8e8]">
                          {e.bucket} <span className="text-[#666] ml-2">({formatRelative(e.bucket)})</span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{e.count.toLocaleString("ko-KR")}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-amber-300">{e.refunds.toLocaleString("ko-KR")}</td>
                        <td className="px-4 py-2.5 text-xs text-[#9ca3af]">{e.firstSoldAt} ~ {e.lastSoldAt}</td>
                        <td className="px-4 py-2.5 text-xs text-[#9ca3af]">{e.channelCode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-[#9ca3af]">아직 업로드된 데이터가 없습니다.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ summary, committed }: { summary: ImportSummary; committed: boolean }) {
  const headline = committed
    ? `✓ ${summary.imported.toLocaleString("ko-KR")}개 행이 업로드되었습니다`
    : `미리보기 결과 — 아직 저장되지 않았습니다`;
  const headlineColor = committed ? "text-emerald-300" : "text-[#9ca3af]";

  return (
    <div className="bg-[#252525] border border-[#3a3a3a] rounded-lg px-5 py-4 space-y-4">
      <p className={`text-sm font-semibold ${headlineColor}`}>{headline}</p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
        <Stat label="파싱된 행" value={summary.parsed.toLocaleString("ko-KR")} />
        <Stat label={committed ? "저장됨" : "신규"} value={(committed ? summary.imported : summary.parsed - summary.duplicates - summary.unmappedSkus - summary.errors).toLocaleString("ko-KR")} tone="positive" />
        <Stat label="중복 (스킵)" value={summary.duplicates.toLocaleString("ko-KR")} tone={summary.duplicates > 0 ? "warning" : undefined} />
        <Stat label="미등록 SKU" value={summary.unmappedSkus.toLocaleString("ko-KR")} tone={summary.unmappedSkus > 0 ? "warning" : undefined} />
        <Stat label="오류" value={summary.errors.toLocaleString("ko-KR")} tone={summary.errors > 0 ? "danger" : undefined} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-[#9ca3af] pt-3 border-t border-[#3a3a3a]">
        <div>반품: <span className="text-amber-300 tabular-nums">{summary.refundCount.toLocaleString("ko-KR")}</span></div>
        <div>처리 시간: <span className="tabular-nums">{summary.durationMs} ms</span></div>
        <div>파일: <span className="text-[#e8e8e8]">{summary.filename}</span></div>
      </div>

      {summary.unmappedSkuCodes.length > 0 && (
        <div className="text-xs text-amber-300/80 pt-3 border-t border-[#3a3a3a]">
          <p className="mb-1">SKU 마스터에 없는 코드 (먼저 Ecount 동기화 필요):</p>
          <p className="font-mono">{summary.unmappedSkuCodes.join(", ")}</p>
        </div>
      )}

      {summary.warnings.length > 0 && (
        <div className="text-xs text-[#9ca3af] pt-3 border-t border-[#3a3a3a]">
          <p className="mb-1">경고:</p>
          <ul className="list-disc ml-5">
            {summary.warnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {summary.errorSamples.length > 0 && (
        <details className="text-xs">
          <summary className="text-red-400 cursor-pointer">오류 행 샘플 ({summary.errors}개 중 {Math.min(10, summary.errorSamples.length)}개 표시)</summary>
          <ul className="mt-2 space-y-1 text-[#9ca3af]">
            {summary.errorSamples.map((e, i) => (
              <li key={i}>R{e.rowIndex}: {e.reason}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "positive" | "warning" | "danger" }) {
  const colour =
    tone === "positive" ? "text-emerald-300" :
    tone === "warning"  ? "text-amber-300" :
    tone === "danger"   ? "text-red-300" :
    "text-[#e8e8e8]";
  return (
    <div>
      <div className="text-xs text-[#9ca3af]">{label}</div>
      <div className={`text-xl mt-1 tabular-nums ${colour}`}>{value}</div>
    </div>
  );
}
