import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";

export interface MaskingCanvasHandle {
  getMaskDataURL: () => string;
  reset: () => void;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 4.0;
const STEP = 0.25;

function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max);
}

export const MaskingCanvas = forwardRef<MaskingCanvasHandle, { imageBase64: string }>(
  ({ imageBase64 }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const maskCanvasRef = useRef<HTMLCanvasElement>(null);
    const [brushSize, setBrushSize] = useState(40);
    const [brushOpacity, setBrushOpacity] = useState(25);
    const [isEraser, setIsEraser] = useState(false);
    const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);

    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isPanMode, setIsPanMode] = useState(false);
    const [isPanning, setIsPanning] = useState(false);

    const isDrawing = useRef(false);
    const lastPos = useRef<{ x: number; y: number } | null>(null);
    const isPanningRef = useRef(false);
    const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

    useImperativeHandle(ref, () => ({
      getMaskDataURL: () => {
        const mc = maskCanvasRef.current;
        if (!mc) return "";
        return mc.toDataURL("image/png");
      },
      reset: () => {
        const mc = maskCanvasRef.current;
        if (!mc) return;
        const ctx = mc.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, mc.width, mc.height);
        redraw();
      },
    }));

    function redraw() {
      const c = canvasRef.current;
      const mc = maskCanvasRef.current;
      if (!c || !mc || !imgDims) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        ctx.drawImage(mc, 0, 0);
      };
      img.src = `data:image/jpeg;base64,${imageBase64}`;
    }

    useEffect(() => {
      const c = canvasRef.current;
      const mc = maskCanvasRef.current;
      const container = containerRef.current;
      if (!c || !mc || !container) return;

      setScale(1);
      setOffset({ x: 0, y: 0 });

      const img = new Image();
      img.onload = () => {
        const maxW = container.clientWidth || 400;
        const ratio = img.height / img.width;
        const w = Math.min(maxW, img.width);
        const h = Math.round(w * ratio);
        c.width = w;
        c.height = h;
        mc.width = w;
        mc.height = h;
        setImgDims({ w, h });
        const ctx = c.getContext("2d");
        if (ctx) ctx.drawImage(img, 0, 0, w, h);
      };
      img.src = `data:image/jpeg;base64,${imageBase64}`;
    }, [imageBase64]);

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

    const getPos = useCallback((e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
      const c = canvasRef.current;
      if (!c) return null;
      const rect = c.getBoundingClientRect();
      const scaleX = c.width / rect.width;
      const scaleY = c.height / rect.height;
      if ("touches" in e) {
        const touch = e.touches[0];
        if (!touch) return null;
        return {
          x: (touch.clientX - rect.left) * scaleX,
          y: (touch.clientY - rect.top) * scaleY,
        };
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }, []);

    const drawStroke = useCallback((from: { x: number; y: number }, to: { x: number; y: number }) => {
      const c = canvasRef.current;
      const mc = maskCanvasRef.current;
      if (!c || !mc) return;

      const ctx = c.getContext("2d");
      const mctx = mc.getContext("2d");
      if (!ctx || !mctx) return;

      if (isEraser) {
        mctx.globalCompositeOperation = "destination-out";
        mctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        mctx.globalCompositeOperation = "source-over";
        mctx.strokeStyle = `rgba(255, 0, 0, ${brushOpacity / 100})`;
      }
      mctx.lineWidth = brushSize;
      mctx.lineCap = "round";
      mctx.lineJoin = "round";
      mctx.beginPath();
      mctx.moveTo(from.x, from.y);
      mctx.lineTo(to.x, to.y);
      mctx.stroke();

      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        ctx.drawImage(mc, 0, 0);
      };
      img.src = `data:image/jpeg;base64,${imageBase64}`;
    }, [brushSize, brushOpacity, isEraser, imageBase64]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      if (isPanMode && scale > 1) {
        isPanningRef.current = true;
        setIsPanning(true);
        panStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
        return;
      }
      if (isPanMode) return;
      isDrawing.current = true;
      const pos = getPos(e);
      if (pos) {
        lastPos.current = pos;
        drawStroke(pos, pos);
      }
    }, [isPanMode, scale, offset, getPos, drawStroke]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
      if (isPanMode) {
        if (!isPanningRef.current) return;
        setOffset({
          x: panStart.current.ox + (e.clientX - panStart.current.x),
          y: panStart.current.oy + (e.clientY - panStart.current.y),
        });
        return;
      }
      if (!isDrawing.current) return;
      const pos = getPos(e);
      if (pos && lastPos.current) {
        drawStroke(lastPos.current, pos);
        lastPos.current = pos;
      }
    }, [isPanMode, getPos, drawStroke]);

    const handleMouseUp = useCallback(() => {
      isDrawing.current = false;
      isPanningRef.current = false;
      setIsPanning(false);
      lastPos.current = null;
    }, []);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
      e.preventDefault();
      if (isPanMode) return;
      isDrawing.current = true;
      const pos = getPos(e);
      if (pos) {
        lastPos.current = pos;
        drawStroke(pos, pos);
      }
    }, [isPanMode, getPos, drawStroke]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
      e.preventDefault();
      if (isPanMode) return;
      if (!isDrawing.current) return;
      const pos = getPos(e);
      if (pos && lastPos.current) {
        drawStroke(lastPos.current, pos);
        lastPos.current = pos;
      }
    }, [isPanMode, getPos, drawStroke]);

    const handleTouchEnd = useCallback(() => {
      isDrawing.current = false;
      lastPos.current = null;
    }, []);

    const handleReset = () => {
      const mc = maskCanvasRef.current;
      const c = canvasRef.current;
      if (!mc || !c) return;
      const mctx = mc.getContext("2d");
      if (mctx) mctx.clearRect(0, 0, mc.width, mc.height);
      const img = new Image();
      img.onload = () => {
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
        }
      };
      img.src = `data:image/jpeg;base64,${imageBase64}`;
    };

    const zoomIn = () => {
      setScale((s) => {
        const next = clamp(Math.round((s + STEP) * 4) / 4, MIN_SCALE, MAX_SCALE);
        return next;
      });
    };

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

    const canvasCursor = isPanMode
      ? isPanning ? "grabbing" : (scale > 1 ? "grab" : "default")
      : "crosshair";

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>브러시 크기</span>
            <input
              type="range"
              min={10}
              max={80}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-24 accent-red-500"
            />
            <span className="w-6 text-center">{brushSize}</span>
          </label>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>불투명도</span>
            <input
              type="range"
              min={10}
              max={80}
              value={brushOpacity}
              onChange={(e) => setBrushOpacity(Number(e.target.value))}
              className="w-24 accent-red-500"
            />
            <span className="w-6 text-center">{brushOpacity}</span>
          </label>
          <button
            type="button"
            onClick={() => setIsEraser((v) => !v)}
            className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
              isEraser
                ? "bg-orange-100 border-orange-400 text-orange-700"
                : "border-border text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {isEraser ? "지우개 ON" : "지우개"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="text-[11px] px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            전체 초기화
          </button>
          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              onClick={() => setIsPanMode((v) => !v)}
              className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
                isPanMode
                  ? "bg-blue-100 border-blue-400 text-blue-700"
                  : "border-border text-muted-foreground hover:bg-muted/50"
              }`}
              title="팬 모드: 드래그로 이동"
            >
              팬
            </button>
            <button
              type="button"
              onClick={zoomOut}
              disabled={scale <= MIN_SCALE}
              className="w-6 h-6 flex items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted/50 disabled:opacity-30 text-sm font-bold transition-colors"
              title="축소"
            >
              −
            </button>
            <button
              type="button"
              onClick={resetZoom}
              className="min-w-[3rem] text-center text-[11px] px-1.5 py-1 rounded border border-border text-muted-foreground hover:bg-muted/50 transition-colors font-mono"
              title="원래 크기로"
            >
              {pct}%
            </button>
            <button
              type="button"
              onClick={zoomIn}
              disabled={scale >= MAX_SCALE}
              className="w-6 h-6 flex items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted/50 disabled:opacity-30 text-sm font-bold transition-colors"
              title="확대"
            >
              +
            </button>
          </div>
        </div>
        <div
          ref={containerRef}
          className="relative w-full rounded-lg overflow-hidden border border-border select-none"
          style={{ cursor: canvasCursor }}
        >
          <div
            style={{
              transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
              transformOrigin: "center center",
              transition: isPanning ? "none" : "transform 0.05s ease-out",
            }}
          >
            <canvas
              ref={canvasRef}
              className="w-full block"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />
          </div>
          <canvas ref={maskCanvasRef} className="hidden" />
        </div>
        {imgDims && (
          <p className="text-[10px] text-muted-foreground">
            {isPanMode
              ? "팬 모드: 드래그하여 캔버스를 이동하세요"
              : isEraser
              ? "지우개 모드: 마스크를 지웁니다"
              : "브러시 모드: 드래그하여 수정할 영역을 칠하세요 (빨간 오버레이)"}
          </p>
        )}
      </div>
    );
  }
);

MaskingCanvas.displayName = "MaskingCanvas";

export function compositeImageWithMask(base64: string, maskDataURL: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const mask = new Image();
    let loaded = 0;
    const check = () => {
      loaded += 1;
      if (loaded === 2) {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context fail"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        ctx.drawImage(mask, 0, 0, img.width, img.height);
        resolve(canvas.toDataURL("image/jpeg", 0.9).split(",")[1]);
      }
    };
    img.onload = check;
    mask.onload = check;
    img.onerror = () => reject(new Error("Original image fail"));
    mask.onerror = () => reject(new Error("Mask image fail"));
    img.src = `data:image/jpeg;base64,${base64}`;
    mask.src = maskDataURL;
  });
}
