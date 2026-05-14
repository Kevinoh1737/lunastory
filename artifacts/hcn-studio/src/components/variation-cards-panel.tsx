import { RefreshCw } from "lucide-react";
import type { VarCardState } from "./asset-creator-types";

export function VariationCardsPanel({
  varCardStates,
  isGenerating,
  selectedVariationIdx,
  variationGroupId,
  iterationParentLabel,
  onSelectVariation,
  onSetSelectedIdx,
}: {
  varCardStates: VarCardState[];
  isGenerating: boolean;
  selectedVariationIdx: number | null;
  variationGroupId: string | null;
  iterationParentLabel?: string | null;
  onSelectVariation: (idx: number, base64: string) => void;
  onSetSelectedIdx: (idx: number) => void;
}) {
  if (varCardStates.length === 0) return null;

  return (
    <div className="bg-[#252525] border border-[#3a3a3a] rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <h3 className="font-medium text-sm text-[#e8e8e8]">
          {isGenerating ? "Variation 생성 중..." : "생성 결과"}
          {variationGroupId && (
            <span className="ml-2 text-[10px] text-[#9ca3af] font-normal">#{variationGroupId.slice(0, 8)}</span>
          )}
        </h3>
        {iterationParentLabel && (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[#22c55e]/15 text-[#4ade80] border border-[#22c55e]/30 font-medium">
            <RefreshCw className="w-2.5 h-2.5" />
            {iterationParentLabel} 기준
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {varCardStates.map((card, i) => {
          const varIdx = i + 1;
          const isSelected = selectedVariationIdx === varIdx;
          const isRejected = card.status === "done" && card.rejected === true;
          const isSelectable = card.status === "done" && !isRejected;
          return (
            <div
              key={i}
              className={`rounded-lg border-2 overflow-hidden transition-all ${
                isRejected
                  ? "border-[#3a3a3a] opacity-50 cursor-not-allowed"
                  : card.status === "done"
                  ? isSelected
                    ? "border-[#4a9cf6] shadow-[0_0_10px_rgba(74,156,246,0.3)] cursor-pointer"
                    : "border-[#3a3a3a] hover:border-[#9ca3af] cursor-pointer"
                  : "border-[#3a3a3a]"
              }`}
              onClick={() => {
                if (!isSelectable) return;
                onSetSelectedIdx(varIdx);
                if (card.imageBase64) {
                  onSelectVariation(varIdx, card.imageBase64);
                }
              }}
            >
              <div className="aspect-square bg-[#1e1e1e] overflow-hidden flex items-center justify-center relative">
                {card.status === "loading" ? (
                  <div className="w-full h-full flex flex-col items-center justify-center animate-pulse gap-1">
                    <div className="w-8 h-8 border-2 border-[#4a9cf6] border-t-transparent rounded-full animate-spin" />
                    <span className="text-[10px] text-[#9ca3af]">#{varIdx} 생성 중...</span>
                  </div>
                ) : card.status === "idle" ? (
                  <span className="text-xs text-[#9ca3af]">#{varIdx} 대기 중...</span>
                ) : card.status === "error" ? (
                  <div className="p-2 text-center">
                    <span className="text-[10px] text-red-400">{card.error || "오류"}</span>
                  </div>
                ) : card.imageBase64 ? (
                  <>
                    <img
                      src={`data:image/png;base64,${card.imageBase64}`}
                      alt={`Variation ${varIdx}`}
                      className="w-full h-full object-contain"
                    />
                    {isRejected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <span className="text-[10px] font-medium text-red-300 bg-black/70 px-1.5 py-0.5 rounded">
                          품질 검사 실패
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-[#9ca3af]">이미지 없음</span>
                )}
              </div>
              <div className="p-2 bg-[#252525]">
                <button
                  disabled={!isSelectable}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isSelectable) return;
                    onSetSelectedIdx(varIdx);
                    if (card.imageBase64) {
                      onSelectVariation(varIdx, card.imageBase64);
                    }
                  }}
                  className={`w-full text-xs py-1.5 rounded font-medium transition-colors disabled:opacity-40 ${
                    isSelected && isSelectable
                      ? "bg-[#4a9cf6] text-white"
                      : "bg-[#333] text-[#9ca3af] hover:bg-[#3a3a3a] hover:text-[#e8e8e8]"
                  }`}
                >
                  {card.status === "loading"
                    ? "생성 중..."
                    : card.status === "idle"
                    ? "대기 중"
                    : card.status === "error"
                    ? "실패"
                    : isRejected
                    ? "품질 검사 실패"
                    : isSelected
                    ? "✓ 선택됨"
                    : `Variation ${varIdx} 선택`}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
