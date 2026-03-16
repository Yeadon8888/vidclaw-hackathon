"use client";

import { useState, useRef } from "react";
import { Send, Upload, X, Film, Zap, CalendarClock } from "lucide-react";
import { useGenerateStore, type PollResult } from "@/stores/generate";
import { ParamBar } from "@/components/generate/ParamBar";
import { ProcessLog } from "@/components/generate/ProcessLog";
import { ScriptOutput } from "@/components/generate/ScriptOutput";
import { VideoResults } from "@/components/generate/VideoResults";

interface SSEEvent {
  type: string;
  message?: string;
  stage?: string;
  data?: unknown;
  urls?: string[];
  code?: string;
  sora_prompt?: string;
  taskIds?: string[];
}

const VIDEO_URL_PATTERN =
  /https?:\/\/[^\s<>"']*(?:douyin|tiktok|v\.douyin)[^\s<>"']*/i;

export default function GeneratePage() {
  const [input, setInput] = useState("");
  const [pendingVideo, setPendingVideo] = useState<{ url: string; name: string; sizeMB: string } | null>(null);
  const [scheduled, setScheduled] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef(false);

  const stage = useGenerateStore((s) => s.stage);
  const errorMessage = useGenerateStore((s) => s.errorMessage);
  const reset = useGenerateStore((s) => s.reset);
  const setStage = useGenerateStore((s) => s.setStage);
  const addLog = useGenerateStore((s) => s.addLog);
  const setScript = useGenerateStore((s) => s.setScript);
  const setVideoUrls = useGenerateStore((s) => s.setVideoUrls);
  const setError = useGenerateStore((s) => s.setError);
  const setPollResults = useGenerateStore((s) => s.setPollResults);
  const params = useGenerateStore((s) => s.params);

  const isLoading = !["IDLE", "DONE", "ERROR"].includes(stage);

  async function startGenerate(body: {
    type: "theme" | "video_key" | "url";
    input: string;
    modification?: string;
  }) {
    reset();
    setStage("ANALYZE");
    pollingRef.current = false;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, params, scheduled }),
      });

      if (!res.ok) {
        setError("HTTP_ERROR", `请求失败: HTTP ${res.status}`);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (!json) continue;

          let event: SSEEvent;
          try {
            event = JSON.parse(json);
          } catch {
            continue;
          }

          if (event.type === "stage") {
            setStage(event.stage as typeof stage);
          } else if (event.type === "log") {
            addLog(event.message ?? "");
          } else if (event.type === "script") {
            setScript(event.data as Parameters<typeof setScript>[0]);
          } else if (event.type === "videos") {
            setVideoUrls(event.urls ?? []);
          } else if (event.type === "tasks") {
            const taskIds = event.taskIds ?? [];
            if (taskIds.length > 0) {
              pollingRef.current = true;
              setStage("POLL");
              addLog(`任务已提交: ${taskIds.join(", ").slice(0, 60)}`);
              pollSoraTasks(taskIds, event.sora_prompt);
            }
          } else if (event.type === "error") {
            setError(
              event.code ?? "UNKNOWN",
              event.message ?? "未知错误",
              event.sora_prompt
            );
          } else if (event.type === "done") {
            if (!pollingRef.current) {
              setStage("DONE");
            }
          }
        }
      }
    } catch (e) {
      setError("NETWORK", String(e));
      pollingRef.current = false;
    }
  }

  async function pollSoraTasks(taskIds: string[], soraPrompt?: string) {
    const POLL_INTERVAL = 15_000;
    const MAX_POLLS = 40;
    const STALE_LIMIT = 5;

    let lastProgressKey = "";
    let staleCount = 0;

    for (let poll = 0; poll < MAX_POLLS; poll++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));

      try {
        const res = await fetch(
          `/api/generate/status?taskIds=${encodeURIComponent(taskIds.join(","))}`
        );
        if (!res.ok) {
          addLog(`[轮询] #${poll + 1} 失败: HTTP ${res.status}`);
          continue;
        }

        const data = await res.json();
        const results = data.results as PollResult[];
        setPollResults(results);

        for (const r of results) {
          addLog(
            `[轮询] ${r.taskId.slice(0, 14)}... 状态=${r.status} 进度=${r.progress}`
          );
        }

        if (data.allDone) {
          const successUrls = results
            .filter((r) => r.status === "SUCCESS" && r.url)
            .map((r) => r.url!);

          if (successUrls.length > 0) {
            setVideoUrls(successUrls);
            setStage("DONE");
          } else {
            const reasons = results
              .filter((r) => r.status === "FAILED")
              .map((r) => r.failReason ?? "未知原因")
              .join("; ");
            setError("SORA_FAILED", `视频生成失败: ${reasons}`, soraPrompt);
          }
          pollingRef.current = false;
          return;
        }

        const currentKey = results
          .map((r) => `${r.taskId}:${r.status}:${r.progress}`)
          .join("|");
        const maxProgress = Math.max(
          ...results.map((r) => parseInt(r.progress) || 0)
        );

        if (currentKey === lastProgressKey) {
          if (maxProgress < 80) staleCount++;
          if (staleCount >= STALE_LIMIT) {
            setError(
              "POLL_STALE",
              `视频生成进度停滞，请检查任务后台。`,
              soraPrompt
            );
            pollingRef.current = false;
            return;
          }
        } else {
          staleCount = 0;
          lastProgressKey = currentKey;
        }
      } catch (e) {
        addLog(`[轮询] 异常: ${String(e).slice(0, 100)}`);
      }
    }

    setError("POLL_TIMEOUT", "视频生成超时，请检查任务后台。", soraPrompt);
    pollingRef.current = false;
  }

  function handleSend() {
    const text = input.trim();
    if (isLoading) return;

    // Video remix mode: pending video uploaded
    if (pendingVideo) {
      const modification = text || undefined;
      setInput("");
      const videoUrl = pendingVideo.url;
      setPendingVideo(null);
      startGenerate({
        type: "video_key",
        input: videoUrl,
        modification,
      });
      return;
    }

    if (!text) return;
    setInput("");

    const isUrl = VIDEO_URL_PATTERN.test(text);
    startGenerate({
      type: isUrl ? "url" : "theme",
      input: text,
    });
  }

  async function handleVideoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";

    // Upload the video first, then wait for user to confirm
    reset();
    setStage("DOWNLOAD");
    addLog("正在上传视频...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/assets/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        setError("UPLOAD_FAILED", `视频上传失败: HTTP ${uploadRes.status}`);
        return;
      }

      const asset = await uploadRes.json();
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      addLog(`视频已上传 (${sizeMB} MB)，请调整参数后点击发送`);

      // Store pending video — don't start generation yet
      setPendingVideo({ url: asset.url, name: file.name, sizeMB });
      setStage("IDLE");
    } catch (err) {
      setError("UPLOAD_FAILED", String(err));
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* ═══ Title ═══ */}
      <div className="pt-4 text-center sm:pt-8 space-y-4">
        <h1 className="text-4xl font-black tracking-tight md:text-6xl">
          <span className="bg-gradient-to-r from-white via-slate-200 to-[var(--vc-accent)] bg-clip-text text-transparent">
            AI 视频生成
          </span>
        </h1>
        <p className="text-lg text-slate-400">粘贴链接、上传视频或描述主题，AI 一键出片</p>
      </div>

      {/* ═══ Main Input Card ═══ */}
      <div className="rounded-xl border border-[var(--vc-border)] bg-[var(--vc-bg-surface)] p-2 shadow-2xl">
        {/* Input area */}
        <div className="flex items-start gap-4 p-4" style={{ minHeight: 160 }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="mt-2 shrink-0 text-[var(--vc-accent)] transition-all duration-150 hover:scale-110 disabled:opacity-40"
            title="上传视频进行二创"
          >
            <Upload className="h-7 w-7" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleVideoFile}
          />

          <div className="flex-1">
            {pendingVideo && (
              <div className="mb-2 flex items-center gap-2 rounded-full bg-[var(--vc-accent)]/10 px-3 py-1.5">
                <Film className="h-4 w-4 shrink-0 text-[var(--vc-accent)]" />
                <span className="truncate text-sm text-[var(--vc-accent)]">
                  {pendingVideo.name} ({pendingVideo.sizeMB} MB)
                </span>
                <button
                  onClick={() => setPendingVideo(null)}
                  className="ml-auto shrink-0 rounded-full p-1 text-[var(--vc-accent)]/60 transition-colors hover:bg-[var(--vc-accent)]/20 hover:text-[var(--vc-accent)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={pendingVideo ? "输入修改提示（可选），然后点击发送..." : "粘贴抖音/TikTok 链接，或输入创意主题..."}
              rows={3}
              disabled={isLoading}
              className="h-32 w-full resize-none bg-transparent text-xl text-slate-100 placeholder-slate-600 outline-none md:text-2xl"
            />
          </div>
        </div>

        {/* Params bar + Generate button */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--vc-border)]/50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <ParamBar />
          </div>
          <div className="flex items-center gap-3">
            {/* Scheduled toggle */}
            <button
              onClick={() => setScheduled((p) => !p)}
              disabled={isLoading}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all ${
                scheduled
                  ? "border-purple-500/40 bg-purple-500/10 text-purple-300"
                  : "border-[var(--vc-border)] text-[var(--vc-text-muted)] hover:border-purple-500/30 hover:text-purple-300"
              }`}
              title="开启后任务将在凌晨 2:00 自动执行（成功率更高）"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              定时托管
            </button>
            <button
              onClick={handleSend}
              disabled={(!input.trim() && !pendingVideo) || isLoading}
              className="vc-glow-btn flex items-center gap-2 px-8 py-3 text-sm"
            >
              <Zap className="h-4 w-4" />
              {scheduled ? "定时生成" : "生成"}
            </button>
          </div>
        </div>
      </div>

      {/* ═══ Quick Examples ═══ */}
      {stage === "IDLE" && !errorMessage && (
        <div className="space-y-6">
          {/* Example cards */}
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { title: "🔗 链接二创", desc: "粘贴抖音/TikTok 视频链接" },
              { title: "📁 上传视频", desc: "上传本地视频进行 AI 二创" },
              { title: "✨ 主题生产", desc: "描述产品主题，从零生成" },
            ].map(({ title, desc }) => (
              <button
                key={title}
                className="group rounded-xl border border-white/5 bg-[var(--vc-bg-surface)] p-5 text-left transition-all duration-300 hover:border-[var(--vc-accent)]/30"
                onClick={() => {
                  if (title.includes("上传")) {
                    fileInputRef.current?.click();
                  }
                }}
              >
                <div className="text-sm font-bold text-white">{title}</div>
                <div className="mt-1 text-sm text-slate-400">{desc}</div>
              </button>
            ))}
          </div>

          {/* 3-step flow */}
          <div className="grid gap-8 border-t border-[var(--vc-border)] pt-12 pb-8 md:grid-cols-3">
            {[
              { step: "01", title: "链接 / 主题", desc: "粘贴视频链接或输入产品主题，开始创作" },
              { step: "02", title: "AI 分析", desc: "Gemini 深度理解画面内容，生成英文脚本", active: false },
              { step: "03", title: "视频出片", desc: "VEO 3.1 / Sora 生成视频，自动配套文案", active: false },
            ].map(({ step, title, desc, active }, i) => (
              <div key={step} className={i > 0 ? "opacity-50" : ""}>
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-black text-[var(--vc-accent)]/30">{step}</span>
                  <div className="h-px flex-1 bg-[var(--vc-border)]" />
                </div>
                <h3 className="mt-4 font-bold text-slate-200">{title}</h3>
                <p className="mt-1 text-sm text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Error ═══ */}
      {errorMessage && (
        <div className="vc-animate-in rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {errorMessage}
          <button
            onClick={reset}
            className="ml-3 rounded-full bg-red-500/10 px-3 py-1 text-xs transition-colors hover:bg-red-500/20"
          >
            清除
          </button>
        </div>
      )}

      {/* ═══ Process Log ═══ */}
      <ProcessLog />

      {/* ═══ Script Output ═══ */}
      <ScriptOutput />

      {/* ═══ Video Results ═══ */}
      <VideoResults />
    </div>
  );
}
