import { buildTree, containsId, formatRelativeTime } from "./asset-creator-types";
import type { TreeImageItem, TreeNode } from "./asset-creator-types";

function HistoryNodeThumb({
  node,
  label,
  isActive,
  onSelect,
}: {
  node: TreeImageItem;
  label?: string;
  isActive: boolean;
  onSelect: (node: TreeImageItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(node)}
      className={`flex items-center gap-2 p-1.5 rounded-lg border transition-colors text-left hover:bg-accent/40 ${
        isActive
          ? "border-blue-500 ring-2 ring-blue-400/50 bg-blue-50/30"
          : "border-border bg-card"
      }`}
      title={formatRelativeTime(node.createdAt)}
    >
      <div className="shrink-0 w-10 h-10 rounded overflow-hidden bg-muted">
        <img
          src={node.imageUrl}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="flex flex-col min-w-0">
        {label && (
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide leading-none mb-0.5">
            {label}
          </span>
        )}
        <span className="text-[11px] text-muted-foreground truncate">
          {formatRelativeTime(node.createdAt)}
        </span>
        {isActive && (
          <span className="text-[10px] text-blue-600 font-medium leading-none mt-0.5">작업 중</span>
        )}
      </div>
    </button>
  );
}

function HistoryTreeNode({
  node,
  depth,
  workingImageId,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  workingImageId: number | null;
  onSelect: (node: TreeImageItem) => void;
}) {
  return (
    <div className="space-y-2">
      <HistoryNodeThumb
        node={node}
        isActive={workingImageId === node.id}
        onSelect={onSelect}
      />
      {node.children.length > 0 && (
        <div className={`ml-4 border-l-2 border-border pl-3 space-y-2 ${depth >= 3 ? "opacity-80" : ""}`}>
          {node.children.map((child) => (
            <HistoryTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              workingImageId={workingImageId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VariationGroupRow({
  nodes,
  workingImageId,
  onSelect,
}: {
  nodes: TreeNode[];
  workingImageId: number | null;
  onSelect: (node: TreeImageItem) => void;
}) {
  const sortedNodes = [...nodes].sort((a, b) => {
    if (a.variationIndex != null && b.variationIndex != null) return a.variationIndex - b.variationIndex;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const activeId = workingImageId ?? -1;
  const selectedNode =
    sortedNodes.find((n) => n.id === activeId) ??
    sortedNodes.find((n) => containsId(n, activeId)) ??
    sortedNodes[0];
  const childrenToShow = selectedNode?.children ?? [];

  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        {sortedNodes.map((node, i) => (
          <HistoryNodeThumb
            key={node.id}
            node={node}
            label={`V${i + 1}`}
            isActive={workingImageId === node.id}
            onSelect={onSelect}
          />
        ))}
      </div>
      {childrenToShow.length > 0 && (
        <div className="ml-4 border-l-2 border-border pl-3 space-y-2">
          {childrenToShow.map((child) => (
            <HistoryTreeNode
              key={child.id}
              node={child}
              depth={1}
              workingImageId={workingImageId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ImageHistoryPanel({
  items,
  workingImageId,
  onSelect,
}: {
  items: TreeImageItem[];
  workingImageId: number | null;
  onSelect: (node: TreeImageItem) => void;
}) {
  const roots = buildTree(items);

  const variationGroups = new Map<string, TreeNode[]>();

  for (const node of roots) {
    if (node.variationGroupId) {
      const group = variationGroups.get(node.variationGroupId) ?? [];
      group.push(node);
      variationGroups.set(node.variationGroupId, group);
    }
  }

  const allRootEntries: Array<{ key: string; nodes: TreeNode[] }> = [];
  const seenGroups = new Set<string>();
  for (const node of roots) {
    if (node.variationGroupId) {
      if (!seenGroups.has(node.variationGroupId)) {
        seenGroups.add(node.variationGroupId);
        allRootEntries.push({
          key: node.variationGroupId,
          nodes: variationGroups.get(node.variationGroupId)!,
        });
      }
    } else {
      allRootEntries.push({ key: String(node.id), nodes: [node] });
    }
  }

  return (
    <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
      <h3 className="font-semibold text-sm text-card-foreground">이미지 히스토리</h3>
      {allRootEntries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">아직 저장된 이미지가 없습니다</p>
      ) : (
        <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
          {allRootEntries.map((entry) => (
            <div key={entry.key}>
              {entry.nodes.length > 1 ? (
                <VariationGroupRow
                  nodes={entry.nodes}
                  workingImageId={workingImageId}
                  onSelect={onSelect}
                />
              ) : (
                <HistoryTreeNode
                  node={entry.nodes[0]}
                  depth={0}
                  workingImageId={workingImageId}
                  onSelect={onSelect}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
