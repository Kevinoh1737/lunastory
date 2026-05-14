import { useState, useRef, useCallback } from "react";
import { useListGuideImages, useCreateGuideImage, useDeleteGuideImage, getListGuideImagesQueryKey } from "@workspace/api-client-react";
import type { GuideImage } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { usePaste } from "@/components/reference-card-shared";

type GuideImageType = "product" | "mood" | "model";

interface GuideImageLibraryProps {
  open: boolean;
  onClose: () => void;
  filterType?: GuideImageType;
  onSelect: (image: GuideImage) => void;
}

const TYPE_LABELS: Record<GuideImageType, string> = {
  product: "제품",
  mood: "무드",
  model: "모델",
};

export function GuideImageLibrary({ open, onClose, filterType, onSelect }: GuideImageLibraryProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<GuideImageType>(filterType ?? "product");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const createGuideImageMutation = useCreateGuideImage();
  const deleteGuideImageMutation = useDeleteGuideImage();

  const { data: images, isLoading } = useListGuideImages(
    { type: activeTab },
    { query: { enabled: open } }
  );

  const uploadFile = useCallback(async (file: File, type: GuideImageType) => {
    setIsUploading(true);
    try {
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await createGuideImageMutation.mutateAsync({
        data: { type, imageBase64 },
      });
      queryClient.invalidateQueries({ queryKey: getListGuideImagesQueryKey({ type }) });
      toast({ title: "가이드 이미지가 업로드되었습니다." });
    } catch {
      toast({ variant: "destructive", title: "업로드에 실패했습니다." });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [createGuideImageMutation, queryClient]);

  const handlePasteFiles = useCallback(
    (files: File[]) => { if (files[0]) uploadFile(files[0], activeTab); },
    [uploadFile, activeTab]
  );
  usePaste(handlePasteFiles, open);

  if (!open) return null;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file, activeTab);
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("이 이미지를 라이브러리에서 삭제하시겠습니까?")) return;
    try {
      await deleteGuideImageMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListGuideImagesQueryKey({ type: activeTab }) });
    } catch {
      toast({ variant: "destructive", title: "삭제에 실패했습니다." });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 bg-[#252525] border border-[#3a3a3a] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3a3a]">
          <h2 className="text-base font-semibold text-[#e8e8e8]">가이드 이미지 라이브러리</h2>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-[#e8e8e8] transition-colors text-xl leading-none">&times;</button>
        </div>

        <div className="flex border-b border-[#3a3a3a] px-6">
          {(["product", "mood", "model"] as GuideImageType[]).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t
                  ? "border-[#4a9cf6] text-[#4a9cf6]"
                  : "border-transparent text-[#9ca3af] hover:text-[#e8e8e8]"
              }`}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-[#4a9cf6] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !images || images.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-[#9ca3af]">아직 저장된 {TYPE_LABELS[activeTab]} 이미지가 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="relative group rounded-lg overflow-hidden border border-[#3a3a3a] bg-[#1e1e1e] cursor-pointer hover:border-[#4a9cf6] transition-colors"
                  onClick={() => { onSelect(img); onClose(); }}
                >
                  <div className="aspect-square">
                    <img
                      src={img.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button className="text-xs text-white bg-[#4a9cf6]/80 px-2 py-1 rounded hover:bg-[#4a9cf6]">선택</button>
                      <button
                        onClick={(e) => handleDelete(e, img.id)}
                        className="text-xs text-white bg-red-600/80 px-2 py-1 rounded hover:bg-red-600"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                  {img.name && (
                    <p className="text-[10px] text-[#9ca3af] truncate px-1 pb-1 pt-0.5">{img.name}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#3a3a3a] flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-4 py-2 text-sm border border-[#3a3a3a] rounded-lg hover:bg-[#333] text-[#e8e8e8] transition-colors disabled:opacity-50"
          >
            {isUploading ? "업로드 중..." : `+ ${TYPE_LABELS[activeTab]} 이미지 업로드`}
          </button>
          <p className="text-xs text-[#9ca3af]">
            업로드된 이미지는 재사용 가능한 라이브러리에 저장됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
