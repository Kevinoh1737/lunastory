import { toast } from "@/hooks/use-toast";
import type { ProductAnalysis, MoodAnalysis, ModelAnalysis } from "@workspace/api-client-react";

export type RefCategory = "product" | "mood" | "model";

export type VarCardState = {
  status: "idle" | "loading" | "done" | "error";
  imageBase64: string | null;
  error: string | null;
  parentIdx?: number;
  createdAt?: string;
  userPromptExpanded?: string;
  rejected?: boolean;
  rejectionReason?: string;
  generationBadge?: "첫 생성" | "수정";
};

export type RefSlot<A> = {
  id: string;
  guideImageId?: number;
  imageUrl?: string;
  base64: string;
  preview: string;
  analysis: A | null;
  isAnalyzing: boolean;
  error?: string;
  dimensions?: { w?: number; d?: number; h?: number };
  modelDimensions?: { height?: number; age?: number };
};

export type TreeImageItem = {
  id: number;
  imageUrl: string;
  parentId?: number | null;
  variationGroupId?: string | null;
  variationIndex?: number | null;
  createdAt: string;
};

export type TreeNode = TreeImageItem & {
  children: TreeNode[];
};

export function makeSlotId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `slot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function buildTree(images: TreeImageItem[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  for (const img of images) {
    map.set(img.id, { ...img, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const node of map.values()) {
    if (node.parentId != null && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  for (const node of map.values()) {
    node.children.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  roots.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return roots;
}

export function containsId(node: TreeNode, id: number): boolean {
  if (node.id === id) return true;
  return node.children.some((child) => containsId(child, id));
}

export function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

const MAX_PX = 1280;

export function resizeImageFile(file: File): Promise<{ base64: string; preview: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > MAX_PX || height > MAX_PX) {
        if (width >= height) {
          height = Math.round((height / width) * MAX_PX);
          width = MAX_PX;
        } else {
          width = Math.round((width / height) * MAX_PX);
          height = MAX_PX;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not available"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const preview = canvas.toDataURL("image/jpeg", 0.92);
      const base64 = preview.split(",")[1] ?? "";
      resolve({ base64, preview });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image load failed"));
    };
    img.src = objectUrl;
  });
}

export function filterImageFiles(files: File[]): File[] {
  return files.filter((f) => f.type.startsWith("image/"));
}

export function serializeSlot<A>(s: RefSlot<A>): Omit<RefSlot<A>, "preview" | "isAnalyzing"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { preview: _preview, isAnalyzing: _ia, ...rest } = s;
  return rest;
}

export function deserializeSlot<A>(s: Omit<RefSlot<A>, "preview" | "isAnalyzing">): RefSlot<A> {
  return { ...s, preview: `data:image/jpeg;base64,${s.base64}`, isAnalyzing: false };
}

let _storageWarnShown = false;
export function sessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    console.warn(`[AssetCreator] sessionStorage write failed for "${key}". Uploads won't survive a page refresh.`);
    if (!_storageWarnShown) {
      _storageWarnShown = true;
      toast({
        variant: "destructive",
        title: "업로드가 임시 저장되지 않습니다",
        description: "브라우저 저장 공간이 부족하여 새로고침 시 이미지가 초기화될 수 있습니다.",
      });
    }
  }
}

export function productAnalysisToText(a: ProductAnalysis): string {
  return [
    `Product type: ${a.productType}`,
    `Color map: ${a.colorMap}`,
    `Logo/Graphics: ${a.logoAndGraphics}`,
    `Trim/Binding: ${a.trimAndBinding}`,
    `Material: ${a.material}`,
    `Construction: ${a.constructionDetails}`,
    `Front/Back differences: ${a.frontBackDifferences}`,
    `Labels/Tags: ${a.labelAndTags}`,
    `Photography tips: ${a.photographyTips}`,
  ].join(". ");
}

export function moodAnalysisToText(a: MoodAnalysis): string {
  return [
    `Palette: ${a.palette}`,
    `Lighting: ${a.lighting}`,
    `Mood: ${a.mood}`,
    `Background: ${a.background}`,
    `Composition: ${a.composition}`,
    `Photography style: ${a.photographyStyle}`,
  ].join(". ");
}

export function modelAnalysisToText(a: ModelAnalysis): string {
  return [
    `Age range: ${a.ageRange}`,
    `Body type: ${a.bodyType}`,
    `Pose: ${a.pose}`,
    `Expression: ${a.expression}`,
    `Styling: ${a.styling}`,
    `Features: ${a.ethnicityOrFeatures}`,
  ].join(". ");
}
