"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, Clock, CheckCircle, XCircle, Loader2, AlertTriangle, CalendarClock } from "lucide-react";
import type { Task, TaskGroup } from "@/lib/db/schema";
import type { TaskParamsSnapshot } from "@/lib/video/types";
import { getTaskSourceModeLabel } from "@/lib/tasks/presentation";
import { TaskGroupDownloadButton } from "@/components/tasks/TaskGroupDownloadButton";

const EXPIRY_DAYS = 3;
const POLL_INTERVAL = 15_000; // 15 seconds
const ACTIVE_STATUSES = ["pending", "analyzing", "generating", "polling"];
type TimelineItem =
  | { kind: "group"; createdAt: string | Date; id: string; group: TaskGroup }
  | { kind: "task"; createdAt: string | Date; id: string; task: Task };

function formatScheduledAt(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

const statusConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  pending: { icon: Clock, color: "text-zinc-400", label: "等待中" },
  analyzing: { icon: Loader2, color: "text-blue-400", label: "分析中" },
  generating: { icon: Loader2, color: "text-[var(--vc-accent)]", label: "生成中" },
  polling: { icon: Loader2, color: "text-yellow-400", label: "等待回片" },
  done: { icon: CheckCircle, color: "text-green-400", label: "完成" },
  failed: { icon: XCircle, color: "text-red-400", label: "失败" },
  scheduled: { icon: CalendarClock, color: "text-purple-400", label: "定时托管" },
};

function daysUntilExpiry(createdAt: string | Date): number {
  const created = new Date(createdAt);
  const expiry = new Date(created.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const now = new Date();
  return Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}

export function TaskList({
  initialTasks,
  initialTaskGroups,
}: {
  initialTasks: Task[];
  initialTaskGroups: TaskGroup[];
}) {
  const [taskList, setTaskList] = useState<Task[]>(initialTasks);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>(initialTaskGroups);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const taskListRef = useRef(taskList);
  const taskGroupRef = useRef(taskGroups);

  useEffect(() => {
    taskListRef.current = taskList;
  }, [taskList]);

  useEffect(() => {
    taskGroupRef.current = taskGroups;
  }, [taskGroups]);

  const timelineItems: TimelineItem[] = [...taskGroups.map((group) => ({
    kind: "group" as const,
    createdAt: group.createdAt,
    id: group.id,
    group,
  })), ...taskList.map((task) => ({
    kind: "task" as const,
    createdAt: task.createdAt,
    id: task.id,
    task,
  }))].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Stable refresh function via ref — no dependency on taskList
  useEffect(() => {
    const hasActive =
      taskList.some((t) => ACTIVE_STATUSES.includes(t.status)) ||
      taskGroups.some((group) => ACTIVE_STATUSES.includes(group.status));

    if (hasActive && !timerRef.current) {
      timerRef.current = setInterval(async () => {
        const currentTasks = taskListRef.current;
        const currentGroups = taskGroupRef.current;
        if (
          !currentTasks.some((t) => ACTIVE_STATUSES.includes(t.status)) &&
          !currentGroups.some((group) => ACTIVE_STATUSES.includes(group.status))
        ) {
          return;
        }
        try {
          const res = await fetch("/api/tasks/refresh");
          if (!res.ok) return;
          const data = await res.json();
          setTaskList(data.tasks);
          setTaskGroups(data.taskGroups ?? []);
        } catch {
          // silently ignore
        }
      }, POLL_INTERVAL);
    } else if (!hasActive && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [taskGroups, taskList]);

  if (taskList.length === 0 && taskGroups.length === 0) {
    return (
      <div className="vc-card p-8 text-center text-sm text-[var(--vc-text-muted)]">
        暂无任务记录
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Expiry notice banner */}
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
        <p className="text-sm text-amber-300/90">
          生成的视频将在 <span className="font-medium text-amber-200">3 天</span> 后自动清除，请及时下载保存
        </p>
      </div>

      {timelineItems.length > 0 && (
        <div className="space-y-3">
          {timelineItems.map((item) => {
            if (item.kind === "group") {
              const { group } = item;
            const cfg = statusConfig[group.status] ?? statusConfig.pending;
            const Icon = cfg.icon;
            return (
              <div
                key={group.id}
                className="vc-card p-4 transition-all duration-200 hover:shadow-[var(--vc-shadow-md)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon
                      className={`h-4 w-4 ${cfg.color} ${
                        ["analyzing", "generating", "polling"].includes(group.status)
                          ? "animate-spin"
                          : ""
                      }`}
                    />
                    <span className={`text-sm ${cfg.color}`}>{cfg.label}</span>
                    <span className="rounded-[var(--vc-radius-sm)] bg-[var(--vc-bg-elevated)] px-1.5 py-0.5 text-xs text-[var(--vc-text-muted)]">
                      批量带货
                    </span>
                    <span className="text-xs text-[var(--vc-text-muted)]">
                      {group.successCount}/{group.requestedCount} 成功
                    </span>
                  </div>
                  <span className="text-xs text-[var(--vc-text-dim)]">
                    {new Date(group.createdAt).toLocaleString("zh-CN")}
                  </span>
                </div>
                <p className="mt-2 truncate text-sm text-[var(--vc-text-secondary)]">
                  {group.title || group.batchTheme || "批量带货任务"}
                </p>
                {group.errorMessage && (
                  <p className="mt-2 text-xs text-[var(--vc-error)]">{group.errorMessage}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/tasks/groups/${group.id}`}
                    className="inline-flex items-center rounded-[var(--vc-radius-md)] border border-[var(--vc-border)] px-3 py-1 text-xs text-[var(--vc-text-secondary)] transition-colors hover:bg-white/[0.04] hover:text-white"
                  >
                    查看任务组
                  </Link>
                  <TaskGroupDownloadButton
                    groupId={group.id}
                    disabled={group.successCount === 0}
                  />
                </div>
              </div>
            );
            }

            const { task } = item;
            const cfg = statusConfig[task.status] ?? statusConfig.pending;
            const Icon = cfg.icon;
            const resultUrls = (task.resultUrls as string[]) ?? [];
            const params = task.paramsJson as { count?: number } | null;
            const requestedCount = params?.count ?? 1;
            const successCount = resultUrls.length;

            return (
              <div
                key={task.id}
                className="vc-card p-4 transition-all duration-200 hover:shadow-[var(--vc-shadow-md)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon
                      className={`h-4 w-4 ${cfg.color} ${
                        ["analyzing", "generating", "polling"].includes(task.status)
                          ? "animate-spin"
                          : ""
                      }`}
                    />
                    <span className={`text-sm ${cfg.color}`}>
                      {task.status === "done" && requestedCount > 1
                        ? `${successCount}/${requestedCount} 完成`
                        : cfg.label}
                    </span>
                    <span className="rounded-[var(--vc-radius-sm)] bg-[var(--vc-bg-elevated)] px-1.5 py-0.5 text-xs text-[var(--vc-text-muted)]">
                      {getTaskSourceModeLabel((task.paramsJson as TaskParamsSnapshot | null)?.sourceMode)}
                    </span>
                    {task.creditsCost > 0 && (
                      <span className="text-xs text-[var(--vc-text-muted)]">
                        -{task.creditsCost} 积分
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--vc-text-dim)]">
                    {new Date(task.createdAt).toLocaleString("zh-CN")}
                    {task.status === "done" && (() => {
                      const days = daysUntilExpiry(task.createdAt);
                      return (
                        <span className={`ml-2 ${days <= 2 ? "text-red-400" : "text-amber-400/70"}`}>
                          · {days > 0 ? `${days}天后过期` : "即将清除"}
                        </span>
                      );
                    })()}
                  </span>
                </div>

                {task.status === "scheduled" && task.scheduledAt && (
                  <p className="mt-2 text-xs text-purple-300/90">
                    预计执行：北京时间 {formatScheduledAt(task.scheduledAt)}
                  </p>
                )}

                {task.inputText && (
                  <p className="mt-2 truncate text-sm text-[var(--vc-text-secondary)]">
                    {task.inputText}
                  </p>
                )}

                {task.errorMessage && (
                  <p className="mt-2 text-xs text-[var(--vc-error)]">{task.errorMessage}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/tasks/${task.id}`}
                    className="inline-flex items-center rounded-[var(--vc-radius-md)] border border-[var(--vc-border)] px-3 py-1 text-xs text-[var(--vc-text-secondary)] transition-colors hover:bg-white/[0.04] hover:text-white"
                  >
                    查看详情
                  </Link>
                </div>

                {resultUrls.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {resultUrls.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-[var(--vc-radius-md)] border border-[var(--vc-border)] px-2 py-1 text-xs text-[var(--vc-text-secondary)] transition-colors hover:bg-white/[0.04] hover:text-white"
                      >
                        <Download className="h-3 w-3" />
                        视频 {i + 1}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
