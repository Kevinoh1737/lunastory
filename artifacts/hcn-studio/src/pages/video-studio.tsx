import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  useListVideoTasks,
  useCreateVideoTask,
  useUpdateVideoTask,
  useDeleteVideoTask,
  useListVideos,
  useListImages,
  useListGuideImages,
  useGenerateComparisonVideos,
  useUploadSourceVideo,
  useUploadSourceImage,
  useGetVideoStatus,
  getGetVideoStatusQueryKey,
  useGetVideoTask,
  useUpdateVideo,
  useDeleteVideo,
  getListVideoTasksQueryKey,
  getListVideosQueryKey,
} from "@workspace/api-client-react";
import type { Video, SavedImage, GuideImage } from "@workspace/api-client-react";
import {
  Download,
  Trash2,
  Film,
  Image as ImageIcon,
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  Plus,
  History,
  ChevronLeft,
} from "lucide-react";

type Tab = "i2v" | "v2v";
type ImageSource = "upload" | "library" | "guide";
type VideoSource = "upload" | "library";

function ModelBadge({ model }: { model: string }) {
  if (model === "runway-gen4-turbo") {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium">
        Runway
      </span>
    );
  }
  if (model === "kling-2.0") {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-medium">
        Kling
      </span>
    );
  }
  if (model === "veo-2.0" || model === "veo-3.1") {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-medium">
        Veo
      </span>
    );
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400 font-medium">
      Unknown
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "generating") {
    return (
      <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
        <Loader2 className="w-3 h-3 animate-spin" />
        생성중
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
        <CheckCircle className="w-3 h-3" />
        완료
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">
      <AlertCircle className="w-3 h-3" />
      실패
    </span>
  );
}

function VideoPolling({
  videoId,
  onDone,
}: {
  videoId: number;
  onDone: (video: Video) => void;
}) {
  const [active, setActive] = useState(true);
  const calledDone = useRef(false);

  const { data } = useGetVideoStatus(videoId, {
    query: {
      queryKey: getGetVideoStatusQueryKey(videoId),
      enabled: active,
      refetchInterval: (q) => {
        const status = (q.state.data as Video | undefined)?.status;
        if (status === "done" || status === "error") return false;
        return 3000;
      },
    },
  });

  useEffect(() => {
    if (!data) return;
    const video = data as Video;
    if ((video.status === "done" || video.status === "error") && !calledDone.current) {
      calledDone.current = true;
      setActive(false);
      onDone(video);
    }
  }, [data, onDone]);

  return null;
}

interface LeftPanelProps {
  activeTaskId: number;
}

function VideoTaskSidebar({ activeTaskId }: LeftPanelProps) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editingTaskName, setEditingTaskName] = useState("");
  const renameCommittedRef = useRef(false);

  const { data: tasks } = useListVideoTasks();
  const createTaskMutation = useCreateVideoTask();
  const updateTaskMutation = useUpdateVideoTask();
  const deleteTaskMutation = useDeleteVideoTask();

  async function handleCreateTask() {
    if (createTaskMutation.isPending) return;
    const name = newTaskName.trim();
    if (!name) return;
    try {
      const task = await createTaskMutation.mutateAsync({ data: { name } });
      setIsCreatingTask(false);
      setNewTaskName("");
      queryClient.invalidateQueries({ queryKey: getListVideoTasksQueryKey() });
      navigate(`/videos/${task.id}`);
    } catch {
      toast({ variant: "destructive", title: "태스크 생성에 실패했습니다." });
    }
  }

  function startEditing(task: { id: number; name: string }, e: React.MouseEvent) {
    e.stopPropagation();
    renameCommittedRef.current = false;
    setEditingTaskId(task.id);
    setEditingTaskName(task.name);
  }

  async function commitRename(taskId: number) {
    if (renameCommittedRef.current) return;
    renameCommittedRef.current = true;
    const name = editingTaskName.trim();
    setEditingTaskId(null);
    if (!name) return;
    try {
      await updateTaskMutation.mutateAsync({ id: taskId, data: { name } });
      queryClient.invalidateQueries({ queryKey: getListVideoTasksQueryKey() });
    } catch {
      toast({ variant: "destructive", title: "이름 변경에 실패했습니다." });
    }
  }

  function cancelRename() {
    renameCommittedRef.current = true;
    setEditingTaskId(null);
  }

  async function handleDeleteTask(taskId: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("이 태스크를 삭제하시겠습니까?")) return;
    try {
      await deleteTaskMutation.mutateAsync({ id: taskId });
      queryClient.invalidateQueries({ queryKey: getListVideoTasksQueryKey() });
      toast({ title: "태스크가 삭제되었습니다." });
      if (taskId === activeTaskId) navigate("/videos");
    } catch {
      toast({ variant: "destructive", title: "태스크 삭제에 실패했습니다." });
    }
  }

  const sortedTasks = tasks ? [...tasks] : [];

  return (
    <aside className="w-[220px] flex-none border-r border-[#3a3a3a] bg-[#252525] flex flex-col overflow-hidden">
      <div className="px-3 py-2.5 border-b border-[#3a3a3a] flex items-center gap-2 bg-[#1e1e1e] flex-none">
        <button
          onClick={() => navigate("/videos")}
          className="w-5 h-5 rounded flex items-center justify-center hover:bg-[#333] text-[#9ca3af] hover:text-[#e8e8e8] transition-colors"
          title="동영상 태스크 목록으로"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <History className="w-3.5 h-3.5 text-[#9ca3af] flex-shrink-0" />
          <span className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider truncate">
            태스크 히스토리
          </span>
        </div>
        <button
          onClick={() => { setIsCreatingTask(true); setNewTaskName(""); }}
          title="새 태스크 만들기"
          className="w-5 h-5 rounded flex items-center justify-center hover:bg-[#333] text-[#9ca3af] hover:text-[#e8e8e8] transition-colors flex-shrink-0"
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
            <p className="text-xs text-[#9ca3af]">태스크 없음</p>
          </div>
        ) : (
          sortedTasks.map((task) => {
            const isActive = task.id === activeTaskId;
            const isEditing = editingTaskId === task.id;
            return (
              <div
                key={task.id}
                onClick={() => !isEditing && navigate(`/videos/${task.id}`)}
                className={`group p-2 rounded cursor-pointer border transition-colors ${
                  isActive
                    ? "bg-[#333] border-[#4a9cf6]"
                    : "border-transparent hover:bg-[#333] hover:border-[#3a3a3a]"
                }`}
              >
                <div className="flex items-center justify-between mb-0.5 gap-1">
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingTaskName}
                      onChange={(e) => setEditingTaskName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(task.id);
                        if (e.key === "Escape") cancelRename();
                      }}
                      onBlur={() => commitRename(task.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 min-w-0 text-xs px-1.5 py-0.5 bg-[#1e1e1e] border border-[#4a9cf6] rounded text-[#e8e8e8] outline-none"
                    />
                  ) : (
                    <span
                      onDoubleClick={(e) => startEditing(task, e)}
                      className={`text-xs font-medium truncate flex-1 min-w-0 ${isActive ? "text-white" : "text-[#e8e8e8]"}`}
                      title="더블클릭해서 이름 변경"
                    >
                      {task.name}
                    </span>
                  )}
                  {!isEditing && (
                    <button
                      onClick={(e) => handleDeleteTask(task.id, e)}
                      className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-4 h-4 flex items-center justify-center text-[#6b7280] hover:text-red-400 transition-all"
                      title="태스크 삭제"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {!isEditing && (
                  <span className="text-[10px] text-[#9ca3af]">
                    {new Date(task.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

interface VideoStudioProps {
  params: { id: string };
}

export default function VideoStudio({ params }: VideoStudioProps) {
  const taskId = parseInt(params.id, 10);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: currentTask, isLoading: taskLoading, isError: taskError } = useGetVideoTask(
    Number.isNaN(taskId) ? -1 : taskId,
  );

  useEffect(() => {
    if (!taskLoading && (taskError || !currentTask || Number.isNaN(taskId))) {
      navigate("/videos");
    }
  }, [taskLoading, taskError, currentTask, taskId, navigate]);

  const [activeTab, setActiveTab] = useState<Tab>("i2v");
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [imageSource, setImageSource] = useState<ImageSource>("upload");
  const [imageLibraryOpen, setImageLibraryOpen] = useState(false);
  const [imageLibraryTab, setImageLibraryTab] = useState<"library" | "guide">("library");
  const [isImageDragging, setIsImageDragging] = useState(false);
  const [sourceVideoUrl, setSourceVideoUrl] = useState<string | null>(null);
  const [videoSource, setVideoSource] = useState<VideoSource>("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [comparisonVideoIds, setComparisonVideoIds] = useState<number[]>([]);
  const [completedVideo, setCompletedVideo] = useState<Video | null>(null);
  const [saveName, setSaveName] = useState("");
  const [comparisonGroup, setComparisonGroup] = useState<{
    ids: number[];
    completed: Video[];
  } | null>(null);
  const [expandedVeoPrompts, setExpandedVeoPrompts] = useState<Set<number>>(new Set());
  const [runwayDuration, setRunwayDuration] = useState<number>(5);
  const [klingDuration, setKlingDuration] = useState<number>(5);
  const [veoDuration, setVeoDuration] = useState<number>(5);


  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  const { data: taskVideos } = useListVideos({ videoTaskId: taskId }, {});
  const { data: allDoneVideos } = useListVideos({}, {});
  const { data: savedImages } = useListImages({}, {});
  const { data: guideImages } = useListGuideImages({}, {});

  const generateComparisonMutation = useGenerateComparisonVideos();
  const uploadSourceVideoMutation = useUploadSourceVideo();
  const uploadSourceImageMutation = useUploadSourceImage();
  const updateVideoMutation = useUpdateVideo();
  const deleteVideoMutation = useDeleteVideo();

  const taskVideosList: Video[] = (taskVideos || []) as Video[];
  const allDoneVideosList: Video[] = ((allDoneVideos || []) as Video[]).filter(
    (v: Video) => v.status === "done"
  );
  const allImages: SavedImage[] = savedImages || [];
  const allGuideImages: GuideImage[] = guideImages || [];
  const handleGenerateComparison = async (models: ("runway-gen4-turbo" | "kling-2.0" | "veo-3.1")[], durationSeconds?: number) => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      toast({ variant: "destructive", title: "프롬프트를 입력해주세요." });
      return;
    }
    if (activeTab === "i2v" && !selectedImageUrl) {
      toast({ variant: "destructive", title: "레퍼런스 이미지를 선택해주세요." });
      return;
    }
    if (activeTab === "v2v" && !sourceVideoUrl) {
      toast({ variant: "destructive", title: "소스 동영상을 선택하거나 업로드해주세요." });
      return;
    }

    try {
      const videos = await generateComparisonMutation.mutateAsync({
        data: {
          sourceType: activeTab,
          prompt: trimmedPrompt,
          sourceImageUrl: activeTab === "i2v" ? selectedImageUrl ?? undefined : undefined,
          sourceVideoUrl: activeTab === "v2v" ? sourceVideoUrl ?? undefined : undefined,
          videoTaskId: taskId,
          models,
          durationSeconds,
        },
      });

      const ids = (videos as Video[]).map((v) => v.id);
      setComparisonVideoIds((prev) => [...prev, ...ids]);
      setComparisonGroup({ ids, completed: [] });
      setCompletedVideo(null);
      queryClient.invalidateQueries({ queryKey: getListVideosQueryKey({ videoTaskId: taskId }) });
      queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
      const label = models && models.length === 1 ? models[0] : `${ids.length}개 모델`;
      toast({ title: `비교 생성 시작 — ${label}이(가) 생성 중입니다.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "비교 생성 실패", description: error?.message });
    }
  };

  const handlePollingDone = useCallback(
    (video: Video) => {
      setCompletedVideo(video);
      setSaveName(video.name || "");
      queryClient.invalidateQueries({ queryKey: getListVideosQueryKey({ videoTaskId: taskId }) });
      queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });

      if (video.status === "error") {
        toast({
          variant: "destructive",
          title: "동영상 생성 실패",
          description: video.errorMessage || "알 수 없는 오류가 발생했습니다.",
        });
      } else {
        toast({ title: "동영상 생성이 완료되었습니다!" });
      }
    },
    [queryClient, taskId]
  );

  const handleComparisonPollingDone = useCallback(
    (video: Video) => {
      setComparisonVideoIds((prev) => prev.filter((id) => id !== video.id));
      setComparisonGroup((prev) => {
        if (!prev || !prev.ids.includes(video.id)) return prev;
        return { ...prev, completed: [...prev.completed, video] };
      });
      queryClient.invalidateQueries({ queryKey: getListVideosQueryKey({ videoTaskId: taskId }) });
      queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
      if (video.status === "error") {
        toast({
          variant: "destructive",
          title: `[${video.model}] 생성 실패`,
          description: video.errorMessage || "알 수 없는 오류",
        });
      }
    },
    [queryClient, taskId]
  );

  const handleSave = async () => {
    if (!completedVideo || !saveName.trim()) {
      toast({ variant: "destructive", title: "이름을 입력해주세요." });
      return;
    }
    try {
      await updateVideoMutation.mutateAsync({ id: completedVideo.id, data: { name: saveName.trim() } });
      queryClient.invalidateQueries({ queryKey: getListVideosQueryKey({ videoTaskId: taskId }) });
      toast({ title: "라이브러리에 저장되었습니다." });
      setCompletedVideo(null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "저장 실패", description: error?.message });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteVideoMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListVideosQueryKey({ videoTaskId: taskId }) });
      toast({ title: "삭제되었습니다." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "삭제 실패", description: error?.message });
    }
  };

  const handleVideoFileUpload = async (file: File) => {
    if (!file.name.match(/\.(mp4|mov)$/i)) {
      toast({ variant: "destructive", title: "mp4 또는 mov 파일만 업로드할 수 있습니다." });
      return;
    }
    try {
      const result = await uploadSourceVideoMutation.mutateAsync({ data: { file } });
      setSourceVideoUrl(result.url);
      toast({ title: "동영상이 업로드되었습니다." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "업로드 실패", description: error?.message });
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await handleVideoFileUpload(file);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await handleVideoFileUpload(file);
    if (e.target) e.target.value = "";
  };

  const handleImageFileUpload = async (file: File) => {
    if (!file.name.match(/\.(jpg|jpeg|png|webp)$/i)) {
      toast({ variant: "destructive", title: "jpg, png, webp 파일만 업로드할 수 있습니다." });
      return;
    }
    try {
      const result = await uploadSourceImageMutation.mutateAsync({ data: { file } });
      setSelectedImageUrl(result.url);
      toast({ title: "이미지가 업로드되었습니다." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "업로드 실패", description: error?.message });
    }
  };

  const handleImageDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsImageDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await handleImageFileUpload(file);
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await handleImageFileUpload(file);
    if (e.target) e.target.value = "";
  };

  if (taskLoading || !currentTask) {
    return <div className="h-screen flex items-center justify-center bg-[#1e1e1e] text-[#9ca3af] text-sm">로딩 중...</div>;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#1e1e1e]">
      <div className="flex flex-1 min-h-0">
        {/* Left Panel: Task Sidebar */}
        <VideoTaskSidebar activeTaskId={taskId} />

        {/* Center Panel: Video Generation */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-[#3a3a3a] overflow-y-auto">
          <div className="px-5 py-4 border-b border-[#3a3a3a] bg-[#252525] flex-none">
            <h2 className="text-sm font-semibold text-[#e8e8e8]">AI 동영상 생성</h2>
            <p className="text-xs text-[#9ca3af] mt-0.5">이미지 또는 동영상을 기반으로 AI 동영상을 생성합니다.</p>
          </div>

          <div className="flex-1 p-5 space-y-5">
            {/* Tab */}
            <div className="flex border border-[#3a3a3a] rounded-lg overflow-hidden">
              {(["i2v", "v2v"] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setCompletedVideo(null);
                  }}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? "bg-[#333] text-[#4a9cf6] border-b-2 border-[#4a9cf6]"
                      : "text-[#9ca3af] hover:text-[#e8e8e8] hover:bg-[#2e2e2e]"
                  }`}
                >
                  {tab === "i2v" ? "이미지 → 동영상" : "동영상 → 동영상"}
                </button>
              ))}
            </div>

            {/* i2v: image source selector */}
            {activeTab === "i2v" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[#e8e8e8]">레퍼런스 이미지 선택</h3>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setImageSource("upload")}
                      className={`text-xs px-2.5 py-1 rounded transition-colors ${
                        imageSource === "upload"
                          ? "bg-[#4a9cf6] text-white"
                          : "bg-[#333] text-[#9ca3af] hover:text-[#e8e8e8]"
                      }`}
                    >
                      직접 업로드
                    </button>
                    <button
                      onClick={() => { setImageSource("library"); setImageLibraryTab("library"); setImageLibraryOpen(true); }}
                      className={`text-xs px-2.5 py-1 rounded transition-colors ${
                        imageSource === "library"
                          ? "bg-[#4a9cf6] text-white"
                          : "bg-[#333] text-[#9ca3af] hover:text-[#e8e8e8]"
                      }`}
                    >
                      AI 생성 이미지
                    </button>
                    <button
                      onClick={() => { setImageSource("guide"); setImageLibraryTab("guide"); setImageLibraryOpen(true); }}
                      className={`text-xs px-2.5 py-1 rounded transition-colors ${
                        imageSource === "guide"
                          ? "bg-[#4a9cf6] text-white"
                          : "bg-[#333] text-[#9ca3af] hover:text-[#e8e8e8]"
                      }`}
                    >
                      가이드 이미지
                    </button>
                  </div>
                </div>

                {imageSource === "upload" && (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsImageDragging(true); }}
                    onDragLeave={() => setIsImageDragging(false)}
                    onDrop={handleImageDrop}
                    onClick={() => imageFileInputRef.current?.click()}
                    className={`h-24 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
                      isImageDragging
                        ? "border-[#4a9cf6] bg-[#4a9cf6]/10"
                        : "border-[#3a3a3a] hover:border-[#555] hover:bg-[#2e2e2e]"
                    }`}
                  >
                    <input ref={imageFileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp" onChange={handleImageFileChange} className="hidden" />
                    <Upload className="w-5 h-5 text-[#6b7280]" />
                    <span className="text-xs text-[#9ca3af]">이미지를 드래그하거나 클릭해서 업로드</span>
                    <span className="text-[10px] text-[#6b7280]">jpg · png · webp 지원</span>
                    {uploadSourceImageMutation.isPending && (
                      <div className="flex items-center gap-1.5 text-[#4a9cf6]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span className="text-xs">업로드 중...</span>
                      </div>
                    )}
                  </div>
                )}

                {(imageSource === "library" || imageSource === "guide") && !selectedImageUrl && (
                  <button
                    onClick={() => setImageLibraryOpen(true)}
                    className="w-full h-16 border border-dashed border-[#3a3a3a] rounded-lg flex items-center justify-center gap-2 text-xs text-[#9ca3af] hover:border-[#555] hover:bg-[#2e2e2e] transition-colors"
                  >
                    <ImageIcon className="w-4 h-4 opacity-50" />
                    라이브러리 열기
                  </button>
                )}

                {selectedImageUrl && (
                  <div className="flex items-center gap-3 p-2.5 bg-[#2e2e2e] rounded-lg">
                    <img src={selectedImageUrl} alt="선택된 이미지" className="w-10 h-10 object-cover rounded flex-shrink-0" />
                    <span className="text-xs text-[#9ca3af] flex-1">레퍼런스 이미지가 선택되었습니다.</span>
                    {(imageSource === "library" || imageSource === "guide") && (
                      <button
                        onClick={() => setImageLibraryOpen(true)}
                        className="text-xs text-[#4a9cf6] hover:text-[#7bb8f8] mr-2"
                      >
                        변경
                      </button>
                    )}
                    <button onClick={() => setSelectedImageUrl(null)} className="text-xs text-[#6b7280] hover:text-[#e8e8e8]">
                      해제
                    </button>
                  </div>
                )}

                {/* Image library modal */}
                {imageLibraryOpen && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
                    onClick={(e) => { if (e.target === e.currentTarget) setImageLibraryOpen(false); }}
                  >
                    <div className="bg-[#252525] border border-[#3a3a3a] rounded-xl w-full max-w-3xl max-h-[80vh] flex flex-col shadow-2xl mx-4">
                      <div className="flex items-center justify-between px-5 py-3 border-b border-[#3a3a3a] flex-none">
                        <div className="flex gap-1">
                          <button
                            onClick={() => setImageLibraryTab("library")}
                            className={`text-xs px-3 py-1.5 rounded transition-colors ${
                              imageLibraryTab === "library"
                                ? "bg-[#4a9cf6] text-white"
                                : "bg-[#333] text-[#9ca3af] hover:text-[#e8e8e8]"
                            }`}
                          >
                            AI 생성 이미지
                          </button>
                          <button
                            onClick={() => setImageLibraryTab("guide")}
                            className={`text-xs px-3 py-1.5 rounded transition-colors ${
                              imageLibraryTab === "guide"
                                ? "bg-[#4a9cf6] text-white"
                                : "bg-[#333] text-[#9ca3af] hover:text-[#e8e8e8]"
                            }`}
                          >
                            가이드 이미지
                          </button>
                        </div>
                        <button
                          onClick={() => setImageLibraryOpen(false)}
                          className="text-[#6b7280] hover:text-[#e8e8e8] text-xs"
                        >
                          닫기
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4">
                        {(imageLibraryTab === "library" ? allImages : allGuideImages).length === 0 ? (
                          <div className="h-40 flex items-center justify-center text-[#6b7280]">
                            <div className="text-center">
                              <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                              <p className="text-xs">{imageLibraryTab === "library" ? "저장된 AI 이미지가 없습니다." : "가이드 이미지가 없습니다."}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                            {(imageLibraryTab === "library" ? allImages : allGuideImages).map((img) => (
                              <button
                                key={img.id}
                                onClick={() => {
                                  setSelectedImageUrl(img.imageUrl);
                                  setImageSource(imageLibraryTab);
                                  setImageLibraryOpen(false);
                                }}
                                className={`aspect-square rounded overflow-hidden border-2 transition-all ${
                                  selectedImageUrl === img.imageUrl
                                    ? "border-[#4a9cf6] shadow-[0_0_0_2px_rgba(74,156,246,0.3)]"
                                    : "border-transparent hover:border-[#555]"
                                }`}
                              >
                                <img src={img.imageUrl} alt="" className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* v2v: video source */}
            {activeTab === "v2v" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[#e8e8e8]">소스 동영상 선택</h3>
                  <div className="flex gap-1">
                    {(["upload", "library"] as VideoSource[]).map((src) => (
                      <button
                        key={src}
                        onClick={() => setVideoSource(src)}
                        className={`text-xs px-2.5 py-1 rounded transition-colors ${
                          videoSource === src
                            ? "bg-[#4a9cf6] text-white"
                            : "bg-[#333] text-[#9ca3af] hover:text-[#e8e8e8]"
                        }`}
                      >
                        {src === "upload" ? "파일 업로드" : "라이브러리"}
                      </button>
                    ))}
                  </div>
                </div>

                {videoSource === "upload" && (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`h-24 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
                      isDragging
                        ? "border-[#4a9cf6] bg-[#4a9cf6]/10"
                        : "border-[#3a3a3a] hover:border-[#555] hover:bg-[#2e2e2e]"
                    }`}
                  >
                    <input ref={fileInputRef} type="file" accept=".mp4,.mov" onChange={handleFileChange} className="hidden" />
                    <Upload className="w-5 h-5 text-[#6b7280]" />
                    <span className="text-xs text-[#9ca3af]">mp4, mov 파일을 드래그하거나 클릭해서 업로드</span>
                    {uploadSourceVideoMutation.isPending && (
                      <div className="flex items-center gap-1.5 text-[#4a9cf6]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span className="text-xs">업로드 중...</span>
                      </div>
                    )}
                  </div>
                )}

                {videoSource === "library" && (
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {allDoneVideosList.length === 0 ? (
                      <div className="h-20 flex items-center justify-center text-[#6b7280] text-xs border border-dashed border-[#3a3a3a] rounded-lg">
                        <div className="text-center">
                          <Film className="w-5 h-5 mx-auto mb-1 opacity-40" />
                          완성된 동영상이 없습니다.
                        </div>
                      </div>
                    ) : (
                      allDoneVideosList.map((v: Video) => (
                        <button
                          key={v.id}
                          onClick={() => setSourceVideoUrl(v.videoUrl)}
                          className={`w-full flex items-center gap-2 p-2 rounded text-left transition-colors ${
                            sourceVideoUrl === v.videoUrl
                              ? "bg-[#4a9cf6]/20 border border-[#4a9cf6]/40"
                              : "hover:bg-[#333] border border-transparent"
                          }`}
                        >
                          <Film className="w-3.5 h-3.5 text-[#9ca3af] flex-shrink-0" />
                          <span className="text-xs text-[#e8e8e8] truncate">{v.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}

                {sourceVideoUrl && (
                  <div className="flex items-center gap-2 p-2.5 bg-[#2e2e2e] rounded-lg">
                    <Film className="w-4 h-4 text-[#4a9cf6] flex-shrink-0" />
                    <span className="text-xs text-[#9ca3af] truncate flex-1">{sourceVideoUrl}</span>
                    <button onClick={() => setSourceVideoUrl(null)} className="text-xs text-[#6b7280] hover:text-[#e8e8e8] flex-shrink-0">
                      해제
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Prompt */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#e8e8e8]">프롬프트</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="생성할 동영상을 설명해주세요. 예: 부드럽게 회전하는 제품 쇼트, 따뜻한 조명..."
                className="w-full h-24 bg-[#1e1e1e] border border-[#3a3a3a] rounded-lg px-3 py-2 text-sm text-[#e8e8e8] placeholder-[#6b7280] resize-none focus:outline-none focus:border-[#4a9cf6]"
              />
            </div>

            {/* Generate buttons */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <div className="flex-1 flex flex-col items-center gap-1">
                  <button
                    onClick={() => handleGenerateComparison(["runway-gen4-turbo"], runwayDuration)}
                    disabled={generateComparisonMutation.isPending || comparisonVideoIds.length > 0}
                    className="w-full py-2 bg-blue-600/80 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-1 text-xs"
                    title="Runway Gen-4 Turbo로 단독 생성"
                  >
                    {generateComparisonMutation.isPending || comparisonVideoIds.length > 0 ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : null}
                    Runway
                  </button>
                  <div className="flex gap-1">
                    {[5, 10].map((sec) => (
                      <button
                        key={sec}
                        onClick={() => setRunwayDuration(sec)}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${runwayDuration === sec ? "bg-blue-600 border-blue-600 text-white" : "border-zinc-600 text-zinc-400 hover:border-blue-400"}`}
                      >
                        {sec}초
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 flex flex-col items-center gap-1">
                  <button
                    onClick={() => handleGenerateComparison(["kling-2.0"], klingDuration)}
                    disabled={generateComparisonMutation.isPending || comparisonVideoIds.length > 0}
                    className="w-full py-2 bg-purple-600/80 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-1 text-xs"
                    title="Kling 2.0으로 단독 생성"
                  >
                    {generateComparisonMutation.isPending || comparisonVideoIds.length > 0 ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : null}
                    Kling
                  </button>
                  <div className="flex gap-1">
                    {[5, 10].map((sec) => (
                      <button
                        key={sec}
                        onClick={() => setKlingDuration(sec)}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${klingDuration === sec ? "bg-purple-600 border-purple-600 text-white" : "border-zinc-600 text-zinc-400 hover:border-purple-400"}`}
                      >
                        {sec}초
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 flex flex-col items-center gap-1">
                  <button
                    onClick={() => handleGenerateComparison(["veo-3.1"], veoDuration)}
                    disabled={generateComparisonMutation.isPending || comparisonVideoIds.length > 0}
                    className="w-full py-2 bg-green-600/80 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-1 text-xs"
                    title="Google Veo 3.1로 단독 생성"
                  >
                    {generateComparisonMutation.isPending || comparisonVideoIds.length > 0 ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : null}
                    Veo
                  </button>
                  <div className="flex gap-1">
                    {[5, 6, 7, 8].map((sec) => (
                      <button
                        key={sec}
                        onClick={() => setVeoDuration(sec)}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${veoDuration === sec ? "bg-green-600 border-green-600 text-white" : "border-zinc-600 text-zinc-400 hover:border-green-400"}`}
                      >
                        {sec}초
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Comparison generate polling (hidden per-video pollers) */}
            {comparisonVideoIds.map((vid) => (
              <VideoPolling key={vid} videoId={vid} onDone={handleComparisonPollingDone} />
            ))}

            {/* Side-by-side comparison panel */}
            {comparisonGroup && (
              <div className="space-y-3 p-4 bg-[#252525] border border-purple-500/30 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                    <span className="text-sm font-semibold text-[#e8e8e8]">모델 비교 결과</span>
                    {comparisonVideoIds.length > 0 && (
                      <span className="text-[10px] text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full">
                        {comparisonVideoIds.length}개 생성 중
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setComparisonGroup(null);
                      setComparisonVideoIds([]);
                    }}
                    className="text-[10px] text-[#6b7280] hover:text-[#e8e8e8] transition-colors"
                  >
                    닫기
                  </button>
                </div>

                <div className={`grid gap-3 ${comparisonGroup.ids.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                  {comparisonGroup.ids.map((id) => {
                    const completedVid = comparisonGroup.completed.find((v) => v.id === id);
                    const listVid = taskVideosList.find((v: Video) => v.id === id);
                    const model = completedVid?.model ?? listVid?.model ?? "";
                    const isGenerating = !completedVid;
                    const isDone = completedVid?.status === "done";
                    const isError = completedVid?.status === "error";

                    return (
                      <div
                        key={id}
                        className={`flex flex-col gap-2 p-2.5 rounded-lg border transition-all ${
                          isDone
                            ? "border-green-500/30 bg-[#1e2a1e]"
                            : isError
                            ? "border-red-500/20 bg-[#2a1e1e]"
                            : "border-[#3a3a3a] bg-[#1e1e1e]"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <ModelBadge model={model} />
                          {isGenerating && (
                            <span className="text-[10px] text-yellow-400 flex items-center gap-1">
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              생성 중
                            </span>
                          )}
                          {isDone && (
                            <span className="text-[10px] text-green-400 flex items-center gap-1">
                              <CheckCircle className="w-2.5 h-2.5" />
                              완료
                            </span>
                          )}
                          {isError && (
                            <span className="text-[10px] text-red-400 flex items-center gap-1">
                              <AlertCircle className="w-2.5 h-2.5" />
                              실패
                            </span>
                          )}
                        </div>

                        <div className="w-full aspect-video bg-[#111] rounded-lg overflow-hidden flex items-center justify-center">
                          {isDone && completedVid?.videoUrl ? (
                            <video
                              src={completedVid.videoUrl}
                              controls
                              className="w-full h-full object-contain"
                              playsInline
                            />
                          ) : isError ? (
                            <div className="text-center px-2">
                              <AlertCircle className="w-5 h-5 text-red-400 mx-auto mb-1" />
                              <p className="text-[10px] text-red-400 line-clamp-2">
                                {completedVid?.errorMessage || "생성 실패"}
                              </p>
                            </div>
                          ) : (
                            <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                          )}
                        </div>

                        {/* Veo cinematic prompt reveal (only for Veo cards, only when done) */}
                        {isDone && model === "veo-3.1" && completedVid?.prompt && completedVid.prompt !== prompt && (
                          <div className="rounded-md border border-purple-500/20 bg-purple-500/5 overflow-hidden">
                            <button
                              onClick={() =>
                                setExpandedVeoPrompts((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(id)) next.delete(id);
                                  else next.add(id);
                                  return next;
                                })
                              }
                              className="w-full flex items-center justify-between gap-1 px-2 py-1.5 text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                            >
                              <span>Veo 시네마틱 프롬프트</span>
                              <span className="text-[10px]">
                                {expandedVeoPrompts.has(id) ? "숨기기 ▲" : "보기 ▼"}
                              </span>
                            </button>
                            {expandedVeoPrompts.has(id) && (
                              <p className="px-2 pb-2 text-[10px] text-[#c4b5fd] italic leading-relaxed">
                                {completedVid.prompt}
                              </p>
                            )}
                          </div>
                        )}

                        {isDone && completedVid?.videoUrl && (
                          <a
                            href={completedVid.videoUrl}
                            download={`comparison-${model}.mp4`}
                            className="flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-[#9ca3af] hover:text-[#4a9cf6] bg-[#2e2e2e] hover:bg-[#333] rounded transition-colors"
                            title="다운로드"
                          >
                            <Download className="w-3 h-3" />
                            다운로드
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>

                {comparisonVideoIds.length === 0 && comparisonGroup.completed.length > 0 && (
                  <p className="text-[10px] text-center text-[#6b7280] mt-1">
                    모든 모델 생성이 완료되었습니다. 결과를 비교해보세요.
                  </p>
                )}
              </div>
            )}

            {/* Completed video */}
            {completedVideo && completedVideo.status === "done" && completedVideo.videoUrl && (
              <div className="space-y-3 p-4 bg-[#2e2e2e] border border-green-400/20 rounded-lg">
                <div className="flex items-center gap-2 text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm font-semibold">동영상 생성 완료!</span>
                </div>
                <video src={completedVideo.videoUrl} controls className="w-full rounded-lg max-h-72 bg-black" />
                <div className="flex gap-2">
                  <input
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="저장할 이름을 입력하세요"
                    className="flex-1 bg-[#1e1e1e] border border-[#3a3a3a] rounded-lg px-3 py-1.5 text-sm text-[#e8e8e8] placeholder-[#6b7280] focus:outline-none focus:border-[#4a9cf6]"
                  />
                  <button
                    onClick={handleSave}
                    disabled={updateVideoMutation.isPending}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    저장
                  </button>
                </div>
              </div>
            )}

            {completedVideo && completedVideo.status === "error" && (
              <div className="flex items-start gap-3 p-3.5 bg-[#2e2e2e] border border-red-400/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-red-400">동영상 생성 실패</p>
                  <p className="text-xs text-[#9ca3af] mt-0.5">{completedVideo.errorMessage || "알 수 없는 오류가 발생했습니다."}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Video Library */}
        <div className="w-[320px] flex-none flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-[#3a3a3a] bg-[#252525] flex items-center justify-between flex-none">
            <h2 className="text-xs font-semibold text-[#e8e8e8]">이 태스크의 동영상</h2>
            <span className="text-[10px] text-[#6b7280]">{taskVideosList.length}개</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Auto-poll any generating videos that exist from previous sessions */}
            {taskVideosList
              .filter((v: Video) => v.status === "generating")
              .map((v: Video) => (
                <VideoPolling
                  key={v.id}
                  videoId={v.id}
                  onDone={() => {
                    queryClient.invalidateQueries({ queryKey: getListVideosQueryKey({ videoTaskId: taskId }) });
                    queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
                  }}
                />
              ))}
            {taskVideosList.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-[#6b7280] py-12">
                <Film className="w-10 h-10 opacity-30" />
                <p className="text-xs text-center">아직 생성된 동영상이 없습니다.<br />왼쪽에서 생성해보세요.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#3a3a3a]">
                {taskVideosList.map((video: Video) => (
                  <div key={video.id} className="flex flex-col gap-2 p-3.5 hover:bg-[#2e2e2e] transition-colors">
                    <div className="w-full aspect-video bg-[#333] rounded overflow-hidden">
                      {video.status === "done" && video.videoUrl ? (
                        <video src={video.videoUrl} controls className="w-full h-full object-cover" muted />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {video.status === "generating" ? (
                            <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />
                          ) : (
                            <Film className="w-5 h-5 text-[#6b7280]" />
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#e8e8e8] truncate">{video.name}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[10px] text-[#9ca3af] bg-[#333] px-1.5 py-0.5 rounded">
                            {video.sourceType === "i2v" ? "이미지→동영상" : "동영상→동영상"}
                          </span>
                          <ModelBadge model={video.model} />
                          <StatusBadge status={video.status} />
                        </div>
                        {video.status === "error" && video.errorMessage && (
                          <p className="text-[10px] text-red-400 mt-1 truncate">{video.errorMessage}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        {video.status === "done" && video.videoUrl && (
                          <a
                            href={video.videoUrl}
                            download={`${video.name}.mp4`}
                            className="p-1.5 text-[#9ca3af] hover:text-[#4a9cf6] hover:bg-[#333] rounded transition-colors"
                            title="다운로드"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => handleDelete(video.id)}
                          disabled={deleteVideoMutation.isPending}
                          className="p-1.5 text-[#9ca3af] hover:text-red-400 hover:bg-[#333] rounded transition-colors disabled:opacity-50"
                          title="삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
