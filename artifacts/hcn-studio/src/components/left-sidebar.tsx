import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useListTasks, useListGuideImages, useCreateGuideImage, useCreateTask, getListGuideImagesQueryKey, getListTasksQueryKey } from "@workspace/api-client-react";
import type { GuideImage } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { formatRelativeTime } from "@/components/asset-creator-types";
import { History, Folder, Image as ImageIcon, Plus, Upload } from "lucide-react";

type GuideImageType = "product" | "mood" | "model";

interface LeftSidebarProps {
  activeTaskId: number;
  onSelectGuideImage: (type: GuideImageType, image: GuideImage) => void;
  uploadRef?: React.MutableRefObject<((file: File) => Promise<void>) | null>;
}

const TYPE_LABELS: Record<GuideImageType, string> = {
  product: "제품",
  mood: "무드",
  model: "모델",
};

export function LeftSidebar({ activeTaskId, onSelectGuideImage, uploadRef }: LeftSidebarProps) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<GuideImageType>("product");
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: tasks } = useListTasks();
  const { data: guideImages, isLoading: isLoadingImages } = useListGuideImages({ type: activeTab });
  const createGuideImageMutation = useCreateGuideImage();
  const createTaskMutation = useCreateTask();

  async function handleCreateTask() {
    if (createTaskMutation.isPending) return;
    const name = newTaskName.trim();
    if (!name) return;
    try {
      const task = await createTaskMutation.mutateAsync({ data: { name } });
      setIsCreatingTask(false);
      setNewTaskName("");
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      navigate(`/tasks/${task.id}`);
    } catch {
      toast({ variant: "destructive", title: "태스크 생성에 실패했습니다." });
    }
  }

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

  useEffect(() => {
    if (uploadRef) {
      uploadRef.current = (file: File) => uploadFile(file, activeTab);
    }
    return () => {
      if (uploadRef) uploadRef.current = null;
    };
  }, [uploadRef, uploadFile, activeTab]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file, activeTab);
  };

  const sortedTasks = tasks ? [...tasks].reverse() : [];

  return (
    <aside className="w-[220px] flex-none border-r border-[#3a3a3a] bg-[#252525] flex flex-col overflow-hidden">
      {/* Task History Section */}
      <div className="flex-1 flex flex-col min-h-0 border-b border-[#3a3a3a]">
        <div className="px-3 py-2.5 border-b border-[#3a3a3a] flex items-center justify-between bg-[#1e1e1e] flex-none">
          <div className="flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-[#9ca3af]" />
            <span className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">테스크 히스토리</span>
          </div>
          <button
            onClick={() => { setIsCreatingTask(true); setNewTaskName(""); }}
            title="새 테스크 만들기"
            className="w-5 h-5 rounded flex items-center justify-center hover:bg-[#333] text-[#9ca3af] hover:text-[#e8e8e8] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
          {isCreatingTask && (
            <div className="mb-1">
              <input
                autoFocus
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateTask();
                  if (e.key === "Escape") setIsCreatingTask(false);
                }}
                onBlur={() => { if (!newTaskName.trim()) setIsCreatingTask(false); }}
                placeholder="태스크 이름..."
                className="w-full text-xs px-2 py-1.5 bg-[#1e1e1e] border border-[#4a9cf6] rounded text-[#e8e8e8] outline-none placeholder-[#555]"
              />
              <div className="flex gap-1 mt-1">
                <button
                  onClick={handleCreateTask}
                  disabled={!newTaskName.trim() || createTaskMutation.isPending}
                  className="flex-1 text-[10px] py-1 bg-[#4a9cf6] text-white rounded disabled:opacity-50 hover:bg-[#3b82f6] transition-colors"
                >
                  {createTaskMutation.isPending ? "생성 중..." : "만들기"}
                </button>
                <button
                  onClick={() => setIsCreatingTask(false)}
                  className="px-2 text-[10px] py-1 text-[#9ca3af] hover:text-[#e8e8e8] border border-[#3a3a3a] rounded transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          )}
          {sortedTasks.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-xs text-[#9ca3af]">테스크 없음</p>
            </div>
          ) : (
            sortedTasks.map((task) => {
              const isActive = task.id === activeTaskId;
              return (
                <div
                  key={task.id}
                  onClick={() => navigate(`/tasks/${task.id}`)}
                  className={`p-2 rounded cursor-pointer border transition-colors ${
                    isActive
                      ? "bg-[#333] border-[#4a9cf6]"
                      : "border-transparent hover:bg-[#333] hover:border-[#3a3a3a]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-xs font-medium truncate flex-1 min-w-0 ${isActive ? "text-white" : "text-[#e8e8e8]"}`}>
                      {task.name}
                    </span>
                    <span className="text-[10px] bg-[#1e1e1e] px-1.5 py-0.5 rounded text-[#9ca3af] border border-[#3a3a3a] shrink-0 ml-1">
                      #{task.id}
                    </span>
                  </div>
                  <span className="text-[10px] text-[#9ca3af]">
                    {formatRelativeTime(
                      task.createdAt instanceof Date
                        ? task.createdAt.toISOString()
                        : task.createdAt
                    )}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Guide Image Library Section */}
      <div className="h-[340px] flex-none flex flex-col">
        <div className="px-3 py-2.5 border-b border-[#3a3a3a] flex items-center justify-between bg-[#1e1e1e] flex-none">
          <div className="flex items-center gap-1.5">
            <Folder className="w-3.5 h-3.5 text-[#9ca3af]" />
            <span className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">가이드 이미지</span>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            title="이미지 업로드"
            className="w-5 h-5 rounded flex items-center justify-center hover:bg-[#333] text-[#9ca3af] hover:text-[#e8e8e8] transition-colors disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
          />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#3a3a3a] flex-none">
          {(["product", "mood", "model"] as GuideImageType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 text-[11px] font-medium transition-colors border-b-2 ${
                activeTab === tab
                  ? "border-[#4a9cf6] text-[#4a9cf6] bg-[#333]"
                  : "border-transparent text-[#9ca3af] hover:text-[#e8e8e8] hover:bg-[#2a2a2a]"
              }`}
            >
              {TYPE_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* 2-column thumbnail grid */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoadingImages ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-5 h-5 border-2 border-[#4a9cf6] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !guideImages || guideImages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 py-4">
              <ImageIcon className="w-7 h-7 text-[#555]" />
              <p className="text-[10px] text-[#9ca3af] text-center leading-tight">
                {TYPE_LABELS[activeTab]} 이미지가 없습니다.
                <br />
                위 업로드 버튼을 눌러 추가하세요.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 content-start">
              {guideImages.map((img) => (
                <div
                  key={img.id}
                  onClick={() => onSelectGuideImage(activeTab, img)}
                  className="aspect-square bg-[#3a3a3a] rounded border border-[#444] hover:border-[#4a9cf6] cursor-pointer overflow-hidden group relative transition-colors"
                  title={img.fileName}
                >
                  <img
                    src={img.imageUrl}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-[#4a9cf6]/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
