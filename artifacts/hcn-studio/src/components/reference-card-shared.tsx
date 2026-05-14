import { useState, useRef, useEffect } from "react";

export function usePaste(onFiles: (files: File[]) => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: ClipboardEvent) => {
      if (e.defaultPrevented) return;
      if (!e.clipboardData) return;
      const imageFiles = Array.from(e.clipboardData.items)
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((f): f is File => f !== null);
      if (imageFiles.length > 0) {
        e.preventDefault();
        onFiles(imageFiles);
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [onFiles, enabled]);
}

export function useDragDrop(onDrop: (files: File[]) => void, disabled: boolean) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (dragCounter.current === 1) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onDrop(files);
  };

  return { isDragging, handleDragEnter, handleDragLeave, handleDragOver, handleDrop };
}

export function SlotThumb({
  preview,
  onRemove,
  badge,
}: {
  preview: string;
  onRemove: () => void;
  badge?: string;
}) {
  return (
    <div className="relative group shrink-0 flex items-start justify-center">
      <img
        src={preview}
        alt="reference"
        className="max-w-[120px] max-h-[160px] object-contain rounded-lg border border-border"
      />
      {badge && (
        <span className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 bg-black/60 text-white rounded">
          {badge}
        </span>
      )}
      <button
        onClick={onRemove}
        className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
      >
        X
      </button>
    </div>
  );
}

export function AnalysisBlock({
  title,
  rows,
  loading,
  error,
}: {
  title: string;
  rows: Array<[string, string]>;
  loading?: boolean;
  error?: string;
}) {
  return (
    <div className="border border-border rounded-lg p-2.5 bg-muted/30">
      <p className="text-[11px] font-medium text-card-foreground mb-1.5 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 bg-violet-500 rounded-full" />
        {title}
      </p>
      {loading ? (
        <p className="text-[11px] text-muted-foreground animate-pulse">분석 중...</p>
      ) : error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : (
        <div className="space-y-1 text-[11px] text-muted-foreground max-h-[180px] overflow-y-auto">
          {rows.map(([k, v]) => (
            <p key={k}>
              <span className="font-medium text-foreground">{k}:</span> {v}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function SaveToLibraryInline({
  guideImageId,
  onSave,
}: {
  guideImageId?: number;
  onSave?: (name: string) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [inputName, setInputName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);

  useEffect(() => {
    if (guideImageId) {
      setSavedName(null);
      setShowForm(false);
    }
  }, [guideImageId]);

  if (guideImageId && !savedName) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-[#4a9cf6]/15 text-[#4a9cf6] rounded-full border border-[#4a9cf6]/30">
        라이브러리 이미지
      </span>
    );
  }

  if (savedName) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-emerald-500/15 text-emerald-400 rounded-full border border-emerald-500/30">
        ✓ 저장됨: {savedName}
      </span>
    );
  }

  if (!onSave) return null;

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="text-[10px] text-[#9ca3af] hover:text-[#4a9cf6] underline underline-offset-2 transition-colors"
      >
        라이브러리에 저장
      </button>
    );
  }

  const handleSave = async () => {
    const name = inputName.trim();
    if (!name) return;
    setIsSaving(true);
    try {
      await onSave(name);
      setSavedName(name);
      setShowForm(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <input
        autoFocus
        type="text"
        placeholder="예: 빨간 수영복"
        value={inputName}
        onChange={(e) => setInputName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setShowForm(false); }}
        className="flex-1 min-w-[120px] border border-border rounded px-1.5 py-0.5 text-[11px] bg-background text-foreground"
      />
      <button
        onClick={handleSave}
        disabled={isSaving || !inputName.trim()}
        className="text-[10px] px-2 py-0.5 bg-[#4a9cf6] text-white rounded disabled:opacity-50 whitespace-nowrap"
      >
        {isSaving ? "저장 중..." : "저장"}
      </button>
      <button
        onClick={() => setShowForm(false)}
        className="text-[10px] text-[#9ca3af] hover:text-foreground"
      >
        취소
      </button>
    </div>
  );
}

export function DropZone({
  onClick,
  isDragging,
  isFull,
  label,
  hint,
  pasteHint,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
}: {
  onClick: () => void;
  isDragging: boolean;
  isFull: boolean;
  label: string;
  hint: string;
  pasteHint?: boolean;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  if (isFull) return null;
  return (
    <div
      onClick={onClick}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
        isDragging
          ? "border-primary bg-primary/10"
          : "border-border hover:bg-accent/30"
      }`}
    >
      <p className="text-sm text-muted-foreground">
        {isDragging ? "여기에 놓으세요" : label}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {hint}
        {pasteHint && !isDragging && " · 또는 Ctrl+V로 붙여넣기"}
      </p>
    </div>
  );
}
