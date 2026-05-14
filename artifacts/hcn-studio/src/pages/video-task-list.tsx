import { useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  useListVideoTasks,
  useCreateVideoTask,
  useUpdateVideoTask,
  useDeleteVideoTask,
  getListVideoTasksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Film } from "lucide-react";

function formatDate(dateInput: string | Date) {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function VideoTaskList() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [newTaskName, setNewTaskName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editingTaskName, setEditingTaskName] = useState("");

  const { data: tasks, isLoading } = useListVideoTasks();
  const createTaskMutation = useCreateVideoTask();
  const updateTaskMutation = useUpdateVideoTask();
  const deleteTaskMutation = useDeleteVideoTask();

  const handleCreateTask = async () => {
    const name = newTaskName.trim();
    if (!name) return;
    setIsCreating(true);
    try {
      const task = await createTaskMutation.mutateAsync({ data: { name } });
      queryClient.invalidateQueries({ queryKey: getListVideoTasksQueryKey() });
      setNewTaskName("");
      navigate(`/videos/${task.id}`);
    } catch {
      toast({ variant: "destructive", title: "태스크 생성에 실패했습니다." });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTask = async (e: React.MouseEvent, taskId: number) => {
    e.stopPropagation();
    if (!confirm("이 태스크를 삭제하시겠습니까?")) return;
    try {
      await deleteTaskMutation.mutateAsync({ id: taskId });
      queryClient.invalidateQueries({ queryKey: getListVideoTasksQueryKey() });
      toast({ title: "태스크가 삭제되었습니다." });
    } catch {
      toast({ variant: "destructive", title: "태스크 삭제에 실패했습니다." });
    }
  };

  const renameCommittedRef = useRef(false);

  const startEditing = (e: React.MouseEvent, task: { id: number; name: string }) => {
    e.stopPropagation();
    renameCommittedRef.current = false;
    setEditingTaskId(task.id);
    setEditingTaskName(task.name);
  };

  const cancelRename = () => {
    renameCommittedRef.current = true;
    setEditingTaskId(null);
  };

  const commitRename = async (taskId: number) => {
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
  };

  const sortedTasks = tasks ? [...tasks] : [];

  return (
    <div className="max-w-[1000px] mx-auto px-6 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#e8e8e8]">동영상 태스크</h1>
        <p className="text-sm text-[#9ca3af] mt-1">AI 동영상 생성 태스크를 관리합니다.</p>
      </div>

      <div className="flex gap-2">
        <input
          value={newTaskName}
          onChange={(e) => setNewTaskName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateTask()}
          placeholder="새 태스크 이름..."
          className="flex-1 bg-[#252525] border border-[#3a3a3a] rounded-lg px-4 py-2 text-sm text-[#e8e8e8] placeholder-[#555] focus:outline-none focus:border-[#4a9cf6]"
        />
        <button
          onClick={handleCreateTask}
          disabled={!newTaskName.trim() || isCreating}
          className="flex items-center gap-2 px-4 py-2 bg-[#4a9cf6] hover:bg-[#3a8ce6] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          태스크 만들기
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#4a9cf6] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sortedTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-[#6b7280]">
          <Film className="w-14 h-14 opacity-30" />
          <div className="text-center">
            <p className="text-base font-medium text-[#9ca3af]">태스크가 없습니다.</p>
            <p className="text-sm mt-1">위 입력창에서 첫 번째 태스크를 만들어보세요.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedTasks.map((task) => {
            const isEditing = editingTaskId === task.id;
            return (
              <div
                key={task.id}
                onClick={() => !isEditing && navigate(`/videos/${task.id}`)}
                className="group relative bg-[#252525] border border-[#3a3a3a] hover:border-[#4a9cf6] rounded-xl p-5 cursor-pointer transition-all hover:bg-[#2a2a2a]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Film className="w-4 h-4 text-[#4a9cf6] flex-shrink-0" />
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
                          className="flex-1 min-w-0 text-sm font-semibold px-1.5 py-0.5 bg-[#1e1e1e] border border-[#4a9cf6] rounded text-[#e8e8e8] outline-none"
                        />
                      ) : (
                        <h3
                          onDoubleClick={(e) => startEditing(e, task)}
                          className="text-sm font-semibold text-[#e8e8e8] truncate"
                          title="더블클릭해서 이름 변경"
                        >
                          {task.name}
                        </h3>
                      )}
                    </div>
                    <p className="text-xs text-[#9ca3af]">
                      생성일: {formatDate(task.createdAt)}
                    </p>
                    <p className="text-xs text-[#555] mt-0.5">#{task.id}</p>
                  </div>
                  {!isEditing && (
                    <button
                      onClick={(e) => handleDeleteTask(e, task.id)}
                      disabled={deleteTaskMutation.isPending}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-[#6b7280] hover:text-red-400 hover:bg-[#333] rounded-lg transition-all disabled:opacity-50"
                      title="삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
