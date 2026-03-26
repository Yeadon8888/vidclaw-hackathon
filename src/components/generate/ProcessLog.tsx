"use client";

import { useEffect, useRef } from "react";
import { useGenerateStore } from "@/stores/generate";

const stageLabels: Record<string, string> = {
  IDLE: "就绪",
  DOWNLOAD: "下载中",
  ANALYZE: "AI 分析",
  GENERATE: "提交任务",
  POLL: "等待生成",
  DONE: "完成",
  ERROR: "错误",
};

export function ProcessLog() {
  const stage = useGenerateStore((s) => s.stage);
  const logs = useGenerateStore((s) => s.logs);
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const distanceToBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const shouldStickToBottom = distanceToBottom < 48;

    if (shouldStickToBottom) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [logs]);

  if (stage === "IDLE" && logs.length === 0) return null;

  return (
    <div className="vc-card vc-animate-in overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[var(--vc-border)] px-4 py-2.5">
        <div
          className={`h-2 w-2 rounded-full ${
            stage === "ERROR"
              ? "bg-[var(--vc-error)]"
              : stage === "DONE"
                ? "bg-[var(--vc-success)]"
                : "animate-pulse bg-[var(--vc-accent)]"
          }`}
        />
        <span className="text-sm font-medium text-zinc-300">
          {stageLabels[stage] ?? stage}
        </span>
      </div>
      <div
        ref={containerRef}
        className="max-h-48 overflow-y-auto p-3 font-mono text-xs text-[var(--vc-text-muted)]"
      >
        {logs.map((log, i) => (
          <div key={i} className="py-0.5 leading-relaxed">
            {log}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
