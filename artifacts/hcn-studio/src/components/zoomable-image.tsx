import { useCallback, useEffect, useRef, useState } from "react";

interface ZoomableImageProps {
  src: string;
  alt: string;
  resetKey?: string | number;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 4.0;
const STEP = 0.25;

function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max);
}

export function ZoomableImage({ src, alt, resetKey }: ZoomableImageProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [resetKey, src]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY;
    setScale((s) => {
      const next = clamp(s + delta * 0.001 * s, MIN_SCALE, MAX_SCALE);
      if (next <= 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return;
    draggingRef.current = true;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    e.preventDefault();
  }, [scale, offset]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingRef.current) return;
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    });
  }, []);

  const stopDrag = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
  }, []);

  const zoomIn = () => setScale((s) => clamp(Math.round((s + STEP) * 4) / 4, MIN_SCALE, MAX_SCALE));
  const zoomOut = () => {
    setScale((s) => {
      const next = clamp(Math.round((s - STEP) * 4) / 4, MIN_SCALE, MAX_SCALE);
      if (next <= 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  };
  const resetZoom = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const pct = Math.round(scale * 100);

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full h-full overflow-hidden flex items-center justify-center"
        style={{ cursor: scale > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="w-full h-full object-contain select-none"
          style={{
            transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
            transformOrigin: "center center",
            transition: draggingRef.current ? "none" : "transform 0.05s ease-out",
            maxHeight: 560,
          }}
        />
      </div>

      <div className="absolute top-2 right-2 flex items-center gap-1 bg-[#1a1a1a]/80 backdrop-blur-sm border border-[#3a3a3a] rounded-md px-1.5 py-1">
        <button
          onClick={zoomOut}
          disabled={scale <= MIN_SCALE}
          className="w-6 h-6 flex items-center justify-center text-[#9ca3af] hover:text-white disabled:opacity-30 text-sm font-bold transition-colors"
          title="축소"
        >
          −
        </button>
        <button
          onClick={resetZoom}
          className="min-w-[3rem] text-center text-xs text-[#9ca3af] hover:text-white transition-colors font-mono"
          title="원래 크기로"
        >
          {pct}%
        </button>
        <button
          onClick={zoomIn}
          disabled={scale >= MAX_SCALE}
          className="w-6 h-6 flex items-center justify-center text-[#9ca3af] hover:text-white disabled:opacity-30 text-sm font-bold transition-colors"
          title="확대"
        >
          +
        </button>
      </div>
    </div>
  );
}
