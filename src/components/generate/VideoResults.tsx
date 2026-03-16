"use client";

import { Download } from "lucide-react";
import { useGenerateStore } from "@/stores/generate";

export function VideoResults() {
  const videoUrls = useGenerateStore((s) => s.videoUrls);
  const pollResults = useGenerateStore((s) => s.pollResults);

  // Show polling progress if polling is active
  if (pollResults.length > 0) {
    const allDone = pollResults.every(
      (r) => r.status === "SUCCESS" || r.status === "FAILED"
    );

    return (
      <div className="vc-card vc-animate-in p-4">
        <h3 className="mb-3 text-sm font-semibold text-zinc-300">
          生成进度 {!allDone && <span className="animate-pulse text-[var(--vc-accent)]">●</span>}
        </h3>
        <div className="space-y-2">
          {pollResults.map((r) => (
            <div
              key={r.taskId}
              className="flex items-center justify-between rounded-[var(--vc-radius-md)] border border-[var(--vc-border)] bg-[var(--vc-bg-root)]/50 px-3 py-2"
            >
              <span className="font-mono text-xs text-[var(--vc-text-muted)]">
                {r.taskId.slice(0, 12)}…
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs tabular-nums text-[var(--vc-text-secondary)]">{r.progress}</span>
                <span
                  className={`rounded-[var(--vc-radius-sm)] px-1.5 py-0.5 text-xs font-medium ${
                    r.status === "SUCCESS"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : r.status === "FAILED"
                        ? "bg-red-500/10 text-red-400"
                        : "bg-yellow-500/10 text-yellow-400"
                  }`}
                >
                  {r.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (videoUrls.length === 0) return null;

  return (
    <div className="vc-card vc-animate-in p-4">
      <h3 className="mb-3 text-sm font-semibold text-zinc-300">
        生成结果 ({videoUrls.length} 个视频)
      </h3>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        {videoUrls.map((url, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-[var(--vc-radius-lg)] border border-[var(--vc-border)] shadow-[var(--vc-shadow-sm)]"
          >
            <video
              src={url}
              controls
              className="aspect-video w-full bg-black"
            />
            <div className="flex items-center justify-between bg-[var(--vc-bg-surface)] px-3 py-2">
              <span className="text-xs text-[var(--vc-text-muted)]">视频 {i + 1}</span>
              <a
                href={url}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-[var(--vc-radius-sm)] px-2 py-1 text-xs text-[var(--vc-text-secondary)] transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                <Download className="h-3 w-3" />
                下载
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
