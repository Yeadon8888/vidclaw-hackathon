"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { useGenerateStore } from "@/stores/generate";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-[var(--vc-radius-sm)] px-1.5 py-0.5 text-xs text-[var(--vc-text-muted)] transition-colors hover:bg-white/[0.04] hover:text-white"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "已复制" : "复制"}
    </button>
  );
}

export function ScriptOutput() {
  const script = useGenerateStore((s) => s.script);

  if (!script) return null;

  return (
    <div className="space-y-4">
      {/* 创意要点 */}
      <div className="vc-card vc-animate-in p-4">
        <h3 className="mb-2 text-sm font-semibold text-zinc-300">创意要点</h3>
        <ul className="list-inside list-disc space-y-1 text-sm text-[var(--vc-text-secondary)]">
          {script.creative_points.map((pt, i) => (
            <li key={i}>{pt}</li>
          ))}
        </ul>
      </div>

      {/* Hook + 剧情 */}
      <div className="vc-card vc-animate-in p-4" style={{ animationDelay: "50ms" }}>
        <div className="mb-2 text-sm text-[var(--vc-text-secondary)]">
          <span className="font-semibold text-purple-400">🎯 Hook：</span>
          {script.hook}
        </div>
        <div className="text-sm text-[var(--vc-text-secondary)]">{script.plot_summary}</div>
      </div>

      {/* 分镜 */}
      <div className="vc-card vc-animate-in p-4" style={{ animationDelay: "100ms" }}>
        <h3 className="mb-3 text-sm font-semibold text-zinc-300">分镜脚本</h3>
        <div className="space-y-2">
          {script.shots.map((shot) => (
            <div
              key={shot.id}
              className="rounded-[var(--vc-radius-md)] border border-[var(--vc-border)] bg-[var(--vc-bg-root)]/50 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-purple-400">
                  镜头 {shot.id} · {shot.camera} · {shot.duration_s}s
                </span>
                <CopyButton text={shot.sora_prompt} />
              </div>
              <p className="mt-1 text-sm text-zinc-300">{shot.scene_zh}</p>
              <p className="mt-1 text-xs text-[var(--vc-text-muted)]">{shot.sora_prompt}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Sora 完整提示词 */}
      <div className="vc-card vc-animate-in p-4" style={{ animationDelay: "150ms" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-300">完整 Sora Prompt</h3>
          <CopyButton text={script.full_sora_prompt} />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[var(--vc-text-secondary)]">
          {script.full_sora_prompt}
        </p>
      </div>

      {/* 文案 */}
      <div className="vc-card vc-animate-in p-4" style={{ animationDelay: "200ms" }}>
        <h3 className="mb-3 text-sm font-semibold text-zinc-300">配套文案</h3>
        <div className="space-y-2">
          {[
            { label: "标题", text: script.copy.title },
            { label: "正文", text: script.copy.caption },
            { label: "首评", text: script.copy.first_comment },
          ].map(({ label, text }) => (
            <div key={label} className="flex items-start gap-2">
              <span className="shrink-0 text-xs font-medium text-[var(--vc-text-muted)]">
                {label}
              </span>
              <p className="flex-1 text-sm text-zinc-300">{text}</p>
              <CopyButton text={text} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
