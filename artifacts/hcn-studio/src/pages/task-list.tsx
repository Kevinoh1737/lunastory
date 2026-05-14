import { useState } from "react";
import { useLocation } from "wouter";
import { useListTasks, useCreateTask, useDeleteTask } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListTasksQueryKey } from "@workspace/api-client-react";
import { toast } from "@/hooks/use-toast";
import { formatRelativeTime } from "@/components/asset-creator-types";

export default function TaskList() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [newTaskName, setNewTaskName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const { data: tasks, isLoading } = useListTasks();
  const createTaskMutation = useCreateTask();
  const deleteTaskMutation = useDeleteTask();

  const handleCreateTask = async () => {
    const name = newTaskName.trim();
    if (!name) return;
    setIsCreating(true);
    try {
      const task = await createTaskMutation.mutateAsync({ data: { name } });
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      setNewTaskName("");
      navigate(`/tasks/${task.id}`);
    } catch {
      toast({ variant: "destructive", title: "테스크 생성에 실패했습니다." });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTask = async (e: React.MouseEvent, taskId: number) => {
    e.stopPropagation();
    if (!confirm("이 테스크를 삭제하시겠습니까?")) return;
    try {
      await deleteTaskMutation.mutateAsync({ id: taskId });
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      toast({ title: "테스크가 삭제되었습니다." });
    } catch {
      toast({ variant: "destructive", title: "테스크 삭제에 실패했습니다." });
    }
  };

  return (
    <div className="max-w-[1000px] mx-auto px-6 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#e8e8e8]">테스크</h1>
        <p className="text-sm text-[#9ca3af] mt-1">
          각 테스크별로 이미지를 생성하고 관리하세요.
        </p>
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          className="flex-1 h-10 px-3 bg-[#1e1e1e] border border-[#3a3a3a] rounded-lg text-sm text-[#e8e8e8] placeholder-[#9ca3af] focus:border-[#4a9cf6] focus:outline-none transition-colors"
          placeholder="새 테스크 이름 입력..."
          value={newTaskName}
          onChange={(e) => setNewTaskName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreateTask(); }}
        />
        <button
          onClick={handleCreateTask}
          disabled={!newTaskName.trim() || isCreating}
          className="px-5 py-2 bg-[#4a9cf6] hover:bg-[#3b82f6] text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {isCreating ? "생성 중..." : "+ 새 테스크"}
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#4a9cf6] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !tasks || tasks.length === 0 ? (
        <div className="border-2 border-dashed border-[#3a3a3a] rounded-xl flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 rounded-full bg-[#333] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#9ca3af]">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M12 8v8M8 12h8" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-[#e8e8e8]">아직 테스크가 없습니다</p>
            <p className="text-xs text-[#9ca3af] mt-1">위에서 새 테스크를 만들어 시작하세요.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...tasks].reverse().map((task) => (
            <div
              key={task.id}
              onClick={() => navigate(`/tasks/${task.id}`)}
              className="relative group bg-[#252525] border border-[#3a3a3a] rounded-xl p-5 cursor-pointer hover:border-[#4a9cf6] hover:shadow-[0_0_12px_rgba(74,156,246,0.15)] transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-[#e8e8e8] truncate">{task.name}</p>
                  <p className="text-xs text-[#9ca3af] mt-1">
                    {formatRelativeTime(task.createdAt instanceof Date ? task.createdAt.toISOString() : task.createdAt)}
                  </p>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 bg-[#1e1e1e] text-[#9ca3af] rounded font-mono border border-[#3a3a3a] shrink-0">
                  #{task.id}
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <button
                  onClick={(e) => handleDeleteTask(e, task.id)}
                  className="text-xs text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  삭제
                </button>
                <span className="text-xs text-[#4a9cf6] font-medium">열기 →</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
