import { useState } from "react";
import { useGetTask, useUpdateTask, getListTasksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Pencil } from "lucide-react";

interface TaskHeaderProps {
  taskId: number;
}

export function TaskHeader({ taskId }: TaskHeaderProps) {
  const queryClient = useQueryClient();
  const { data: task, isLoading } = useGetTask(taskId);
  const updateTaskMutation = useUpdateTask();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const startEdit = () => {
    setEditValue(task?.name ?? "");
    setIsEditing(true);
  };

  const commitEdit = async () => {
    const name = editValue.trim();
    if (!name || name === task?.name) {
      setIsEditing(false);
      return;
    }
    try {
      await updateTaskMutation.mutateAsync({ id: taskId, data: { name } });
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      toast({ title: "테스크 이름이 수정되었습니다." });
    } catch {
      toast({ variant: "destructive", title: "테스크 이름 수정에 실패했습니다." });
    } finally {
      setIsEditing(false);
    }
  };

  if (isLoading) {
    return <div className="h-5 w-32 bg-[#333] rounded animate-pulse" />;
  }

  if (isEditing) {
    return (
      <input
        autoFocus
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitEdit();
          if (e.key === "Escape") setIsEditing(false);
        }}
        className="text-sm font-medium bg-[#1e1e1e] border border-[#4a9cf6] rounded px-2 py-0.5 outline-none text-[#e8e8e8] w-48"
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      className="flex items-center gap-2 group hover:bg-[#333] px-2 py-1 rounded transition-colors"
      title="클릭하여 이름 수정"
    >
      <span className="text-[15px] font-medium text-[#e8e8e8] truncate max-w-[240px]">
        {task?.name ?? "..."}
      </span>
      <Pencil className="w-3.5 h-3.5 text-[#9ca3af] group-hover:text-[#4a9cf6] shrink-0 transition-colors" />
    </button>
  );
}
