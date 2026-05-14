import type { ProductAnalysis } from "@workspace/api-client-react";
import type { RefSlot } from "./asset-creator-types";
import { useDragDrop, SlotThumb, AnalysisBlock, DropZone, SaveToLibraryInline } from "./reference-card-shared";

export function ProductReferenceCard({
  slots,
  limit,
  inputRef,
  onChange,
  onRemove,
  onDrop,
  onDimensionChange,
  onSaveToLibrary,
}: {
  slots: RefSlot<ProductAnalysis>[];
  limit: number;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (i: number) => void;
  onDrop: (files: File[]) => void;
  onDimensionChange: (i: number, dim: { w?: number; d?: number; h?: number }) => void;
  onSaveToLibrary?: (i: number, name: string) => Promise<void>;
}) {
  const isFull = slots.length >= limit;
  const { isDragging, handleDragEnter, handleDragLeave, handleDragOver, handleDrop } = useDragDrop(
    onDrop,
    isFull
  );

  return (
    <div
      className="bg-card border border-card-border rounded-xl p-4 space-y-3"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-card-foreground">
          제품 이미지 ({slots.length}/{limit}) — 앞/뒤/디테일
        </label>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onChange}
          className="hidden"
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={isFull}
          className="text-xs px-3 py-1 bg-accent text-accent-foreground rounded-md disabled:opacity-50"
        >
          {isFull ? `최대 ${limit}장` : "이미지 추가"}
        </button>
      </div>
      {slots.length === 0 ? (
        <DropZone
          onClick={() => inputRef.current?.click()}
          isDragging={isDragging}
          isFull={isFull}
          label={`제품 이미지를 업로드하거나 드래그하세요 (최대 ${limit}장)`}
          hint="앞면 / 뒷면 / 디테일 컷 권장"
          pasteHint
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        />
      ) : (
        <div className="space-y-3">
          {slots.map((slot, i) => (
            <div key={slot.id} className="space-y-2">
              <div className="flex gap-3 flex-wrap items-start">
                <SlotThumb
                  preview={slot.preview}
                  badge={`#${i + 1}`}
                  onRemove={() => onRemove(i)}
                />
                <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                  <p className="text-[11px] font-medium text-muted-foreground">치수 (선택)</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {(["w", "d", "h"] as const).map((axis) => (
                      <label key={axis} className="flex items-center gap-1 text-[11px]">
                        <span className="font-medium text-foreground uppercase">{axis}</span>
                        <input
                          type="number"
                          min={0}
                          placeholder="mm"
                          value={slot.dimensions?.[axis] ?? ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            const numVal = val === "" ? undefined : Number(val);
                            onDimensionChange(i, {
                              w: axis === "w" ? numVal : slot.dimensions?.w,
                              d: axis === "d" ? numVal : slot.dimensions?.d,
                              h: axis === "h" ? numVal : slot.dimensions?.h,
                            });
                          }}
                          className="w-16 border border-border rounded px-1.5 py-0.5 text-[11px] bg-background text-foreground"
                        />
                      </label>
                    ))}
                  </div>
                  <SaveToLibraryInline
                    guideImageId={slot.guideImageId}
                    onSave={onSaveToLibrary ? (name) => onSaveToLibrary(i, name) : undefined}
                  />
                </div>
              </div>
              <AnalysisBlock
                title={`제품 #${i + 1} 분석`}
                loading={slot.isAnalyzing}
                error={slot.error}
                rows={
                  slot.analysis
                    ? [
                        ["제품", slot.analysis.productType],
                        ["색상", slot.analysis.colorMap],
                        ["로고/그래픽", slot.analysis.logoAndGraphics],
                        ["트림", slot.analysis.trimAndBinding],
                        ["소재", slot.analysis.material],
                        ["구조", slot.analysis.constructionDetails],
                        ["라벨", slot.analysis.labelAndTags],
                      ]
                    : []
                }
              />
            </div>
          ))}
          {!isFull && (
            <DropZone
              onClick={() => inputRef.current?.click()}
              isDragging={isDragging}
              isFull={isFull}
              label={`이미지 추가 (${slots.length}/${limit}장)`}
              hint="클릭하거나 파일을 드래그하세요"
              pasteHint
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            />
          )}
        </div>
      )}
    </div>
  );
}
