"use client";

import { motion } from "framer-motion";

const tabs = ["URL模式", "视频模式", "主题模式"];
const thumbnails = [
  { label: "护肤品", gradient: "from-[#8B1A4A] to-[#4A0D28]" },
  { label: "3C数码", gradient: "from-[#0D3A6B] to-[#061E3A]" },
  { label: "服饰", gradient: "from-[#5C3A00] to-[#2E1D00]" },
];

export function HeroPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, rotate: 0 }}
      animate={{ opacity: 1, y: 0, rotate: -2 }}
      transition={{ duration: 0.5, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="relative w-full max-w-md"
    >
      {/* Shadow glow */}
      <div className="absolute -inset-4 rounded-3xl bg-[#4F8EFF]/8 blur-2xl" />

      {/* Main card */}
      <div className="relative overflow-hidden rounded-2xl border border-[#22263A] bg-[#12151C] shadow-2xl shadow-black/40">
        {/* Tab bar */}
        <div className="flex gap-1 border-b border-[#1A1D26] px-4 pt-4 pb-3">
          {tabs.map((tab, i) => (
            <span
              key={tab}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                i === 0
                  ? "bg-[#4F8EFF]/15 text-[#4F8EFF]"
                  : "text-[#8B8FA8] hover:text-white"
              }`}
            >
              {tab}
            </span>
          ))}
        </div>

        {/* Input area */}
        <div className="px-4 py-4">
          <div className="flex gap-2">
            <div className="flex-1 rounded-lg border border-[#22263A] bg-[#0D0F14] px-3 py-2.5 text-sm text-[#8B8FA8]">
              https://v.douyin.com/iY7xK9Pn/
            </div>
            <button className="shrink-0 rounded-lg bg-[#4F8EFF] px-4 py-2.5 text-sm font-semibold text-white">
              生成
            </button>
          </div>
        </div>

        {/* Video thumbnails */}
        <div className="flex gap-3 px-4 pb-5">
          {thumbnails.map((t, i) => (
            <motion.div
              key={t.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.6 + i * 0.1, ease: [0.4, 0, 0.2, 1] }}
              className="flex-1"
            >
              <div
                className={`flex aspect-[9/16] items-center justify-center rounded-lg bg-gradient-to-b ${t.gradient}`}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15">
                  <div className="ml-0.5 h-0 w-0 border-y-[4px] border-l-[7px] border-y-transparent border-l-white/80" />
                </div>
              </div>
              <div className="mt-1.5 text-center text-[11px] text-[#8B8FA8]">
                {t.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
