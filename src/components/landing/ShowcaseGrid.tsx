"use client";

import { motion, useInView } from "framer-motion";
import { useRef, useCallback } from "react";
import Image from "next/image";

const showcaseItems = [
  {
    title: "护肤精华液",
    desc: "质地流动 · 特写广告",
    cat: "美妆个护",
    img: "/showcase/skincare.jpg",
    gradient: "from-[#8B1A4A] to-[#4A0D28]",
  },
  {
    title: "蓝牙耳机",
    desc: "沉浸开箱体验",
    cat: "3C 数码",
    img: "/showcase/headphones.jpg",
    gradient: "from-[#0D3A6B] to-[#061E3A]",
  },
  {
    title: "运动鞋",
    desc: "街拍穿搭展示",
    cat: "服饰鞋包",
    img: "/showcase/sneakers.jpg",
    gradient: "from-[#5C3A00] to-[#2E1D00]",
  },
  {
    title: "手冲咖啡",
    desc: "制作过程特写",
    cat: "食品饮料",
    img: "/showcase/coffee.jpg",
    gradient: "from-[#5C2800] to-[#2E1200]",
  },
  {
    title: "香氛蜡烛",
    desc: "光影氛围广告",
    cat: "家居生活",
    img: "/showcase/candle.jpg",
    gradient: "from-[#4A0068] to-[#25003A]",
  },
  {
    title: "机械键盘",
    desc: "敲击 ASMR",
    cat: "3C 数码",
    img: "/showcase/keyboard.jpg",
    gradient: "from-[#0D3A6B] to-[#061E3A]",
  },
  {
    title: "运动穿搭",
    desc: "瑜伽场景展示",
    cat: "服饰鞋包",
    img: "/showcase/yoga.jpg",
    gradient: "from-[#5C3A00] to-[#2E1D00]",
  },
  {
    title: "智能手表",
    desc: "功能演示短片",
    cat: "3C 数码",
    img: "/showcase/smartwatch.jpg",
    gradient: "from-[#0D3A6B] to-[#061E3A]",
  },
  {
    title: "萌宠试吃",
    desc: "猫粮种草视频",
    cat: "宠物用品",
    img: "/showcase/catfood.jpg",
    gradient: "from-[#8B1A4A] to-[#4A0D28]",
  },
];

export function ShowcaseGrid() {
  const ref = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!scrollRef.current) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      scrollRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  return (
    <div ref={ref}>
      {/* Desktop: horizontal scroll */}
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        className="hidden gap-4 overflow-x-auto pb-4 scrollbar-none sm:flex"
        style={{ scrollBehavior: "smooth" }}
      >
        {showcaseItems.map((item, i) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.3, delay: i * 0.05, ease: [0.4, 0, 0.2, 1] }}
            className="group relative w-[200px] shrink-0 overflow-hidden rounded-[14px] transition-all duration-200 hover:-translate-y-1 hover:scale-[1.03]"
          >
            {/* 9:16 card */}
            <div className="relative aspect-[9/16] overflow-hidden">
              <Image
                src={item.img}
                alt={item.title}
                fill
                className="object-cover"
                sizes="200px"
              />
              {/* Gradient overlay */}
              <div className={`absolute inset-0 bg-gradient-to-t ${item.gradient} opacity-40`} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />

              {/* Category pill */}
              <span className="absolute left-2.5 top-2.5 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-sm">
                {item.cat}
              </span>

              {/* Play button (hover) */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-10 w-10 scale-80 items-center justify-center rounded-full bg-white/15 opacity-0 backdrop-blur-sm transition-all duration-200 group-hover:scale-100 group-hover:opacity-100">
                  <div className="ml-0.5 h-0 w-0 border-y-[5px] border-l-[9px] border-y-transparent border-l-white/90" />
                </div>
              </div>

              {/* Bottom text */}
              <div className="absolute bottom-0 left-0 right-0 p-3 transition-transform duration-200 group-hover:-translate-y-1">
                <div className="text-sm font-semibold text-white">{item.title}</div>
                <div className="mt-0.5 text-[11px] text-white/60">{item.desc}</div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Mobile: 2-column grid */}
      <div className="grid grid-cols-2 gap-3 sm:hidden">
        {showcaseItems.slice(0, 6).map((item, i) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.3, delay: i * 0.05 }}
            className="group relative overflow-hidden rounded-xl"
          >
            <div className="relative aspect-[9/16] overflow-hidden">
              <Image
                src={item.img}
                alt={item.title}
                fill
                className="object-cover"
                sizes="50vw"
              />
              <div className={`absolute inset-0 bg-gradient-to-t ${item.gradient} opacity-40`} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
              <span className="absolute left-2 top-2 rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] text-white/80">
                {item.cat}
              </span>
              <div className="absolute bottom-0 left-0 right-0 p-2.5">
                <div className="text-xs font-semibold text-white">{item.title}</div>
                <div className="text-[10px] text-white/60">{item.desc}</div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
