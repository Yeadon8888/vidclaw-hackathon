"use client";

import { Link2, Video, Sparkles, FileText } from "lucide-react";
import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";

/* ── 大卡数据 ── */
const bigCards = [
  {
    icon: Link2,
    tag: "URL 模式",
    title: "链接二创",
    desc: "粘贴抖音/TikTok链接，AI自动生成新视频",
    gradient: "from-[#1A6FFF] to-[#0A3FCC]",
    mockup: "url",
  },
  {
    icon: Video,
    tag: "视频模式",
    title: "视频二创",
    desc: "上传参考视频，AI 理解画面后重新创作",
    gradient: "from-[#8B2FFF] to-[#5A1AB8]",
    mockup: "video",
  },
];

const smallCards = [
  {
    icon: Sparkles,
    tag: "主题模式",
    title: "主题生成",
    desc: "输入产品描述，AI从零生成完整广告视频",
    gradient: "from-[#FF6B2F] to-[#CC3A00]",
  },
  {
    icon: FileText,
    tag: "全自动",
    title: "文案自动生成",
    desc: "自动配套标题、正文、首评，可自定义 Prompt",
    gradient: "from-[#0FA86E] to-[#087A4E]",
  },
];

/* ── Mock 小 UI ── */
function UrlMockup() {
  return (
    <div className="flex flex-col gap-2 rotate-6 scale-90 origin-center">
      <div className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] text-white/60">
        v.douyin.com/iY7xK...
      </div>
      <div className="flex gap-1.5">
        <div className="aspect-[9/16] w-10 rounded bg-gradient-to-b from-[#8B1A4A] to-[#4A0D28]" />
        <div className="aspect-[9/16] w-10 rounded bg-gradient-to-b from-[#0D3A6B] to-[#061E3A]" />
      </div>
    </div>
  );
}

function VideoMockup() {
  return (
    <div className="flex flex-col items-center gap-2 rotate-6 scale-90 origin-center">
      <div className="flex h-12 w-16 items-center justify-center rounded-md border-2 border-dashed border-white/20 text-[10px] text-white/40">
        上传
      </div>
      <div className="flex gap-1.5">
        <div className="aspect-[9/16] w-10 rounded bg-gradient-to-b from-[#5C3A00] to-[#2E1D00]" />
        <div className="aspect-[9/16] w-10 rounded bg-gradient-to-b from-[#4A0068] to-[#25003A]" />
      </div>
    </div>
  );
}

export function FeatureCards() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
      className="space-y-4"
    >
      {/* 2 big cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {bigCards.map((card) => (
          <motion.div
            key={card.title}
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
            }}
            className={`group relative flex min-h-[220px] overflow-hidden rounded-2xl bg-gradient-to-br ${card.gradient} p-6 transition-all duration-200 hover:brightness-110 hover:scale-[1.015]`}
          >
            {/* Text side */}
            <div className="flex flex-1 flex-col justify-between">
              <div>
                <span className="inline-block rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white/80">
                  {card.tag}
                </span>
                <h3 className="mt-3 font-heading text-2xl font-bold text-white">
                  {card.title}
                </h3>
                <p className="mt-2 text-sm text-white/70">{card.desc}</p>
              </div>
              <span className="mt-4 text-lg text-white/50 transition-transform duration-200 group-hover:translate-x-1">
                →
              </span>
            </div>

            {/* Mockup side */}
            <div className="hidden flex-shrink-0 items-center sm:flex">
              {card.mockup === "url" ? <UrlMockup /> : <VideoMockup />}
            </div>
          </motion.div>
        ))}
      </div>

      {/* 2 small cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {smallCards.map((card) => (
          <motion.div
            key={card.title}
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
            }}
            className={`group flex items-center gap-4 rounded-2xl bg-gradient-to-br ${card.gradient} p-5 transition-all duration-200 hover:brightness-110 hover:scale-[1.015]`}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <card.icon className="h-5 w-5 text-white/80" />
            </div>
            <div className="min-w-0">
              <h3 className="font-heading text-base font-bold text-white">
                {card.title}
              </h3>
              <p className="mt-0.5 truncate text-sm text-white/60">{card.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
