"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Check, Sparkles } from "lucide-react";

const DEMO_LINK = "https://v.douyin.com/iY7xK9Pn/";
const DEMO_MOD = "把产品换成我们的护肤精华";
const VIDEO_SRC =
  "https://vc-upload.yeadon.top/files/vidclaw-assets/showcase/skincare.mp4";
const VIDEO_POSTER = "/showcase/skincare.jpg";

type Phase =
  | "idle"
  | "typing-link"
  | "typing-mod"
  | "clicking"
  | "analyzing"
  | "scripting"
  | "rendering"
  | "result";

const PROGRESS_STEPS = [
  { key: "analyzing" as const, label: "分析视频内容" },
  { key: "scripting" as const, label: "生成创意脚本" },
  { key: "rendering" as const, label: "渲染视频" },
];

export function HeroDemoAnimation() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [linkText, setLinkText] = useState("");
  const [modText, setModText] = useState("");
  const [btnPressed, setBtnPressed] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  /* Preload video on mount so it's cached by result phase */
  useEffect(() => {
    const v = document.createElement("video");
    v.preload = "auto";
    v.src = VIDEO_SRC;
  }, []);

  /* Pause animation when page is hidden */
  useEffect(() => {
    const handler = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  /* Cleanup */
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  /* ── State machine ── */
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // Don't advance animation when page is hidden
    if (!pageVisible) return;

    switch (phase) {
      case "idle":
        setLinkText("");
        setModText("");
        setBtnPressed(false);
        /* Delay pause so video keeps playing during exit transition */
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.currentTime = 0;
          }
        }, 350);
        timerRef.current = setTimeout(() => setPhase("typing-link"), 1200);
        break;

      case "typing-link": {
        let i = 0;
        const tick = () => {
          if (i < DEMO_LINK.length) {
            const next = Math.min(
              i + (Math.random() > 0.7 ? 3 : 2),
              DEMO_LINK.length,
            );
            setLinkText(DEMO_LINK.slice(0, next));
            i = next;
            timerRef.current = setTimeout(tick, 35 + Math.random() * 25);
          } else {
            timerRef.current = setTimeout(() => setPhase("typing-mod"), 500);
          }
        };
        tick();
        break;
      }

      case "typing-mod": {
        let i = 0;
        const tick = () => {
          if (i < DEMO_MOD.length) {
            setModText(DEMO_MOD.slice(0, ++i));
            timerRef.current = setTimeout(tick, 70 + Math.random() * 50);
          } else {
            timerRef.current = setTimeout(() => setPhase("clicking"), 700);
          }
        };
        tick();
        break;
      }

      case "clicking":
        setBtnPressed(true);
        timerRef.current = setTimeout(() => {
          setBtnPressed(false);
          setPhase("analyzing");
        }, 400);
        break;

      case "analyzing":
        timerRef.current = setTimeout(() => setPhase("scripting"), 1400);
        break;

      case "scripting":
        timerRef.current = setTimeout(() => setPhase("rendering"), 1400);
        break;

      case "rendering":
        timerRef.current = setTimeout(() => setPhase("result"), 2000);
        break;

      case "result":
        timerRef.current = setTimeout(() => setPhase("idle"), 6000);
        break;
    }
  }, [phase, pageVisible]);

  const isGenerating = ["analyzing", "scripting", "rendering"].includes(phase);
  const showResult = phase === "result";

  const stepStatus = (key: string) => {
    const order = ["analyzing", "scripting", "rendering", "result"];
    const ci = order.indexOf(phase);
    const si = order.indexOf(key);
    if (ci < 0) return "pending";
    return si < ci ? "done" : si === ci ? "active" : "pending";
  };

  return (
    <div className="relative w-full">
      {/* Glow */}
      <div className="absolute -inset-4 rounded-3xl bg-[var(--vc-accent)]/8 blur-2xl" />

      <div className="relative overflow-hidden rounded-2xl border border-[var(--vc-accent)]/15 bg-[var(--vc-bg-surface)]/80 shadow-2xl shadow-[var(--vc-accent)]/5 backdrop-blur-sm">
        {/* ── Tab bar ── */}
        <div className="flex gap-1 border-b border-[var(--vc-border)]/50 px-4 pt-3 pb-2.5">
          {["URL模式", "视频模式", "主题模式"].map((t, i) => (
            <span
              key={t}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                i === 0
                  ? "bg-[var(--vc-accent)]/15 text-[var(--vc-accent)]"
                  : "text-[var(--vc-text-secondary)]"
              }`}
            >
              {t}
            </span>
          ))}
        </div>

        {/* Always-mounted video (hidden when not result phase, so it stays loaded) */}
        <video
          ref={videoRef}
          preload="auto"
          muted
          loop
          playsInline
          className="absolute inset-0 h-0 w-0 opacity-0 pointer-events-none"
        >
          <source src={VIDEO_SRC} type="video/mp4" />
        </video>

        {/* ── Content area ── */}
        <AnimatePresence mode="wait">
          {showResult ? (
            /* ── Result view ── */
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[var(--vc-success)]" />
                  <span className="text-sm font-semibold text-[var(--vc-success)]">
                    生成完成
                  </span>
                </div>

                {/* Single video player — renders from the always-mounted video via canvas or just uses a second element */}
                <div className="mx-auto max-w-[220px]">
                  <div
                    className="overflow-hidden rounded-xl shadow-lg shadow-black/30"
                    style={{ aspectRatio: "9/16" }}
                  >
                    <video
                      poster={VIDEO_POSTER}
                      src={VIDEO_SRC}
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="mt-2 text-center text-xs text-[var(--vc-text-secondary)]">
                    护肤精华液 · AI 生成
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            /* ── Input + Progress view ── */
            <motion.div
              key="inputs"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <div className="space-y-2.5 px-4 pt-4 pb-3">
                {/* URL input */}
                <div className="flex items-center rounded-lg border border-[var(--vc-border)] bg-[var(--vc-bg-root)] px-3 py-2.5 min-h-[42px]">
                  {linkText ? (
                    <span className="text-sm text-white font-mono truncate">
                      {linkText}
                    </span>
                  ) : (
                    <span className="text-sm text-slate-600">
                      粘贴抖音链接...
                    </span>
                  )}
                  {(phase === "idle" || phase === "typing-link") && (
                    <span className="ml-0.5 inline-block h-4 w-[2px] shrink-0 animate-pulse bg-[var(--vc-accent)]" />
                  )}
                </div>

                {/* Modification input */}
                <div className="flex items-center rounded-lg border border-[var(--vc-border)] bg-[var(--vc-bg-root)] px-3 py-2.5 min-h-[42px]">
                  <span className="text-xs text-slate-500 shrink-0 mr-1.5">
                    修改:
                  </span>
                  {modText && (
                    <span className="text-sm text-white truncate">
                      {modText}
                    </span>
                  )}
                  {phase === "typing-mod" && (
                    <span className="ml-0.5 inline-block h-4 w-[2px] shrink-0 animate-pulse bg-[var(--vc-accent)]" />
                  )}
                </div>

                {/* Tags + Generate button */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex gap-1.5">
                    {["9:16", "15s", "VEO 3.1"].map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-[var(--vc-border)] bg-[var(--vc-bg-root)] px-2 py-0.5 text-[10px] font-semibold text-slate-500"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <button
                    className={`rounded-full px-5 py-2 text-sm font-bold transition-all duration-150 ${
                      btnPressed
                        ? "scale-90 bg-[var(--vc-accent)]/70 text-[var(--vc-bg-root)]"
                        : isGenerating
                          ? "bg-[var(--vc-accent)]/40 text-[var(--vc-bg-root)]"
                          : "bg-[var(--vc-accent)] text-[var(--vc-bg-root)] shadow-[0_0_16px_rgba(13,204,242,0.3)]"
                    }`}
                  >
                    {isGenerating ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        生成中
                      </span>
                    ) : (
                      "生成"
                    )}
                  </button>
                </div>
              </div>

              {/* Progress steps */}
              {isGenerating && (
                <div className="border-t border-[var(--vc-border)]/50 px-4 py-3 space-y-2">
                  {PROGRESS_STEPS.map(({ key, label }) => {
                    const st = stepStatus(key);
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-2.5 text-sm"
                      >
                        {st === "done" ? (
                          <Check className="h-4 w-4 text-[var(--vc-success)]" />
                        ) : st === "active" ? (
                          <Loader2 className="h-4 w-4 animate-spin text-[var(--vc-accent)]" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border border-[var(--vc-border)]" />
                        )}
                        <span
                          className={
                            st === "done"
                              ? "text-slate-300"
                              : st === "active"
                                ? "text-[var(--vc-accent)]"
                                : "text-slate-600"
                          }
                        >
                          {label}
                          {st === "active" && "..."}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
