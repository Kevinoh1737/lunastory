import type { VarCardState } from "./asset-creator-types";
import { formatRelativeTime } from "./asset-creator-types";

function SourceThumb({ base64 }: { base64: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-[72px] h-[72px] rounded-lg overflow-hidden ring-2 ring-[#4a9cf6]/60 bg-[#333]">
        <img
          src={`data:image/png;base64,${base64}`}
          alt="원본"
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-1 left-1 px-1 py-0.5 bg-[#4a9cf6]/90 rounded text-[7px] text-white font-bold leading-none">
          원본
        </div>
      </div>
      <span className="mt-1 text-[10px] font-semibold leading-tight select-none text-[#4a9cf6]">
        원본
      </span>
    </div>
  );
}

type LineageNodeData = {
  idx: number;
  card: VarCardState;
  children: LineageNodeData[];
  label: string;
};

function buildLineageTree(cards: VarCardState[]): LineageNodeData[] {
  const nodes: LineageNodeData[] = cards.map((card, idx) => ({
    idx,
    card,
    children: [],
    label: "",
  }));

  const roots: LineageNodeData[] = [];
  let rootCount = 0;
  let childCount = 0;

  for (const node of nodes) {
    const parentIdx = node.card.parentIdx;
    if (parentIdx !== undefined && parentIdx >= 0 && parentIdx < nodes.length) {
      nodes[parentIdx].children.push(node);
      childCount++;
      node.label = `수정 ${childCount}`;
    } else {
      rootCount++;
      node.label = `V${rootCount}`;
      roots.push(node);
    }
  }

  return roots;
}

function NodeColumn({
  node,
  selectedVariationIdx,
  onSelectVariation,
  depth = 0,
}: {
  node: LineageNodeData;
  selectedVariationIdx: number | null;
  onSelectVariation: (idx: number, base64: string) => void;
  depth?: number;
}) {
  const varIdx = node.idx + 1;
  const isSelected = selectedVariationIdx === varIdx;
  const { card } = node;
  const isEdit = node.card.parentIdx !== undefined;

  return (
    <div className="flex flex-col items-center">
      <div
        className={`relative w-[72px] h-[72px] rounded-lg overflow-hidden transition-all duration-150 flex items-center justify-center bg-[#333] ${
          card.status === "done"
            ? "cursor-pointer hover:scale-105"
            : "cursor-default"
        } ${
          isSelected
            ? "ring-2 ring-[#4a9cf6] ring-offset-2 ring-offset-[#252525] shadow-lg shadow-[#4a9cf6]/20"
            : card.status === "done"
            ? "ring-1 ring-[#3a3a3a] hover:ring-[#9ca3af]"
            : "ring-1 ring-dashed ring-[#3a3a3a]"
        }`}
        onClick={() => {
          if (card.status === "done" && card.imageBase64) {
            onSelectVariation(varIdx, card.imageBase64);
          }
        }}
        title={[
          node.label,
          node.card.createdAt ? `생성: ${formatRelativeTime(node.card.createdAt)}` : null,
          node.card.parentIdx !== undefined ? `부모: V${node.card.parentIdx + 1}` : null,
        ].filter(Boolean).join("\n")}
      >
        {card.status === "loading" ? (
          <div className="w-5 h-5 border-2 border-[#4a9cf6] border-t-transparent rounded-full animate-spin" />
        ) : card.status === "idle" ? (
          <span className="text-[9px] text-[#9ca3af]">대기 중</span>
        ) : card.status === "error" ? (
          <span className="text-[9px] text-red-400 px-1 text-center leading-tight">오류</span>
        ) : card.imageBase64 ? (
          <img
            src={`data:image/png;base64,${card.imageBase64}`}
            alt={node.label}
            className="w-full h-full object-cover"
          />
        ) : null}

        {isSelected && card.status === "done" && (
          <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#4a9cf6] flex items-center justify-center shadow">
            <svg width="8" height="6" viewBox="0 0 9 7" fill="none">
              <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}

        {isEdit && (
          <div className="absolute bottom-1 left-1 px-1 py-0.5 bg-orange-500/90 rounded text-[7px] text-white font-bold leading-none">
            수정
          </div>
        )}
      </div>

      <span
        className={`mt-1 text-[10px] font-semibold leading-tight select-none ${
          isSelected ? "text-[#4a9cf6]" : "text-[#9ca3af]"
        }`}
      >
        {node.label}
      </span>

      {node.children.length === 1 && (
        <div className="flex flex-col items-center">
          <div className="flex flex-col items-center">
            <div className="w-px h-3 bg-[#3a3a3a] mt-1" />
            <div className="w-2 h-2 border-b-2 border-r-2 border-[#3a3a3a] rotate-45 -mt-1" />
          </div>
          <div className="mt-1">
            <NodeColumn
              node={node.children[0]}
              selectedVariationIdx={selectedVariationIdx}
              onSelectVariation={onSelectVariation}
              depth={depth + 1}
            />
          </div>
        </div>
      )}
      {node.children.length > 1 && (
        <div className="flex flex-col items-center">
          <div className="w-px h-3 bg-[#3a3a3a] mt-1" />
          <div className="relative flex items-end gap-3">
            {node.children.map((child, ci) => (
              <div key={child.idx} className="flex flex-col items-center">
                <div className={`w-px h-3 bg-[#3a3a3a] ${ci === 0 || ci === node.children.length - 1 ? "opacity-60" : ""}`} />
                <NodeColumn
                  node={child}
                  selectedVariationIdx={selectedVariationIdx}
                  onSelectVariation={onSelectVariation}
                  depth={depth + 1}
                />
              </div>
            ))}
            <div className="absolute top-0 left-0 right-0 h-px bg-[#3a3a3a]" />
          </div>
        </div>
      )}
    </div>
  );
}

export function LineagePanel({
  varCardStates,
  isGenerating,
  selectedVariationIdx,
  variationGroupId,
  sourceCardBase64,
  onSelectVariation,
}: {
  varCardStates: VarCardState[];
  isGenerating: boolean;
  selectedVariationIdx: number | null;
  variationGroupId: string | null;
  sourceCardBase64?: string | null;
  onSelectVariation: (idx: number, base64: string) => void;
}) {
  if (varCardStates.length === 0 && !isGenerating && !sourceCardBase64) return null;

  const roots = buildLineageTree(varCardStates);
  const hasEdits = varCardStates.some((c) => c.parentIdx !== undefined);

  const iterationSkeletons = [0].map((i) => (
    <div key={i} className="flex flex-col items-center">
      <div className="w-[72px] h-[72px] rounded-lg ring-1 ring-dashed ring-[#3a3a3a] bg-[#333] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-[#4a9cf6] border-t-transparent rounded-full animate-spin" />
      </div>
      <span className="mt-1 text-[10px] text-[#9ca3af] font-semibold">생성 중</span>
    </div>
  ));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-[#9ca3af]">
            {isGenerating && varCardStates.every((c) => c.status === "loading" || c.status === "idle")
              ? "이미지 생성 중..."
              : "생성 히스토리"}
          </h3>
          {hasEdits && (
            <span className="text-[9px] px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded-full font-medium border border-orange-500/30">
              수정본 있음
            </span>
          )}
        </div>
        {variationGroupId && (
          <span className="text-[10px] text-[#9ca3af] font-mono">
            #{variationGroupId.slice(0, 8)}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-4 items-start">
        {sourceCardBase64 ? (
          <div className="flex flex-col items-center">
            <SourceThumb base64={sourceCardBase64} />
            <div className="flex flex-col items-center">
              <div className="w-px h-3 bg-[#3a3a3a] mt-1" />
              <div className="flex items-start gap-3 mt-1">
                {isGenerating && varCardStates.length === 0
                  ? iterationSkeletons
                  : roots.map((root) => (
                      <NodeColumn
                        key={root.idx}
                        node={root}
                        selectedVariationIdx={selectedVariationIdx}
                        onSelectVariation={onSelectVariation}
                      />
                    ))}
              </div>
            </div>
          </div>
        ) : isGenerating && varCardStates.length === 0
          ? iterationSkeletons
          : roots.map((root) => (
              <NodeColumn
                key={root.idx}
                node={root}
                selectedVariationIdx={selectedVariationIdx}
                onSelectVariation={onSelectVariation}
              />
            ))}
      </div>

      {!isGenerating && varCardStates.length > 0 && (
        <p className="text-[10px] text-[#9ca3af]">
          썸네일을 클릭하면 크게 표시됩니다
        </p>
      )}
    </div>
  );
}
