import type { ModelAnalysis } from "@workspace/api-client-react";
import type { RefSlot } from "./asset-creator-types";
import { useDragDrop, SlotThumb, AnalysisBlock, DropZone, SaveToLibraryInline } from "./reference-card-shared";

export function ModelReferenceCard({
  slots,
  limit,
  inputRef,
  onChange,
  onRemove,
  onDrop,
  onModelDimensionChange,
  onSaveToLibrary,
}: {
  slots: RefSlot<ModelAnalysis>[];
  limit: number;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (i: number) => void;
  onDrop: (files: File[]) => void;
  onModelDimensionChange: (i: number, dim: { height?: number; age?: number }) => void;
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
          모델 이미지 ({slots.length}/{limit}) — 포즈·연령대·스타일링
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
          label={`모델 이미지를 업로드하거나 드래그하세요 (최대 ${limit}장)`}
          hint="원하는 모델의 포즈·체형·연령대 참고 사진"
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
                  <p className="text-[11px] font-medium text-muted-foreground">실측 정보 (선택)</p>
                  <div className="flex gap-1.5 flex-wrap">
                    <label className="flex items-center gap-1 text-[11px]">
                      <span className="font-medium text-foreground">신장</span>
                      <input
                        type="number"
                        min={0}
                        placeholder="mm"
                        value={slot.modelDimensions?.height ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          onModelDimensionChange(i, { height: val === "" ? undefined : Number(val) });
                        }}
                        className="w-16 border border-border rounded px-1.5 py-0.5 text-[11px] bg-background text-foreground"
                      />
                    </label>
                    <label className="flex items-center gap-1 text-[11px]">
                      <span className="font-medium text-foreground">나이</span>
                      <input
                        type="number"
                        min={0}
                        placeholder="세"
                        value={slot.modelDimensions?.age ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          onModelDimensionChange(i, { age: val === "" ? undefined : Number(val) });
                        }}
                        className="w-16 border border-border rounded px-1.5 py-0.5 text-[11px] bg-background text-foreground"
                      />
                    </label>
                  </div>
                  <SaveToLibraryInline
                    guideImageId={slot.guideImageId}
                    onSave={onSaveToLibrary ? (name) => onSaveToLibrary(i, name) : undefined}
                  />
                </div>
              </div>
              <AnalysisBlock
                title={`모델 #${i + 1} 분석`}
                loading={slot.isAnalyzing}
                error={slot.error}
                rows={
                  slot.analysis
                    ? [
                        ["연령대", slot.analysis.ageRange],
                        ["체형", slot.analysis.bodyType],
                        ["포즈", slot.analysis.pose],
                        ["표정", slot.analysis.expression],
                        ["스타일링", slot.analysis.styling],
                        ["특징", slot.analysis.ethnicityOrFeatures],
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
