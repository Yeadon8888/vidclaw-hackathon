"use client";

import { useEffect, useState } from "react";
import { useGenerateStore, type GenerateParams } from "@/stores/generate";

interface ModelOption {
  slug: string;
  name: string;
  creditsPerGen: number;
}

const FALLBACK_MODELS: ModelOption[] = [
  { slug: "veo3.1-fast", name: "VEO 3.1 Fast", creditsPerGen: 10 },
  { slug: "veo3.1-components", name: "VEO 3.1 Components", creditsPerGen: 10 },
  { slug: "veo3.1-pro-4k", name: "VEO 3.1 Pro 4K", creditsPerGen: 20 },
  { slug: "sora", name: "Sora", creditsPerGen: 15 },
];

const selectClass =
  "rounded-[var(--vc-radius-md)] bg-[var(--vc-bg-root)] border border-[var(--vc-border)] px-2.5 py-1.5 text-xs text-white outline-none cursor-pointer transition-colors duration-150 hover:border-zinc-600 focus:border-[var(--vc-accent)] sm:text-sm sm:px-3";

export function ParamBar() {
  const params = useGenerateStore((s) => s.params);
  const setParams = useGenerateStore((s) => s.setParams);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>(FALLBACK_MODELS);

  useEffect(() => {
    fetch("/api/generate/models")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.models?.length) setModelOptions(data.models);
      })
      .catch(() => {});
  }, []);

  const currentModel = modelOptions.find((m) => m.slug === params.model);
  const totalCredits = (currentModel?.creditsPerGen ?? 10) * params.count;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="hidden text-xs uppercase tracking-widest text-[var(--vc-text-dim)] sm:inline">
        参数
      </span>

      <select
        value={params.orientation}
        onChange={(e) =>
          setParams({ orientation: e.target.value as GenerateParams["orientation"] })
        }
        className={selectClass}
      >
        <option value="portrait">竖屏 9:16</option>
        <option value="landscape">横屏 16:9</option>
      </select>

      <select
        value={params.duration}
        onChange={(e) => setParams({ duration: Number(e.target.value) as 10 | 15 })}
        className={selectClass}
      >
        <option value={10}>10 秒</option>
        <option value={15}>15 秒</option>
      </select>

      <select
        value={params.count}
        onChange={(e) => setParams({ count: Number(e.target.value) })}
        className={selectClass}
      >
        {[1, 2, 3, 5, 10].map((n) => (
          <option key={n} value={n}>
            ×{n}
          </option>
        ))}
      </select>

      <select
        value={params.platform}
        onChange={(e) =>
          setParams({ platform: e.target.value as GenerateParams["platform"] })
        }
        className={selectClass}
      >
        <option value="douyin">抖音</option>
        <option value="tiktok">TikTok</option>
      </select>

      <select
        value={params.model}
        onChange={(e) => setParams({ model: e.target.value })}
        className={selectClass}
      >
        {modelOptions.map((m) => (
          <option key={m.slug} value={m.slug}>
            {m.name} ({m.creditsPerGen} 积分)
          </option>
        ))}
      </select>

      <span className="text-xs tabular-nums text-[var(--vc-accent)]">
        消耗 {totalCredits} 积分
      </span>
    </div>
  );
}
