import { useState, useRef, useEffect, useMemo } from "react";
import { useParams } from "wouter";
import { MaskingCanvasHandle, compositeImageWithMask } from "@/components/masking-canvas";
import { toast } from "@/hooks/use-toast";
import {
  useSaveImage,
  useListImages,
  useUpdateImage,
  useDeleteImage,
  getListImagesQueryKey,
  analyzeProductRef,
  analyzeMoodRef,
  analyzeModelRef,
  generateGeminiImage,
  saveImage,
  GenerateImageBodyTag,
  useCreateGuideImage,
  getListGuideImagesQueryKey,
} from "@workspace/api-client-react";
import type {
  ProductAnalysis,
  MoodAnalysis,
  ModelAnalysis,
  GuideImage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  type RefSlot,
  makeSlotId,
  resizeImageFile,
  filterImageFiles,
  serializeSlot,
  deserializeSlot,
  sessionSet,
  productAnalysisToText,
  moodAnalysisToText,
  modelAnalysisToText,
} from "@/components/asset-creator-types";
import type { VarCardState } from "@/components/asset-creator-types";
import { ProductReferenceCard } from "@/components/product-reference-card";
import { MoodReferenceCard } from "@/components/mood-reference-card";
import { ModelReferenceCard } from "@/components/model-reference-card";
import { LineagePanel } from "@/components/lineage-panel";
import { InpaintingPanel } from "@/components/inpainting-panel";
import { LeftSidebar } from "@/components/left-sidebar";
import { TaskHeader } from "@/components/task-header";
import { GuideImageLibrary } from "@/components/guide-image-library";
import { Download, Save, Sparkles, ChevronDown, Layers, Image as ImageIcon, RefreshCw, AlertTriangle } from "lucide-react";
import { ZoomableImage } from "@/components/zoomable-image";

type RefCategory = "product" | "mood" | "model";

const PRODUCT_LIMIT = 3;
const MODEL_LIMIT = 2;

type LibraryModal = { open: false } | { open: true; category: RefCategory };

export default function AssetCreator() {
  const params = useParams<{ id: string }>();
  const taskId = params.id ? Number(params.id) : null;

  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [varCardStates, setVarCardStates] = useState<VarCardState[]>([]);
  const [selectedVariationIdx, setSelectedVariationIdx] = useState<number | null>(null);
  const [variationGroupId, setVariationGroupId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [workingImageId, setWorkingImageId] = useState<number | null>(null);
  const [workingImageUrl, setWorkingImageUrl] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [libraryModal, setLibraryModal] = useState<LibraryModal>({ open: false });
  const [lineagePanelOpen, setLineagePanelOpen] = useState(true);

  const [productSlots, setProductSlots] = useState<RefSlot<ProductAnalysis>[]>(() => {
    try {
      const stored = sessionStorage.getItem(`assetCreator_productSlots_task${taskId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as Omit<RefSlot<ProductAnalysis>, "preview" | "isAnalyzing">[];
        return parsed.map(deserializeSlot);
      }
    } catch {}
    return [];
  });
  const [moodSlot, setMoodSlot] = useState<RefSlot<MoodAnalysis> | null>(() => {
    try {
      const stored = sessionStorage.getItem(`assetCreator_moodSlot_task${taskId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as Omit<RefSlot<MoodAnalysis>, "preview" | "isAnalyzing">;
        return deserializeSlot(parsed);
      }
    } catch {}
    return null;
  });
  const [modelSlots, setModelSlots] = useState<RefSlot<ModelAnalysis>[]>(() => {
    try {
      const stored = sessionStorage.getItem(`assetCreator_modelSlots_task${taskId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as Omit<RefSlot<ModelAnalysis>, "preview" | "isAnalyzing">[];
        return parsed.map(deserializeSlot);
      }
    } catch {}
    return [];
  });

  const [promptPreviewOpen, setPromptPreviewOpen] = useState(false);
  const [isRunningAnalysis, setIsRunningAnalysis] = useState(false);

  const [workingImage, setWorkingImage] = useState<{ base64: string; dbId?: number } | null>(null);
  const [workingImageSource, setWorkingImageSource] = useState<"generated" | "uploaded" | null>(null);
  const [iterationParentId, setIterationParentId] = useState<number | null>(null);
  const [iterationParentLabel, setIterationParentLabel] = useState<string | null>(null);
  const [iterationSourceBase64, setIterationSourceBase64] = useState<string | null>(null);
  const [is4KDownloading, setIs4KDownloading] = useState(false);
  const [refineTip, setRefineTip] = useState("");
  const [refineInputOpen, setRefineInputOpen] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [maskingOpen, setMaskingOpen] = useState(false);
  const [maskPrompt, setMaskPrompt] = useState("");
  const [isInpainting, setIsInpainting] = useState(false);

  const [cameraTransformOpen, setCameraTransformOpen] = useState(false);
  const [transformAngle, setTransformAngle] = useState<string | null>(null);
  const [transformLens, setTransformLens] = useState<string | null>(null);
  const [transformDepth, setTransformDepth] = useState<string | null>(null);
  const [transformColor, setTransformColor] = useState<string | null>(null);
  const [isTransforming, setIsTransforming] = useState(false);
  const [transformStep, setTransformStep] = useState<"analyzing" | "generating" | null>(null);
  const maskingCanvasRef = useRef<MaskingCanvasHandle | null>(null);

  const productInputRef = useRef<HTMLInputElement>(null);
  const moodInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const workingUploadInputRef = useRef<HTMLInputElement>(null);

  const { data: savedImages, refetch: refetchImages } = useListImages(
    {
      taskId: taskId || undefined,
      status: filterStatus || undefined,
    },
    { query: { enabled: !!taskId } }
  );

  const saveMutation = useSaveImage();
  const updateMutation = useUpdateImage();
  const deleteMutation = useDeleteImage();
  const createGuideImageMutation = useCreateGuideImage();

  useEffect(() => {
    if (!taskId) return;
    if (productSlots.length === 0) {
      try { sessionStorage.removeItem(`assetCreator_productSlots_task${taskId}`); } catch {}
    } else {
      sessionSet(`assetCreator_productSlots_task${taskId}`, JSON.stringify(productSlots.map(serializeSlot)));
    }
  }, [productSlots, taskId]);

  useEffect(() => {
    if (!taskId) return;
    if (moodSlot) {
      sessionSet(`assetCreator_moodSlot_task${taskId}`, JSON.stringify(serializeSlot(moodSlot)));
    } else {
      try { sessionStorage.removeItem(`assetCreator_moodSlot_task${taskId}`); } catch {}
    }
  }, [moodSlot, taskId]);

  useEffect(() => {
    if (!taskId) return;
    if (modelSlots.length === 0) {
      try { sessionStorage.removeItem(`assetCreator_modelSlots_task${taskId}`); } catch {}
    } else {
      sessionSet(`assetCreator_modelSlots_task${taskId}`, JSON.stringify(modelSlots.map(serializeSlot)));
    }
  }, [modelSlots, taskId]);

  useEffect(() => {
    setWorkingImageId(null);
    setWorkingImageUrl(null);
    setWorkingImage(null);
    setWorkingImageSource(null);
    setVarCardStates([]);
    setSelectedVariationIdx(null);
    setVariationGroupId(null);
    setIterationParentId(null);
    setIterationParentLabel(null);
    setIterationSourceBase64(null);
    setProductSlots([]);
    setMoodSlot(null);
    setModelSlots([]);
  }, [taskId]);

  useEffect(() => {
    maskingCanvasRef.current?.reset();
  }, [workingImage]);

  useEffect(() => {
    setTransformAngle(null);
    setTransformLens(null);
    setTransformDepth(null);
    setTransformColor(null);
  }, [workingImage]);

  const refSlotsRef = useRef({ productSlots, moodSlot, modelSlots });
  useEffect(() => {
    refSlotsRef.current = { productSlots, moodSlot, modelSlots };
  }, [productSlots, moodSlot, modelSlots]);

  const workingImageRef = useRef(workingImage);
  useEffect(() => {
    workingImageRef.current = workingImage;
  }, [workingImage]);

  const addFilesRef = useRef(addFiles);
  useEffect(() => {
    addFilesRef.current = addFiles;
  });

  const handleWorkingImageUploadRef = useRef(handleWorkingImageUpload);
  useEffect(() => {
    handleWorkingImageUploadRef.current = handleWorkingImageUpload;
  });

  const libraryModalRef = useRef(libraryModal);
  useEffect(() => {
    libraryModalRef.current = libraryModal;
  }, [libraryModal]);

  const sidebarUploadRef = useRef<((file: File) => Promise<void>) | null>(null);
  const isSidebarHoveredRef = useRef(false);
  const sidebarDivRef = useRef<HTMLDivElement>(null);

  const [rightPanelWidth, setRightPanelWidth] = useState(280);
  const isResizingRef = useRef(false);
  const resizeStartRef = useRef({ x: 0, startWidth: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function addFiles(category: RefCategory, rawFiles: File[]) {
    const files = filterImageFiles(rawFiles);
    if (files.length === 0) return;

    if (category === "product") {
      const remaining = PRODUCT_LIMIT - productSlots.length;
      const batch = files.slice(0, remaining);
      for (const file of batch) {
        const { base64, preview } = await resizeImageFile(file);
        const id = makeSlotId();
        const slot: RefSlot<ProductAnalysis> = { id, base64, preview, analysis: null, isAnalyzing: false };
        setProductSlots((prev) => [...prev, slot]);
      }
    } else if (category === "mood") {
      const file = files[0];
      const { base64, preview } = await resizeImageFile(file);
      const id = makeSlotId();
      const slot: RefSlot<MoodAnalysis> = { id, base64, preview, analysis: null, isAnalyzing: false };
      setMoodSlot(slot);
    } else {
      const remaining = MODEL_LIMIT - modelSlots.length;
      const batch = files.slice(0, remaining);
      for (const file of batch) {
        const { base64, preview } = await resizeImageFile(file);
        const id = makeSlotId();
        const slot: RefSlot<ModelAnalysis> = { id, base64, preview, analysis: null, isAnalyzing: false };
        setModelSlots((prev) => [...prev, slot]);
      }
    }
  }

  async function addFromGuideImage(category: RefCategory, guideImage: GuideImage) {
    try {
      const res = await fetch(guideImage.imageUrl);
      const blob = await res.blob();
      const file = new File([blob], guideImage.fileName, { type: blob.type });
      const { base64, preview } = await resizeImageFile(file);
      const id = makeSlotId();

      if (category === "product") {
        if (productSlots.length >= PRODUCT_LIMIT) return;
        const slot: RefSlot<ProductAnalysis> = {
          id,
          guideImageId: guideImage.id,
          imageUrl: guideImage.imageUrl,
          base64,
          preview,
          analysis: null,
          isAnalyzing: false,
        };
        setProductSlots((prev) => [...prev, slot]);
      } else if (category === "mood") {
        const slot: RefSlot<MoodAnalysis> = {
          id,
          guideImageId: guideImage.id,
          imageUrl: guideImage.imageUrl,
          base64,
          preview,
          analysis: null,
          isAnalyzing: false,
        };
        setMoodSlot(slot);
      } else {
        if (modelSlots.length >= MODEL_LIMIT) return;
        const slot: RefSlot<ModelAnalysis> = {
          id,
          guideImageId: guideImage.id,
          imageUrl: guideImage.imageUrl,
          base64,
          preview,
          analysis: null,
          isAnalyzing: false,
        };
        setModelSlots((prev) => [...prev, slot]);
      }
    } catch {
      toast({ variant: "destructive", title: "이미지 불러오기에 실패했습니다." });
    }
  }

  async function saveSlotToLibrary(category: RefCategory, slotIndex: number, name: string) {
    let imageBase64: string | undefined;
    if (category === "product") {
      imageBase64 = productSlots[slotIndex]?.base64;
    } else if (category === "mood") {
      imageBase64 = moodSlot?.base64;
    } else {
      imageBase64 = modelSlots[slotIndex]?.base64;
    }
    if (!imageBase64) return;

    const result = await createGuideImageMutation.mutateAsync({
      data: { type: category, imageBase64, name },
    });

    queryClient.invalidateQueries({ queryKey: getListGuideImagesQueryKey({ type: category }) });

    if (category === "product") {
      setProductSlots((prev) =>
        prev.map((s, i) => (i === slotIndex ? { ...s, guideImageId: result.id } : s))
      );
    } else if (category === "mood") {
      setMoodSlot((prev) => (prev ? { ...prev, guideImageId: result.id } : prev));
    } else {
      setModelSlots((prev) =>
        prev.map((s, i) => (i === slotIndex ? { ...s, guideImageId: result.id } : s))
      );
    }

    toast({ title: "라이브러리에 저장되었습니다." });
  }

  const handleProductFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await addFiles("product", files);
    if (productInputRef.current) productInputRef.current.value = "";
  };
  const handleMoodFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await addFiles("mood", files);
    if (moodInputRef.current) moodInputRef.current.value = "";
  };
  const handleModelFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await addFiles("model", files);
    if (modelInputRef.current) modelInputRef.current.value = "";
  };

  async function handleWorkingImageUpload(file: File) {
    const filtered = filterImageFiles([file]);
    if (filtered.length === 0) return;
    const { base64 } = await resizeImageFile(filtered[0]);
    setWorkingImage({ base64 });
    setWorkingImageSource("uploaded");
    setSelectedVariationIdx(null);
    setIterationParentId(null);
    setIterationParentLabel(null);
    setIterationSourceBase64(null);
    setMaskingOpen(true);
    if (workingUploadInputRef.current) workingUploadInputRef.current.value = "";
  }

  useEffect(() => {
    const handler = async (e: ClipboardEvent) => {
      if (e.defaultPrevented) return;
      if (libraryModalRef.current.open) return;
      if (!e.clipboardData) return;
      const imageFile = Array.from(e.clipboardData.items)
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .find((f): f is File => f !== null);
      if (!imageFile) return;
      e.preventDefault();

      const sidebarFocused = sidebarDivRef.current?.contains(document.activeElement) ?? false;
      if ((isSidebarHoveredRef.current || sidebarFocused) && sidebarUploadRef.current) {
        toast({ title: "업로드 중..." });
        try {
          await sidebarUploadRef.current(imageFile);
        } catch {
          toast({ variant: "destructive", title: "가이드 이미지 업로드에 실패했습니다." });
        }
        return;
      }

      const { productSlots, moodSlot, modelSlots } = refSlotsRef.current;
      let category: RefCategory;
      let slotLabel: string;
      if (productSlots.length < PRODUCT_LIMIT) {
        category = "product";
        slotLabel = "제품";
      } else if (!moodSlot) {
        category = "mood";
        slotLabel = "무드";
      } else if (modelSlots.length < MODEL_LIMIT) {
        category = "model";
        slotLabel = "모델";
      } else {
        if (!workingImageRef.current) {
          toast({ title: "업로드 중..." });
          try {
            await handleWorkingImageUploadRef.current(imageFile);
            toast({ title: "워킹 이미지로 업로드되었습니다." });
          } catch {
            toast({ variant: "destructive", title: "이미지 업로드에 실패했습니다." });
          }
        } else {
          toast({ title: "모든 레퍼런스 슬롯이 가득 찼습니다." });
        }
        return;
      }
      toast({ title: "업로드 중..." });
      try {
        await addFilesRef.current(category, [imageFile]);
        toast({ title: `${slotLabel} 슬롯에 이미지가 추가되었습니다.` });
      } catch {
        toast({ variant: "destructive", title: "이미지 추가에 실패했습니다." });
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const dx = resizeStartRef.current.x - e.clientX;
      const newWidth = Math.min(600, Math.max(200, resizeStartRef.current.startWidth + dx));
      setRightPanelWidth(newWidth);
    };
    const onMouseUp = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 300) + "px";
  };

  useEffect(() => {
    autoResize();
  }, [prompt]);

  const removeProductSlot = (index: number) =>
    setProductSlots((prev) => prev.filter((_, i) => i !== index));
  const removeMoodSlot = () => setMoodSlot(null);
  const removeModelSlot = (index: number) =>
    setModelSlots((prev) => prev.filter((_, i) => i !== index));

  const updateProductDimension = (index: number, dim: { w?: number; d?: number; h?: number }) => {
    setProductSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, dimensions: { ...s.dimensions, ...dim } } : s))
    );
  };

  const updateModelDimension = (index: number, dim: { height?: number; age?: number }) => {
    setModelSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, modelDimensions: { ...s.modelDimensions, ...dim } } : s))
    );
  };

  const assembledPreviewParts = useMemo(() => {
    const parts: { label: string; text: string }[] = [];

    if (prompt.trim()) {
      parts.push({ label: "프롬프트", text: prompt });
    }

    productSlots.forEach((s, i) => {
      const base = s.analysis ? productAnalysisToText(s.analysis) : "";
      const d = s.dimensions;
      let text = base;
      if (d && (d.w != null || d.d != null || d.h != null)) {
        const dimParts = [
          d.w != null ? `W${d.w}` : null,
          d.d != null ? `D${d.d}` : null,
          d.h != null ? `H${d.h}` : null,
        ].filter(Boolean);
        const dimText = `Product #${i + 1} dimensions: ${dimParts.join("×")}mm`;
        text = base ? `${base}. ${dimText}` : dimText;
      }
      if (text) {
        parts.push({ label: `제품 레퍼런스 #${i + 1}`, text });
      }
    });

    if (moodSlot?.analysis) {
      parts.push({ label: "무드 레퍼런스", text: moodAnalysisToText(moodSlot.analysis) });
    }

    modelSlots.forEach((s, i) => {
      const base = s.analysis ? modelAnalysisToText(s.analysis) : "";
      const md = s.modelDimensions;
      let text = base;
      if (md && (md.height != null || md.age != null)) {
        const mdParts = [
          md.age != null ? `age ${md.age} years` : null,
          md.height != null ? `height approx. ${md.height}mm` : null,
        ].filter(Boolean);
        const dimText = `Model #${i + 1}: ${mdParts.join(", ")}`;
        text = base ? `${base}. ${dimText}` : dimText;
      }
      if (text) {
        parts.push({ label: `모델 레퍼런스 #${i + 1}`, text });
      }
    });

    return parts;
  }, [prompt, productSlots, moodSlot, modelSlots]);

  async function runPendingAnalysis(): Promise<{
    products: RefSlot<ProductAnalysis>[];
    mood: RefSlot<MoodAnalysis> | null;
    models: RefSlot<ModelAnalysis>[];
  }> {
    const pendingProduct = productSlots.filter((s) => !s.analysis && !s.isAnalyzing);
    const pendingMood = moodSlot && !moodSlot.analysis && !moodSlot.isAnalyzing ? moodSlot : null;
    const pendingModel = modelSlots.filter((s) => !s.analysis && !s.isAnalyzing);

    if (pendingProduct.length) {
      setProductSlots((prev) =>
        prev.map((s) => (pendingProduct.find((p) => p.id === s.id) ? { ...s, isAnalyzing: true } : s))
      );
    }
    if (pendingMood) {
      setMoodSlot((prev) => (prev ? { ...prev, isAnalyzing: true } : prev));
    }
    if (pendingModel.length) {
      setModelSlots((prev) =>
        prev.map((s) => (pendingModel.find((p) => p.id === s.id) ? { ...s, isAnalyzing: true } : s))
      );
    }

    const productResults = new Map<string, ProductAnalysis | null>();
    const modelResultsMap = new Map<string, ModelAnalysis | null>();
    let moodResult: MoodAnalysis | null = moodSlot?.analysis ?? null;

    await Promise.all(
      [
        ...pendingProduct.map((s) =>
          analyzeProductRef({ image: s.base64 })
            .then((analysis: ProductAnalysis) => {
              productResults.set(s.id, analysis);
              setProductSlots((prev) =>
                prev.map((p) => (p.id === s.id ? { ...p, analysis, isAnalyzing: false } : p))
              );
            })
            .catch((err: { message?: string }) => {
              productResults.set(s.id, null);
              setProductSlots((prev) =>
                prev.map((p) =>
                  p.id === s.id ? { ...p, isAnalyzing: false, error: err?.message || "분석 실패" } : p
                )
              );
            })
        ),
        pendingMood &&
          analyzeMoodRef({ image: pendingMood.base64 })
            .then((analysis: MoodAnalysis) => {
              moodResult = analysis;
              setMoodSlot((prev) =>
                prev?.id === pendingMood.id ? { ...prev, analysis, isAnalyzing: false } : prev
              );
            })
            .catch((err: { message?: string }) => {
              setMoodSlot((prev) =>
                prev?.id === pendingMood.id
                  ? { ...prev, isAnalyzing: false, error: err?.message || "분석 실패" }
                  : prev
              );
            }),
        ...pendingModel.map((s) =>
          analyzeModelRef({ image: s.base64 })
            .then((analysis: ModelAnalysis) => {
              modelResultsMap.set(s.id, analysis);
              setModelSlots((prev) =>
                prev.map((m) => (m.id === s.id ? { ...m, analysis, isAnalyzing: false } : m))
              );
            })
            .catch((err: { message?: string }) => {
              modelResultsMap.set(s.id, null);
              setModelSlots((prev) =>
                prev.map((m) =>
                  m.id === s.id ? { ...m, isAnalyzing: false, error: err?.message || "분석 실패" } : m
                )
              );
            })
        ),
      ].filter(Boolean)
    );

    const finalProducts = productSlots.map((s) =>
      productResults.has(s.id)
        ? { ...s, analysis: productResults.get(s.id) ?? s.analysis, isAnalyzing: false }
        : s
    );
    const finalMood = moodSlot
      ? pendingMood
        ? { ...moodSlot, analysis: moodResult, isAnalyzing: false }
        : moodSlot
      : null;
    const finalModels = modelSlots.map((s) =>
      modelResultsMap.has(s.id)
        ? { ...s, analysis: modelResultsMap.get(s.id) ?? s.analysis, isAnalyzing: false }
        : s
    );

    return { products: finalProducts, mood: finalMood, models: finalModels };
  }

  function buildGeneratePayload(
    slots: RefSlot<ProductAnalysis>[],
    mood: RefSlot<MoodAnalysis> | null,
    models: RefSlot<ModelAnalysis>[]
  ) {
    const productAnalyses = slots
      .map((s, i) => {
        const base = s.analysis ? productAnalysisToText(s.analysis) : "";
        const d = s.dimensions;
        if (d && (d.w != null || d.d != null || d.h != null)) {
          const parts = [
            d.w != null ? `W${d.w}` : null,
            d.d != null ? `D${d.d}` : null,
            d.h != null ? `H${d.h}` : null,
          ].filter(Boolean);
          const dimText = `Product #${i + 1} dimensions: ${parts.join("×")}mm`;
          return base ? `${base}. ${dimText}` : dimText;
        }
        return base;
      })
      .filter((t) => t.length > 0);

    const moodAnalysisText = mood?.analysis ? moodAnalysisToText(mood.analysis) : undefined;

    const modelAnalyses = models
      .map((s, i) => {
        const base = s.analysis ? modelAnalysisToText(s.analysis) : "";
        const md = s.modelDimensions;
        if (md && (md.height != null || md.age != null)) {
          const parts = [
            md.age != null ? `age ${md.age} years` : null,
            md.height != null ? `height approx. ${md.height}mm` : null,
          ].filter(Boolean);
          const dimText = `Model #${i + 1}: ${parts.join(", ")}`;
          return base ? `${base}. ${dimText}` : dimText;
        }
        return base;
      })
      .filter((t) => t.length > 0);

    const allReferenceImages: string[] = [
      ...slots.map((s) => s.base64),
      ...(mood ? [mood.base64] : []),
      ...models.map((s) => s.base64),
    ];

    return {
      prompt,
      tag: "general" as const,
      referenceImages: allReferenceImages.length > 0 ? allReferenceImages : undefined,
      productAnalyses: productAnalyses.length > 0 ? productAnalyses : undefined,
      moodAnalysis: moodAnalysisText,
      modelAnalyses: modelAnalyses.length > 0 ? modelAnalyses : undefined,
    };
  }

  const handleGenerate = async () => {
    const hasPending =
      productSlots.some((s) => !s.analysis) ||
      (moodSlot && !moodSlot.analysis) ||
      modelSlots.some((s) => !s.analysis);

    let currentProducts = productSlots;
    let currentMood = moodSlot;
    let currentModels = modelSlots;

    if (hasPending) {
      setIsRunningAnalysis(true);
      try {
        const result = await runPendingAnalysis();
        currentProducts = result.products;
        currentMood = result.mood;
        currentModels = result.models;
      } finally {
        setIsRunningAnalysis(false);
      }
    }

    const payload = buildGeneratePayload(currentProducts, currentMood, currentModels);

    setVarCardStates([{ status: "loading", imageBase64: null, error: null, generationBadge: "첫 생성" }]);
    setSelectedVariationIdx(null);
    setVariationGroupId(null);
    setWorkingImageId(null);
    setWorkingImageUrl(null);
    setWorkingImage(null);
    setWorkingImageSource(null);
    setIterationParentId(null);
    setIterationParentLabel(null);
    setIterationSourceBase64(null);
    setMaskingOpen(false);
    setRefineInputOpen(false);
    setRefineTip("");
    maskingCanvasRef.current?.reset();
    setIsGenerating(true);

    try {
      const data = await generateGeminiImage(payload);
      const newCard: VarCardState = {
        status: "done",
        imageBase64: data.imageBase64,
        error: null,
        createdAt: new Date().toISOString(),
        userPromptExpanded: data.userPromptExpanded,
        rejected: data.qualityGatePassed === false,
        rejectionReason: data.qualityGatePassed === false ? "품질 검사 실패" : undefined,
        generationBadge: "첫 생성",
      };
      setVarCardStates([newCard]);
      if (!newCard.rejected && data.imageBase64) {
        setWorkingImage({ base64: data.imageBase64 });
        setWorkingImageSource("generated");
        setSelectedVariationIdx(1);
      }
    } catch (err: any) {
      setVarCardStates([{ status: "error", imageBase64: null, error: err?.message || "생성 실패", generationBadge: "첫 생성" }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFinetune = async () => {
    if (!workingImage || !refineTip.trim()) return;

    const parentIdx = selectedVariationIdx !== null ? selectedVariationIdx - 1 : varCardStates.length - 1;
    const basePayload = buildGeneratePayload(productSlots, moodSlot, modelSlots);
    const payload = { ...basePayload, prompt: refineTip, iterationBaseImage: workingImage.base64 };

    const newCardIdx = varCardStates.length + 1;
    setVarCardStates((prev) => [...prev, { status: "loading", imageBase64: null, error: null, parentIdx, generationBadge: "수정" as const }]);
    setWorkingImage(null);
    setWorkingImageSource(null);
    setSelectedVariationIdx(null);
    setIsRefining(true);

    try {
      const data = await generateGeminiImage(payload);
      const doneCard: VarCardState = {
        status: "done",
        imageBase64: data.imageBase64,
        error: null,
        createdAt: new Date().toISOString(),
        userPromptExpanded: data.userPromptExpanded,
        rejected: data.qualityGatePassed === false,
        rejectionReason: data.qualityGatePassed === false ? "품질 검사 실패" : undefined,
        parentIdx,
        generationBadge: "수정",
      };
      setVarCardStates((prev) => [...prev.slice(0, -1), doneCard]);
      if (!doneCard.rejected && data.imageBase64) {
        setWorkingImage({ base64: data.imageBase64 });
        setWorkingImageSource("generated");
        setSelectedVariationIdx(newCardIdx);
      }
      setRefineTip("");
      setRefineInputOpen(false);
    } catch (err: any) {
      setVarCardStates((prev) => [
        ...prev.slice(0, -1),
        { status: "error", imageBase64: null, error: err?.message || "수정 실패", parentIdx, generationBadge: "수정" as const },
      ]);
      toast({ variant: "destructive", title: "수정 생성 실패", description: err?.message || "다시 시도해주세요." });
    } finally {
      setIsRefining(false);
    }
  };

  const handleNewDirection = () => {
    setWorkingImage(null);
    setWorkingImageSource(null);
    setSelectedVariationIdx(null);
    setRefineInputOpen(false);
    setRefineTip("");
    setIterationParentId(null);
    setIterationParentLabel(null);
    setIterationSourceBase64(null);
    setMaskingOpen(false);
    setVarCardStates([]);
    setVariationGroupId(null);
    maskingCanvasRef.current?.reset();
  };

  const handleInpaint = async () => {
    if (!workingImage || !maskPrompt.trim()) return;
    const maskDataURL = maskingCanvasRef.current?.getMaskDataURL();
    if (!maskDataURL) return;

    setIsInpainting(true);
    try {
      const composited = await compositeImageWithMask(workingImage.base64, maskDataURL);
      const inpaintPrompt = `${maskPrompt.trim()}. 빨간색으로 표시된 영역만 수정하고 나머지는 그대로 유지해주세요.`;

      const slotPayload = buildGeneratePayload(productSlots, moodSlot, modelSlots);
      const slotImages = slotPayload.referenceImages ?? [];
      const mergedReferenceImages = [
        workingImage.base64,
        composited,
        ...slotImages.slice(0, 4),
      ];

      const data = await generateGeminiImage({
        prompt: inpaintPrompt,
        tag: GenerateImageBodyTag.general,
        referenceImages: mergedReferenceImages,
        productAnalyses: slotPayload.productAnalyses,
        moodAnalysis: slotPayload.moodAnalysis,
        modelAnalyses: slotPayload.modelAnalyses,
        parentId: workingImageId ?? undefined,
        isInpainting: true,
      });

      const parentIdx = selectedVariationIdx !== null ? selectedVariationIdx - 1 : undefined;
      setVarCardStates((prev) => {
        const updated = [...prev, { status: "done" as const, imageBase64: data.imageBase64, error: null, parentIdx, createdAt: new Date().toISOString(), userPromptExpanded: data.userPromptExpanded }];
        setSelectedVariationIdx(updated.length);
        return updated;
      });
      setMaskingOpen(false);
      maskingCanvasRef.current?.reset();
      setMaskPrompt("");
    } catch (err) {
      console.error("Inpaint failed:", err);
      toast({ variant: "destructive", title: "수정 이미지 생성에 실패했습니다.", description: (err as any)?.message || "다시 시도해주세요." });
    } finally {
      setIsInpainting(false);
    }
  };

  const handleCameraTransform = async () => {
    if (!workingImage) return;
    if (!transformAngle && !transformLens && !transformDepth && !transformColor) return;

    setIsTransforming(true);
    setTransformStep("analyzing");

    // Switch label to "generating" after ~4 s — analysis typically finishes then.
    const stepTimer = setTimeout(() => setTransformStep("generating"), 4000);

    try {
      const res = await fetch("/api/images/camera-transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: workingImage.base64,
          ...(transformAngle ? { angle: transformAngle } : {}),
          ...(transformLens ? { lens: transformLens } : {}),
          ...(transformDepth ? { depth: transformDepth } : {}),
          ...(transformColor ? { color: transformColor } : {}),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `서버 오류 ${res.status}`);
      }

      const data = await res.json();
      const resultBase64: string = data.imageBase64;

      if (!resultBase64) throw new Error("이미지 데이터가 없습니다.");

      setVarCardStates((prev) => [
        ...prev,
        { status: "done" as const, imageBase64: resultBase64, error: null, createdAt: new Date().toISOString() },
      ]);
      setSelectedVariationIdx(null);
      setWorkingImage({ base64: resultBase64 });
      setWorkingImageSource("generated");
      setIterationParentId(null);
      setIterationParentLabel(null);
      setIterationSourceBase64(null);
    } catch (err: any) {
      console.error("Camera transform failed:", err);
      toast({ variant: "destructive", title: "변환에 실패했습니다.", description: err?.message || "다시 시도해주세요." });
    } finally {
      clearTimeout(stepTimer);
      setIsTransforming(false);
      setTransformStep(null);
    }
  };

  const handleSaveImage = (imageBase64?: string) => {
    const img = imageBase64 ?? workingImage?.base64;
    if (!img || !taskId) return;

    saveMutation.mutate(
      {
        data: {
          taskId,
          tag: "general",
          imageBase64: img,
          prompt,
          model: "gemini-3.1-flash-image",
          ...(iterationParentId != null ? { parentId: iterationParentId } : {}),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListImagesQueryKey() });
        },
      }
    );
  };

  const handleSaveAllVariations = () => {
    if (!varCardStates.length || !taskId) return;
    for (const card of varCardStates) {
      if (card.imageBase64) {
        handleSaveImage(card.imageBase64);
      }
    }
  };

  const handleDownloadImage = () => {
    if (!workingImage) return;
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${workingImage.base64}`;
    a.download = `task${taskId}_${Date.now()}.png`;
    a.click();
  };

  const handleDownload4K = async () => {
    if (!workingImage || is4KDownloading) return;
    setIs4KDownloading(true);
    try {
      const data = await generateGeminiImage({
        prompt: "",
        imageSize: "4K",
        iterationBaseImage: workingImage.base64,
        preExpandedUserPrompt:
          "Reproduce this image exactly as shown. Maintain every visual detail — composition, colors, lighting, shadows, textures, and subject matter — with maximum fidelity. This is a high-resolution 4K reproduction of the provided image.",
      });
      if (data.imageBase64) {
        const a = document.createElement("a");
        a.href = `data:image/png;base64,${data.imageBase64}`;
        a.download = `task${taskId}_4K_${Date.now()}.png`;
        a.click();
      }
    } catch (err: any) {
      toast({ title: "4K 다운로드 실패", description: err?.message || "오류가 발생했습니다.", variant: "destructive" });
    } finally {
      setIs4KDownloading(false);
    }
  };

  const handleToggleStatus = (imageId: number, currentStatus: string) => {
    const newStatus = currentStatus === "draft" ? "approved" : "draft";
    updateMutation.mutate(
      { id: imageId, data: { status: newStatus as any } },
      { onSuccess: () => refetchImages() }
    );
  };

  const handleDeleteImage = (imageId: number) => {
    if (confirm("이미지를 삭제하시겠습니까?")) {
      deleteMutation.mutate(
        { id: imageId },
        {
          onSuccess: () => {
            if (workingImageId === imageId) {
              setWorkingImageId(null);
              setWorkingImageUrl(null);
            }
            if (workingImage?.dbId === imageId) {
              setWorkingImage(null);
            }
            refetchImages();
          },
        }
      );
    }
  };

  const totalReferenceCount = productSlots.length + (moodSlot ? 1 : 0) + modelSlots.length;

  if (!taskId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[#9ca3af]">잘못된 테스크 ID입니다.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] text-[#e8e8e8]">
      {/* ── Top Bar ── */}
      <header className="h-14 flex-none border-b border-[#3a3a3a] bg-[#252525] flex items-center justify-between px-4 z-30">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex items-center shrink-0">
            <img
              src="/luna-story-logo.png"
              alt="LUNA STORY"
              className="h-5 w-auto"
              style={{ filter: "brightness(0) invert(1)" }}
            />
          </div>
          <div className="h-5 w-px bg-[#3a3a3a] shrink-0" />
          <div className="min-w-0 flex-1">
            <TaskHeader taskId={taskId} />
          </div>
        </div>

        <div className="flex items-center gap-2 ml-4 shrink-0">
          {workingImage && (
            <>
              <button
                onClick={() => handleSaveImage()}
                disabled={saveMutation.isPending || !taskId}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#333] hover:bg-[#444] border border-[#3a3a3a] rounded text-[#e8e8e8] transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                저장
              </button>
              <button
                onClick={handleDownloadImage}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#4a9cf6] hover:bg-[#3b82f6] text-white rounded transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                다운로드
              </button>
              <button
                onClick={handleDownload4K}
                disabled={is4KDownloading}
                title="현재 이미지를 기반으로 4K 고해상도 이미지를 생성 후 다운로드합니다. 시간이 소요됩니다."
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-amber-500/60 text-amber-400 hover:bg-amber-500/10 rounded transition-colors disabled:opacity-50"
              >
                {is4KDownloading ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" />
                )}
                {is4KDownloading ? "4K 생성 중..." : "4K 다운"}
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── 3-Panel Main Layout ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar ── */}
        <div
          ref={sidebarDivRef}
          onMouseEnter={() => { isSidebarHoveredRef.current = true; }}
          onMouseLeave={() => { isSidebarHoveredRef.current = false; }}
        >
          <LeftSidebar
            activeTaskId={taskId}
            onSelectGuideImage={(type, image) => addFromGuideImage(type, image)}
            uploadRef={sidebarUploadRef}
          />
        </div>

        {/* ── Center Workspace ── */}
        <main className="flex-1 overflow-y-auto bg-[#1e1e1e] p-5 space-y-5 min-w-0">
          {/* Reference Image Slots */}
          <section className="bg-[#252525] border border-[#3a3a3a] rounded-lg p-4">
            <h3 className="text-sm font-medium text-[#9ca3af] mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#4a9cf6]" />
              레퍼런스 이미지 슬롯
              <span className="text-[11px] text-[#9ca3af] ml-auto font-normal">
                {totalReferenceCount}개 사용 중
              </span>
            </h3>
            <div className="space-y-3">
              <div>
                <ProductReferenceCard
                  slots={productSlots}
                  limit={PRODUCT_LIMIT}
                  inputRef={productInputRef}
                  onChange={handleProductFiles}
                  onRemove={removeProductSlot}
                  onDrop={(files) => addFiles("product", files)}
                  onDimensionChange={updateProductDimension}
                  onSaveToLibrary={(i, name) => saveSlotToLibrary("product", i, name)}
                />
                <button
                  onClick={() => setLibraryModal({ open: true, category: "product" })}
                  className="mt-2 w-full text-xs text-[#9ca3af] hover:text-[#4a9cf6] border border-dashed border-[#3a3a3a] hover:border-[#4a9cf6]/40 rounded-lg py-1.5 transition-colors"
                >
                  라이브러리에서 제품 이미지 불러오기
                </button>
              </div>

              <div>
                <MoodReferenceCard
                  slot={moodSlot}
                  inputRef={moodInputRef}
                  onChange={handleMoodFile}
                  onRemove={removeMoodSlot}
                  onDrop={(fs) => addFiles("mood", fs)}
                  onSaveToLibrary={(name) => saveSlotToLibrary("mood", 0, name)}
                />
                <button
                  onClick={() => setLibraryModal({ open: true, category: "mood" })}
                  className="mt-2 w-full text-xs text-[#9ca3af] hover:text-[#4a9cf6] border border-dashed border-[#3a3a3a] hover:border-[#4a9cf6]/40 rounded-lg py-1.5 transition-colors"
                >
                  라이브러리에서 무드 이미지 불러오기
                </button>
              </div>

              <div>
                <ModelReferenceCard
                  slots={modelSlots}
                  limit={MODEL_LIMIT}
                  inputRef={modelInputRef}
                  onChange={handleModelFiles}
                  onRemove={removeModelSlot}
                  onDrop={(fs) => addFiles("model", fs)}
                  onModelDimensionChange={updateModelDimension}
                  onSaveToLibrary={(i, name) => saveSlotToLibrary("model", i, name)}
                />
                <button
                  onClick={() => setLibraryModal({ open: true, category: "model" })}
                  className="mt-2 w-full text-xs text-[#9ca3af] hover:text-[#4a9cf6] border border-dashed border-[#3a3a3a] hover:border-[#4a9cf6]/40 rounded-lg py-1.5 transition-colors"
                >
                  라이브러리에서 모델 이미지 불러오기
                </button>
              </div>
            </div>
          </section>

          {/* Selected Image Preview */}
          <section className="bg-[#252525] border border-[#3a3a3a] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-medium text-[#e8e8e8]">
                    {workingImage && workingImageSource === "uploaded"
                      ? "업로드된 원본"
                      : workingImage
                      ? `선택된 이미지${selectedVariationIdx ? ` — V${selectedVariationIdx}` : ""}`
                      : workingImageUrl
                      ? "선택된 이미지"
                      : "워킹 이미지"}
                  </h3>
                  {workingImage && iterationParentLabel && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[#22c55e]/15 text-[#4ade80] border border-[#22c55e]/30 font-medium">
                      <RefreshCw className="w-2.5 h-2.5" />
                      {iterationParentLabel} 기준
                    </span>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {workingImage && (
                    <>
                      <button
                        onClick={() => handleSaveImage()}
                        disabled={saveMutation.isPending || !taskId}
                        className="text-xs px-3 py-1.5 bg-[#4a9cf6] hover:bg-[#3b82f6] text-white rounded disabled:opacity-50 font-medium transition-colors"
                      >
                        {saveMutation.isPending ? "저장 중..." : "라이브러리에 저장"}
                      </button>
                      <button
                        onClick={handleDownloadImage}
                        className="text-xs px-3 py-1.5 border border-[#3a3a3a] rounded hover:bg-[#333] font-medium transition-colors text-[#e8e8e8]"
                      >
                        다운로드
                      </button>
                      <button
                        onClick={handleDownload4K}
                        disabled={is4KDownloading}
                        title="현재 이미지를 기반으로 4K 고해상도 이미지를 생성 후 다운로드합니다. 시간이 소요됩니다."
                        className="text-xs px-3 py-1.5 border border-amber-500/60 text-amber-400 rounded hover:bg-amber-500/10 font-medium transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        {is4KDownloading ? (
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                        ) : (
                          <AlertTriangle className="w-3 h-3" />
                        )}
                        {is4KDownloading ? "4K 생성 중..." : "4K 다운"}
                      </button>
                    </>
                  )}
                  {workingImageUrl && !workingImage && (
                    <>
                      <a
                        href={workingImageUrl}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-3 py-1.5 border border-[#3a3a3a] rounded hover:bg-[#333] inline-block font-medium text-[#e8e8e8]"
                      >
                        다운로드
                      </a>
                      <button
                        onClick={handleDownload4K}
                        className="text-xs px-3 py-1.5 border border-[#7c3aed] text-[#a78bfa] rounded hover:bg-[#7c3aed]/10 font-medium transition-colors"
                      >
                        4K 다운
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="bg-[#1e1e1e] rounded-lg overflow-hidden aspect-square max-h-[500px] w-full">
                {isInpainting ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3 py-20">
                    <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    <div className="text-sm text-[#9ca3af] animate-pulse">수정 이미지 생성 중...</div>
                  </div>
                ) : workingImage ? (
                  <ZoomableImage
                    src={`data:image/png;base64,${workingImage.base64}`}
                    alt="Selected variation"
                    resetKey={workingImage.base64.slice(0, 32)}
                  />
                ) : workingImageUrl ? (
                  <ZoomableImage
                    src={workingImageUrl}
                    alt="히스토리에서 불러온 이미지"
                    resetKey={workingImageUrl}
                  />
                ) : (
                  <div
                    className="w-full h-full flex flex-col items-center justify-center gap-3 cursor-pointer group border-2 border-dashed border-[#3a3a3a] hover:border-[#4a9cf6]/50 rounded-lg transition-colors"
                    onClick={() => workingUploadInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
                      if (file) await handleWorkingImageUpload(file);
                    }}
                  >
                    <div className="w-14 h-14 rounded-full bg-[#333] group-hover:bg-[#3a3a3a] flex items-center justify-center transition-colors">
                      <ImageIcon className="w-6 h-6 text-[#9ca3af] group-hover:text-[#4a9cf6] transition-colors" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-[#9ca3af] group-hover:text-[#e8e8e8] transition-colors">이미지를 직접 업로드</p>
                      <p className="text-xs text-[#6b7280] mt-1">클릭 · 드래그앤드롭 · Ctrl+V</p>
                    </div>
                    <input
                      ref={workingUploadInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) await handleWorkingImageUpload(file);
                      }}
                    />
                  </div>
                )}
              </div>

              {/* AI Expanded Prompt display */}
              {(() => {
                const selectedCard = selectedVariationIdx !== null ? varCardStates[selectedVariationIdx - 1] : null;
                if (!selectedCard?.userPromptExpanded) return null;
                const expanded = selectedCard.userPromptExpanded;
                const preview = expanded.length > 80 ? expanded.slice(0, 80) + "…" : expanded;
                return (
                  <details className="mt-2 group">
                    <summary className="text-xs text-[#6b7280] cursor-pointer hover:text-[#9ca3af] select-none list-none flex items-start gap-1.5">
                      <span className="shrink-0 text-[#4a9cf6]">AI가 이렇게 이해했어요:</span>
                      <span className="truncate text-[#9ca3af] group-open:hidden">{preview}</span>
                      <span className="shrink-0 text-[#4a6080] group-open:hidden">▾</span>
                    </summary>
                    <div className="mt-1 text-xs text-[#9ca3af] bg-[#1e1e1e] border border-[#3a3a3a] rounded p-2 leading-relaxed whitespace-pre-wrap">
                      {expanded}
                    </div>
                  </details>
                );
              })()}

              {/* 살짝 수정 / 새로 생성 action area */}
              {workingImage && !isGenerating && !isRefining && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-start gap-2 px-3 py-2.5 bg-[#1a2535] border border-[#2a3a50] rounded-lg">
                    <span className="text-[#4a9cf6] text-sm shrink-0 mt-0.5">💡</span>
                    <p className="text-[11px] text-[#9ca3af] leading-relaxed">
                      결과가 마음에 드시나요?{" "}
                      <strong className="text-[#c8d8e8]">살짝 수정</strong>은 현재 이미지를 그대로 두고 원하는 부분만 조금 바꿔드려요.{" "}
                      <strong className="text-[#c8d8e8]">새로 생성</strong>은 처음부터 다시 시작합니다.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRefineInputOpen((v) => !v)}
                      className={`flex-1 py-2 text-xs font-medium rounded-lg border flex items-center justify-center gap-1.5 transition-colors ${
                        refineInputOpen
                          ? "bg-[#4a9cf6]/15 border-[#4a9cf6] text-[#4a9cf6]"
                          : "bg-[#1e1e1e] border-[#3a3a3a] text-[#e8e8e8] hover:border-[#4a9cf6]/60"
                      }`}
                    >
                      🔧 살짝 수정
                    </button>
                    <button
                      onClick={handleNewDirection}
                      className="flex-1 py-2 text-xs font-medium rounded-lg border bg-[#1e1e1e] border-[#3a3a3a] text-[#e8e8e8] hover:border-[#9ca3af] flex items-center justify-center gap-1.5 transition-colors"
                    >
                      🔄 새로 생성
                    </button>
                  </div>

                  {refineInputOpen && (
                    <div className="space-y-2.5 p-3 bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg">
                      <div className="flex items-start gap-1.5">
                        <span className="text-[#4a9cf6] text-xs shrink-0">ℹ</span>
                        <p className="text-[10px] text-[#6b7280] leading-relaxed">
                          현재 이미지를 기반으로 원하는 부분만 바꿔드려요. 마스킹 없이 가볍게 수정하기 좋아요.
                          색상, 조명, 배경 분위기 등 작은 변화에 적합합니다. 크게 방향을 바꾸려면{" "}
                          <strong className="text-[#9ca3af]">새로 생성</strong>을 사용하세요.
                        </p>
                      </div>
                      <textarea
                        value={refineTip}
                        onChange={(e) => setRefineTip(e.target.value)}
                        placeholder="어떤 부분을 바꿀까요? (예: 물 색깔을 하늘색으로, 배경을 흰색 스튜디오로)"
                        className="w-full p-2.5 bg-[#252525] border border-[#3a3a3a] rounded-lg text-sm text-[#e8e8e8] placeholder-[#6b7280] focus:outline-none focus:border-[#4a9cf6] resize-none transition-colors"
                        rows={3}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleFinetune();
                        }}
                      />
                      <button
                        onClick={handleFinetune}
                        disabled={isRefining || !refineTip.trim()}
                        className="w-full py-2 bg-[#4a9cf6] hover:bg-[#3b82f6] text-white font-medium rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                      >
                        {isRefining ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            수정 중...
                          </>
                        ) : (
                          "적용하기  ↵ Ctrl+Enter"
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {isRefining && (
                <div className="mt-4 flex items-center justify-center gap-3 py-4">
                  <div className="w-5 h-5 border-2 border-[#4a9cf6] border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-[#9ca3af] animate-pulse">수정 이미지 생성 중...</span>
                </div>
              )}
            </section>

          {/* Inpainting Panel */}
          <InpaintingPanel
            workingImage={workingImage}
            maskingOpen={maskingOpen}
            onToggleMasking={() => setMaskingOpen(!maskingOpen)}
            maskPrompt={maskPrompt}
            onMaskPromptChange={setMaskPrompt}
            maskingCanvasRef={maskingCanvasRef}
            isGenerating={isGenerating}
            isInpainting={isInpainting}
            onInpaint={handleInpaint}
          />

          {/* Saved Images Library */}
          {taskId && (
            <section className="bg-[#252525] border border-[#3a3a3a] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-[#e8e8e8]">이미지 라이브러리</h3>
                <select
                  className="text-xs bg-[#1e1e1e] border border-[#3a3a3a] rounded px-2 py-1 text-[#e8e8e8]"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="">모든 상태</option>
                  <option value="draft">초안 (Draft)</option>
                  <option value="approved">승인됨 (Approved)</option>
                </select>
              </div>

              {savedImages && savedImages.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-[#3a3a3a] rounded-lg">
                  <p className="text-sm text-[#9ca3af]">저장된 이미지가 없습니다.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {savedImages?.map((img) => (
                    <div key={img.id} className="relative group aspect-square bg-[#1e1e1e] rounded-lg overflow-hidden border border-[#3a3a3a]">
                      <img
                        src={img.imageUrl}
                        alt={img.prompt || "saved result"}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                        <div className="flex w-full gap-1">
                          <button
                            onClick={() => handleToggleStatus(img.id, img.status)}
                            className={`flex-1 py-1 rounded text-[10px] font-bold ${
                              img.status === "approved" ? "bg-green-500 text-white" : "bg-[#555] text-white"
                            }`}
                          >
                            {img.status === "approved" ? "승인됨" : "초안"}
                          </button>
                          <button
                            onClick={() => handleDeleteImage(img.id)}
                            className="flex-1 py-1 bg-red-600 text-white rounded text-[10px] font-bold"
                          >
                            삭제
                          </button>
                        </div>
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch(img.imageUrl);
                              const blob = await res.blob();
                              const file = new File([blob], "img.jpg", { type: blob.type });
                              const { base64 } = await resizeImageFile(file);
                              setVarCardStates((prev) => {
                                const updated = [...prev, { status: "done" as const, imageBase64: base64, error: null, createdAt: new Date().toISOString() }];
                                setSelectedVariationIdx(updated.length);
                                return updated;
                              });
                              setWorkingImage({ base64, dbId: img.id });
                              setWorkingImageSource("generated");
                              setWorkingImageId(img.id);
                              setIterationParentId(null);
                              setIterationParentLabel(null);
                              setIterationSourceBase64(null);
                              setMaskingOpen(true);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            } catch {
                              toast({ variant: "destructive", title: "이미지 불러오기 실패" });
                            }
                          }}
                          className="w-full text-[10px] py-1 bg-[#4a9cf6]/70 text-white rounded hover:bg-[#4a9cf6]/90"
                        >
                          작업 이미지로 선택
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </main>

        {/* ── Right Sidebar Resize Handle ── */}
        <div
          className="w-1 flex-none cursor-ew-resize hover:bg-[#4a9cf6]/50 transition-colors bg-[#3a3a3a]"
          onMouseDown={(e) => {
            isResizingRef.current = true;
            resizeStartRef.current = { x: e.clientX, startWidth: rightPanelWidth };
            document.body.style.userSelect = "none";
          }}
        />

        {/* ── Right Sidebar ── */}
        <aside
          className="flex-none border-l border-[#3a3a3a] bg-[#252525] flex flex-col overflow-hidden"
          style={{ width: rightPanelWidth }}
        >
          {/* Prompt Section */}
          <div className="flex-none p-4 border-b border-[#3a3a3a] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">프롬프트</h3>
              <button
                type="button"
                onClick={() => setPromptPreviewOpen(!promptPreviewOpen)}
                className="text-[10px] text-[#9ca3af] hover:text-[#e8e8e8] underline underline-offset-2"
              >
                {promptPreviewOpen ? "닫기" : "미리보기"}
              </button>
            </div>

            {promptPreviewOpen && (
              <div className="p-2 bg-[#1e1e1e] rounded border border-[#3a3a3a] space-y-1.5 max-h-[120px] overflow-y-auto">
                {assembledPreviewParts.length === 0 ? (
                  <p className="text-[10px] text-[#9ca3af] italic">입력된 정보가 없습니다.</p>
                ) : (
                  assembledPreviewParts.map((p, i) => (
                    <div key={i} className="text-[10px]">
                      <span className="font-semibold text-[#e8e8e8]">[{p.label}]</span>{" "}
                      <span className="text-[#9ca3af] leading-relaxed">{p.text}</span>
                    </div>
                  ))
                )}
              </div>
            )}

            <textarea
              ref={textareaRef}
              className="w-full p-3 bg-[#1e1e1e] border border-[#3a3a3a] rounded-lg text-sm text-[#e8e8e8] placeholder-[#9ca3af] focus:outline-none focus:border-[#4a9cf6] transition-colors resize-none"
              style={{ minHeight: 180, overflowY: "auto" }}
              placeholder="어떤 이미지를 만들고 싶으신가요?"
              value={prompt}
              onChange={(e) => { setPrompt(e.target.value); autoResize(); }}
            />

            <button
              onClick={handleGenerate}
              disabled={isGenerating || isRunningAnalysis || !prompt.trim()}
              className="w-full py-3 bg-[#4a9cf6] hover:bg-[#3b82f6] text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-[0_0_15px_rgba(74,156,246,0.2)] text-sm"
            >
              {isGenerating || isRunningAnalysis ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {isRunningAnalysis ? "이미지 분석 중..." : "생성 중..."}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  생성하기
                </>
              )}
            </button>
          </div>

          {/* Camera/Style Transform Section — visible when working image exists */}
          {workingImage && (
            <div className="flex-none border-b border-[#3a3a3a]">
              <button
                onClick={() => setCameraTransformOpen((v) => !v)}
                className="w-full px-4 py-3 flex items-center justify-between bg-[#1e1e1e] hover:bg-[#2a2a2a] transition-colors"
              >
                <span className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">카메라/스타일 변환</span>
                <ChevronDown
                  className={`w-4 h-4 text-[#9ca3af] transition-transform ${cameraTransformOpen ? "" : "-rotate-90"}`}
                />
              </button>

              {cameraTransformOpen && (
                <div className="p-3 space-y-3 bg-[#1a1a1a]">
                  {/* Angle */}
                  <div>
                    <p className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-1.5">각도</p>
                    <div className="flex flex-wrap gap-1.5">
                      {([["low", "로우앵글"], ["eye", "아이레벨"], ["high", "하이앵글"]] as const).map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => setTransformAngle((v) => v === key ? null : key)}
                          className={`text-[11px] px-2 py-1 rounded border transition-colors ${transformAngle === key ? "bg-[#4a9cf6]/20 border-[#4a9cf6] text-[#4a9cf6]" : "bg-[#252525] border-[#3a3a3a] text-[#9ca3af] hover:border-[#555]"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Lens */}
                  <div>
                    <p className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-1.5">렌즈</p>
                    <div className="flex flex-wrap gap-1.5">
                      {([["wide", "35mm 광각"], ["standard", "50mm 표준"], ["tele", "85mm 망원"], ["macro", "매크로"]] as const).map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => setTransformLens((v) => v === key ? null : key)}
                          className={`text-[11px] px-2 py-1 rounded border transition-colors ${transformLens === key ? "bg-[#4a9cf6]/20 border-[#4a9cf6] text-[#4a9cf6]" : "bg-[#252525] border-[#3a3a3a] text-[#9ca3af] hover:border-[#555]"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Depth */}
                  <div>
                    <p className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-1.5">심도</p>
                    <div className="flex flex-wrap gap-1.5">
                      {([["shallow", "얕은 보케"], ["deep", "깊은 심도"]] as const).map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => setTransformDepth((v) => v === key ? null : key)}
                          className={`text-[11px] px-2 py-1 rounded border transition-colors ${transformDepth === key ? "bg-[#4a9cf6]/20 border-[#4a9cf6] text-[#4a9cf6]" : "bg-[#252525] border-[#3a3a3a] text-[#9ca3af] hover:border-[#555]"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color */}
                  <div>
                    <p className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-1.5">색감</p>
                    <div className="flex flex-wrap gap-1.5">
                      {([["golden", "골든아워"], ["teal", "틸&오렌지"], ["noir", "느와르"], ["cool", "쿨톤"], ["studio", "스튜디오"]] as const).map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => setTransformColor((v) => v === key ? null : key)}
                          className={`text-[11px] px-2 py-1 rounded border transition-colors ${transformColor === key ? "bg-[#4a9cf6]/20 border-[#4a9cf6] text-[#4a9cf6]" : "bg-[#252525] border-[#3a3a3a] text-[#9ca3af] hover:border-[#555]"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Generate button */}
                  <button
                    onClick={handleCameraTransform}
                    disabled={isTransforming || (!transformAngle && !transformLens && !transformDepth && !transformColor)}
                    className="w-full py-2 bg-[#4a9cf6] hover:bg-[#3b82f6] text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-sm"
                  >
                    {isTransforming ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {transformStep === "analyzing" ? "이미지 분석 중..." : "변환 생성 중..."}
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        변환 생성
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Lineage Tree Section */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <button
              onClick={() => setLineagePanelOpen((v) => !v)}
              className="w-full px-4 py-3 border-b border-[#3a3a3a] flex items-center justify-between bg-[#1e1e1e] hover:bg-[#2a2a2a] transition-colors flex-none"
            >
              <span className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">생성 히스토리</span>
              <ChevronDown
                className={`w-4 h-4 text-[#9ca3af] transition-transform ${lineagePanelOpen ? "" : "-rotate-90"}`}
              />
            </button>

            {lineagePanelOpen && (
              <div className="flex-1 overflow-y-auto p-3">
                {varCardStates.length === 0 && !isGenerating && !isRefining ? (
                  <div className="flex flex-col items-center justify-center h-full py-8 gap-2">
                    <ImageIcon className="w-7 h-7 text-[#555]" />
                    <p className="text-xs text-[#9ca3af] text-center">
                      이미지를 생성하면<br />여기에 표시됩니다
                    </p>
                  </div>
                ) : (
                  <LineagePanel
                    varCardStates={varCardStates}
                    isGenerating={isGenerating || isRefining}
                    selectedVariationIdx={selectedVariationIdx}
                    variationGroupId={variationGroupId}
                    sourceCardBase64={iterationSourceBase64}
                    onSelectVariation={(idx, base64) => {
                      setWorkingImage({ base64 });
                      setWorkingImageSource("generated");
                      setSelectedVariationIdx(idx);
                      setRefineInputOpen(false);
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      <GuideImageLibrary
        open={libraryModal.open}
        onClose={() => setLibraryModal({ open: false })}
        filterType={libraryModal.open ? libraryModal.category : undefined}
        onSelect={(img) => {
          if (libraryModal.open) {
            addFromGuideImage(libraryModal.category, img);
          }
        }}
      />
    </div>
  );
}
