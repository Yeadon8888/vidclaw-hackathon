"use client";

import { Download, Clock, CheckCircle, XCircle, Loader2, AlertTriangle, CalendarClock } from "lucide-react";
import type { Task } from "@/lib/db/schema";

const EXPIRY_DAYS = 7;

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
      {/* Expiry notice banner */}
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
        <p className="text-sm text-amber-300/90">
          生成的视频将在 <span className="font-medium text-amber-200">7 天</span> 后自动清除，请及时下载保存
        </p>
      </div>

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
