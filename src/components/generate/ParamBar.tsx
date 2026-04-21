"use client";

import { useEffect, useMemo, useState } from "react";
import { useGenerateStore, type GenerateParams } from "@/stores/generate";
import {
  resolveModelSelectionPatch,
  type GenerateModelOption,
} from "@/components/generate/model-selection";
import type { GenerateTab } from "@/components/generate/generate-config";
import type { VideoDuration } from "@/lib/video/types";
import { LANGUAGES } from "@/lib/video/languages";

const selectClass =
  "rounded-full bg-[var(--vc-bg-root)] border border-[var(--vc-border)] px-3 py-2 text-xs text-white outline-none cursor-pointer transition-all duration-150 hover:border-[var(--vc-accent)]/50 focus:border-[var(--vc-accent)] sm:text-sm sm:px-4";

// Language options rendered directly from the shared SSOT. To add a new
// language, edit src/lib/video/languages.ts — do NOT duplicate the list here.
const LANGUAGE_OPTIONS: Array<{
  value: GenerateParams["outputLanguage"];
  label: string;
}> = LANGUAGES.map((lang) => ({
  value: lang.code as GenerateParams["outputLanguage"],
  label: lang.label,
}));

export function ParamBar(props: {
  activeTab: GenerateTab;
  batchProductCount?: number;
  batchUnitsPerProduct?: number;
}) {
  const params = useGenerateStore((s) => s.params);
  const setParams = useGenerateStore((s) => s.setParams);
  const [modelOptions, setModelOptions] = useState<GenerateModelOption[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/generate/models")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.models?.length) {
          setModelOptions(data.models);
        } else {
          setModelOptions([]);
        }
      })
      .catch(() => {
        setModelOptions([]);
      })
      .finally(() => {
        setModelsLoaded(true);
      });
  }, []);

  const currentModel = useMemo(
    () => modelOptions.find((m) => m.slug === params.model) ?? modelOptions[0] ?? null,
    [modelOptions, params.model],
  );
  const allowedDurations = useMemo(
    () => currentModel?.allowedDurations ?? [],
    [currentModel],
  );

  useEffect(() => {
    const patch = resolveModelSelectionPatch(modelOptions, {
      model: params.model,
      duration: params.duration,
    });
    if (patch) {
      setParams(patch);
    }
  }, [modelOptions, params.duration, params.model, setParams]);

  const effectiveCount =
    props.activeTab === "batch"
      ? Math.max(1, props.batchProductCount ?? 0) *
        Math.max(1, props.batchUnitsPerProduct ?? 1)
      : params.count;
  const totalCredits = (currentModel?.creditsPerGen ?? 0) * effectiveCount;
  const modelSelectDisabled = modelOptions.length === 0;

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

      {currentModel && allowedDurations.length === 1 ? (
        <span className={`${selectClass} opacity-60 cursor-default`}>
          {allowedDurations[0]} 秒
        </span>
      ) : (
        <select
          value={params.duration}
          onChange={(e) =>
            setParams({ duration: Number(e.target.value) as VideoDuration })
          }
          className={selectClass}
          disabled={!currentModel}
        >
          {allowedDurations.length === 0 ? (
            <option value={params.duration}>加载模型中</option>
          ) : allowedDurations.map((duration) => (
            <option key={duration} value={duration}>
              {duration} 秒
            </option>
          ))}
        </select>
      )}

      {props.activeTab !== "batch" ? (
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
      ) : (
        <span className={`${selectClass} cursor-default opacity-60`}>
          总视频 {effectiveCount}
        </span>
      )}

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
        value={params.outputLanguage}
        onChange={(e) =>
          setParams({ outputLanguage: e.target.value as GenerateParams["outputLanguage"] })
        }
        className={selectClass}
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <select
        value={params.model}
        onChange={(e) => setParams({ model: e.target.value })}
        className={selectClass}
        disabled={modelSelectDisabled}
      >
        {modelOptions.length === 0 ? (
          <option value="">
            {modelsLoaded ? "暂无可用模型" : "模型加载中..."}
          </option>
        ) : modelOptions.map((m) => (
          <option key={m.slug} value={m.slug}>
            {m.name} ({m.creditsPerGen} 积分)
          </option>
        ))}
      </select>

      <span className="text-xs tabular-nums text-[var(--vc-accent)]">
        {currentModel ? `消耗 ${totalCredits} 积分` : "请先加载模型"}
      </span>
    </div>
  );
}
