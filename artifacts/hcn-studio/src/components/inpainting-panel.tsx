import { MaskingCanvas, MaskingCanvasHandle } from "@/components/masking-canvas";

export function InpaintingPanel({
  workingImage,
  maskingOpen,
  onToggleMasking,
  maskPrompt,
  onMaskPromptChange,
  maskingCanvasRef,
  isGenerating,
  isInpainting,
  onInpaint,
}: {
  workingImage: { base64: string; dbId?: number } | null;
  maskingOpen: boolean;
  onToggleMasking: () => void;
  maskPrompt: string;
  onMaskPromptChange: (value: string) => void;
  maskingCanvasRef: React.RefObject<MaskingCanvasHandle | null>;
  isGenerating: boolean;
  isInpainting: boolean;
  onInpaint: () => void;
}) {
  if (!workingImage) return null;

  return (
    <div className="bg-[#252525] border border-[#3a3a3a] rounded-lg overflow-hidden">
      <button
        onClick={onToggleMasking}
        className="w-full flex items-center justify-between p-4 hover:bg-[#333] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#e8e8e8]">부분 수정하기 (Inpainting)</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded-full font-medium border border-orange-500/30">BETA</span>
        </div>
        <span className={`text-xs text-[#9ca3af] transition-transform inline-block ${maskingOpen ? "rotate-180" : ""}`}>▼</span>
      </button>

      {maskingOpen && (
        <div className="p-4 border-t border-[#3a3a3a] space-y-4">
          <MaskingCanvas
            ref={maskingCanvasRef}
            imageBase64={workingImage.base64}
          />

          <div className="space-y-2">
            <label className="text-xs font-medium text-[#9ca3af]">어떻게 수정할까요?</label>
            <textarea
              className="w-full min-h-[80px] p-3 bg-[#1e1e1e] border border-[#3a3a3a] rounded-lg text-sm text-[#e8e8e8] placeholder-[#9ca3af] focus:outline-none focus:border-[#4a9cf6] transition-colors resize-none"
              placeholder="빨간 영역을 어떻게 바꿀지 입력하세요 (예: 청바지를 검은색 슬랙스로 변경)"
              value={maskPrompt}
              onChange={(e) => onMaskPromptChange(e.target.value)}
            />
          </div>

          <button
            onClick={onInpaint}
            disabled={isGenerating || isInpainting || !maskPrompt.trim()}
            className="w-full py-2.5 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors shadow-md shadow-orange-500/20 flex items-center justify-center gap-2 text-sm"
          >
            {isGenerating || isInpainting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                수정 중...
              </>
            ) : (
              "선택 영역 수정하기"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
