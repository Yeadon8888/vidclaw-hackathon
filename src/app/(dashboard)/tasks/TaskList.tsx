"use client";

import { Download, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import type { Task } from "@/lib/db/schema";

const statusConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  pending: { icon: Clock, color: "text-zinc-400", label: "等待中" },
  analyzing: { icon: Loader2, color: "text-blue-400", label: "分析中" },
  generating: { icon: Loader2, color: "text-purple-400", label: "生成中" },
  polling: { icon: Loader2, color: "text-yellow-400", label: "等待回片" },
  done: { icon: CheckCircle, color: "text-green-400", label: "完成" },
  failed: { icon: XCircle, color: "text-red-400", label: "失败" },
};

export function TaskList({ initialTasks }: { initialTasks: Task[] }) {
  if (initialTasks.length === 0) {
    return (
      <div className="vc-card p-8 text-center text-sm text-[var(--vc-text-muted)]">
        暂无任务记录
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {initialTasks.map((task) => {
        const cfg = statusConfig[task.status] ?? statusConfig.pending;
        const Icon = cfg.icon;
        const resultUrls = (task.resultUrls as string[]) ?? [];

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
                <span className={`text-sm ${cfg.color}`}>{cfg.label}</span>
                <span className="rounded-[var(--vc-radius-sm)] bg-[var(--vc-bg-elevated)] px-1.5 py-0.5 text-xs text-[var(--vc-text-muted)]">
                  {task.type}
                </span>
                {task.creditsCost > 0 && (
                  <span className="text-xs text-[var(--vc-text-muted)]">
                    -{task.creditsCost} 积分
                  </span>
                )}
              </div>
              <span className="text-xs text-[var(--vc-text-dim)]">
                {new Date(task.createdAt).toLocaleString("zh-CN")}
              </span>
            </div>

            {task.inputText && (
              <p className="mt-2 truncate text-sm text-[var(--vc-text-secondary)]">
                {task.inputText}
              </p>
            )}

            {task.errorMessage && (
              <p className="mt-2 text-xs text-[var(--vc-error)]">{task.errorMessage}</p>
            )}

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
  );
}
