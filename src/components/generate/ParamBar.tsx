"use client";

import { useGenerateStore, type GenerateParams } from "@/stores/generate";

const selectClass =
  "rounded-[var(--vc-radius-md)] bg-[var(--vc-bg-root)] border border-[var(--vc-border)] px-2.5 py-1.5 text-xs text-white outline-none cursor-pointer transition-colors duration-150 hover:border-zinc-600 focus:border-purple-500 sm:text-sm sm:px-3";

export function ParamBar() {
  const params = useGenerateStore((s) => s.params);
  const setParams = useGenerateStore((s) => s.setParams);

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
        <option value="veo3.1-fast">VEO 3.1 Fast</option>
        <option value="veo3.1-components">VEO 3.1 Components</option>
        <option value="veo3.1-pro-4k">VEO 3.1 Pro 4K</option>
        <option value="sora">Sora</option>
      </select>
    </div>
  );
}
