import type { MoodAnalysis } from "@workspace/api-client-react";
import type { RefSlot } from "./asset-creator-types";
import { useDragDrop, SlotThumb, AnalysisBlock, DropZone, SaveToLibraryInline } from "./reference-card-shared";

export function MoodReferenceCard({
  slot,
  inputRef,
  onChange,
  onRemove,
  onDrop,
  onSaveToLibrary,
}: {
  slot: RefSlot<MoodAnalysis> | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  onDrop: (files: File[]) => void;
  onSaveToLibrary?: (name: string) => Promise<void>;
}) {
  const isFull = !!slot;
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
          분위기 레퍼런스 ({slot ? 1 : 0}/1) — 색감·조명·배경
        </label>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={onChange}
          className="hidden"
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={isFull}
          className="text-xs px-3 py-1 bg-accent text-accent-foreground rounded-md disabled:opacity-50"
        >
          {isFull ? "최대 1장" : "이미지 추가"}
        </button>
      </div>
      {!slot ? (
        <DropZone
          onClick={() => inputRef.current?.click()}
          isDragging={isDragging}
          isFull={isFull}
          label="분위기 레퍼런스 이미지를 업로드하거나 드래그하세요"
          hint="원하는 색감·조명·무드의 사진"
          pasteHint
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        />
      ) : (
        <div className="space-y-3">
          <div className="flex gap-3 flex-wrap items-start">
            <SlotThumb preview={slot.preview} onRemove={onRemove} />
            <div className="flex flex-col justify-start pt-1">
              <SaveToLibraryInline
                guideImageId={slot.guideImageId}
                onSave={onSaveToLibrary}
              />
            </div>
          </div>
          <AnalysisBlock
            title="분위기 분석"
            loading={slot.isAnalyzing}
            error={slot.error}
            rows={
              slot.analysis
                ? [
                    ["팔레트", slot.analysis.palette],
                    ["조명", slot.analysis.lighting],
                    ["무드", slot.analysis.mood],
                    ["배경", slot.analysis.background],
                    ["구도", slot.analysis.composition],
                    ["스타일", slot.analysis.photographyStyle],
                  ]
                : []
            }
          />
        </div>
      )}
    </div>
  );
}
