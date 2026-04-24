"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Check,
  Sparkles,
  Download,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type {
  SceneStyle,
  SceneRegion,
  ScenePromptLanguage,
} from "@/lib/image-edit/scene-generation";

interface AssetOption {
  id: string;
  url: string;
  filename: string | null;
}

interface GeneratedImage {
  style: string;
  url: string;
  assetId: string;
}

interface ModelOption {
  id: string;
  slug: string;
  name: string;
  creditsPerGen: number;
}

const STYLES: { value: SceneStyle; label: string; emoji: string }[] = [
  { value: "lifestyle", label: "生活场景", emoji: "🏠" },
  { value: "model", label: "模特展示", emoji: "👤" },
  { value: "detail", label: "细节特写", emoji: "🔍" },
  { value: "flatlay", label: "平铺摆拍", emoji: "📐" },
  { value: "outdoor", label: "户外场景", emoji: "🌿" },
  { value: "studio", label: "棚拍风格", emoji: "📸" },
];

const REGIONS: { value: SceneRegion; label: string }[] = [
  { value: "auto", label: "自动" },
  { value: "western", label: "欧美" },
  { value: "east_asian_non_cn", label: "日韩" },
  { value: "southeast_asian", label: "东南亚" },
  { value: "malaysian", label: "马来西亚" },
  { value: "mexican", label: "墨西哥" },
  { value: "middle_east", label: "中东" },
];

const LANGUAGES: { value: ScenePromptLanguage; label: string }[] = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];

export default function ScenePage() {
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedStyles, setSelectedStyles] = useState<Set<SceneStyle>>(
    new Set(["lifestyle", "model", "studio"]),
  );
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModelSlug, setSelectedModelSlug] = useState<string | null>(null);
  const [region, setRegion] = useState<SceneRegion>("auto");
  const [language, setLanguage] = useState<ScenePromptLanguage>("zh");
  const [customPrompt, setCustomPrompt] = useState("");
  const [customPromptOpen, setCustomPromptOpen] = useState(false);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState("");
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  // Load user assets + image-edit models
  useEffect(() => {
    async function loadAssets() {
      try {
        const res = await fetch("/api/assets/list");
        if (!res.ok) return;
        const data = await res.json();
        if (data.assets) setAssets(data.assets);
      } catch {}
    }
    async function loadModels() {
      try {
        const res = await fetch("/api/models/image-edit");
        if (!res.ok) return;
        const data = (await res.json()) as { models: ModelOption[] };
        setModels(data.models);
        if (data.models.length > 0) {
          setSelectedModelSlug((prev) => prev ?? data.models[0].slug);
        }
      } catch {}
    }
    loadAssets();
    loadModels();
  }, []);

  const selectedModel =
    models.find((m) => m.slug === selectedModelSlug) ?? models[0] ?? null;

  const selectedAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) ?? null,
    [assets, selectedAssetId],
  );

  // Auto-expand the picker only when very few images; otherwise keep it collapsed
  // by default so the page doesn't get buried under a huge thumbnail grid.
  const shouldAutoExpandAssets = assets.length > 0 && assets.length <= 4;
  const isAssetPickerExpanded = assetPickerOpen || shouldAutoExpandAssets;

  function toggleStyle(style: SceneStyle) {
    setSelectedStyles((prev) => {
      const next = new Set(prev);
      if (next.has(style)) next.delete(style);
      else if (next.size < 6) next.add(style);
      return next;
    });
  }

  async function handleGenerate() {
    if (!selectedAssetId || selectedStyles.size === 0) return;
    setGenerating(true);
    setGeneratedImages([]);
    setErrors([]);
    setProgress("准备中...");

    try {
      const res = await fetch("/api/assets/scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: selectedAssetId,
          styles: Array.from(selectedStyles),
          modelSlug: selectedModelSlug ?? undefined,
          region,
          language,
          customPrompt: customPrompt.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setErrors([data.error || "生成失败"]);
        setGenerating(false);
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
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "progress") {
              setProgress(event.message);
            } else if (event.type === "image") {
              setGeneratedImages((prev) => [
                ...prev,
                { style: event.style, url: event.url, assetId: event.assetId },
              ]);
            } else if (event.type === "error") {
              setErrors((prev) => [...prev, event.message]);
            } else if (event.type === "done") {
              setProgress("");
            }
          } catch {}
        }
      }
    } catch {
      setErrors(["网络错误，请重试。"]);
    } finally {
      setGenerating(false);
    }
  }

  const perImageCost = selectedModel?.creditsPerGen ?? 3;
  const totalCost = selectedStyles.size * perImageCost;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold text-white">商品组图</h1>
        <p className="mt-1 text-sm text-slate-400">
          选择一张产品图，AI 自动生成多种风格的场景展示图，适用于电商详情页、种草推广。
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left: Config */}
        <div className="space-y-5">
          {/* Step 1: Select asset — collapsible */}
          <div className="rounded-xl border border-[var(--vc-border)] bg-[var(--vc-bg-surface)] p-5">
            <button
              type="button"
              onClick={() => setAssetPickerOpen((v) => !v)}
              disabled={shouldAutoExpandAssets || assets.length === 0}
              className="flex w-full items-center justify-between text-left disabled:cursor-default"
            >
              <div>
                <h3 className="text-sm font-semibold text-white">
                  ① 选择产品图
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {assets.length === 0
                    ? "暂无产品图"
                    : selectedAssetId
                      ? `已选 1 张 / 共 ${assets.length} 张`
                      : `共 ${assets.length} 张 · 未选`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Collapsed preview thumbnail */}
                {!isAssetPickerExpanded && selectedAsset && (
                  <div
                    className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-white/10 bg-cover bg-center"
                    style={{ backgroundImage: `url(${selectedAsset.url})` }}
                  />
                )}
                {!shouldAutoExpandAssets && assets.length > 0 && (
                  isAssetPickerExpanded ? (
                    <ChevronUp className="h-4 w-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  )
                )}
              </div>
            </button>

            {assets.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                请先去{" "}
                <a href="/assets" className="text-[var(--vc-accent)]">
                  素材库
                </a>{" "}
                上传。
              </p>
            ) : (
              isAssetPickerExpanded && (
                <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {assets.map((asset) => (
                    <button
                      key={asset.id}
                      onClick={() => setSelectedAssetId(asset.id)}
                      className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${
                        selectedAssetId === asset.id
                          ? "border-[var(--vc-accent)] ring-2 ring-[var(--vc-accent)]/30"
                          : "border-transparent hover:border-white/20"
                      }`}
                    >
                      <img
                        src={asset.url}
                        alt={asset.filename ?? ""}
                        className="h-full w-full object-cover"
                      />
                      {selectedAssetId === asset.id && (
                        <div className="absolute inset-0 flex items-center justify-center bg-[var(--vc-accent)]/20">
                          <Check className="h-5 w-5 text-[var(--vc-accent)]" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )
            )}
          </div>

          {/* Step 2: Select model */}
          <div className="rounded-xl border border-[var(--vc-border)] bg-[var(--vc-bg-surface)] p-5">
            <h3 className="mb-3 text-sm font-semibold text-white">
              ② 选择图片模型{" "}
              <span className="font-normal text-slate-400">
                （影响单张价格）
              </span>
            </h3>
            {models.length === 0 ? (
              <p className="text-sm text-slate-500">暂无可用图片模型。</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {models.map((m) => {
                  const active = selectedModelSlug === m.slug;
                  return (
                    <button
                      key={m.slug}
                      onClick={() => setSelectedModelSlug(m.slug)}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-all ${
                        active
                          ? "border-[var(--vc-accent)] bg-[var(--vc-accent)]/10 text-white"
                          : "border-[var(--vc-border)] text-slate-400 hover:border-white/20 hover:text-white"
                      }`}
                    >
                      <span className="truncate">{m.name}</span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          active
                            ? "bg-[var(--vc-accent)]/20 text-[var(--vc-accent)]"
                            : "bg-white/5 text-slate-500"
                        }`}
                      >
                        {m.creditsPerGen} 积分/张
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 3: Select styles */}
          <div className="rounded-xl border border-[var(--vc-border)] bg-[var(--vc-bg-surface)] p-5">
            <h3 className="mb-3 text-sm font-semibold text-white">
              ③ 选择场景风格{" "}
              <span className="font-normal text-slate-400">
                （已选 {selectedStyles.size} 种）
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {STYLES.map((style) => {
                const isSelected = selectedStyles.has(style.value);
                return (
                  <button
                    key={style.value}
                    onClick={() => toggleStyle(style.value)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-all ${
                      isSelected
                        ? "border-[var(--vc-accent)] bg-[var(--vc-accent)]/10 text-[var(--vc-accent)]"
                        : "border-[var(--vc-border)] text-slate-400 hover:border-white/20 hover:text-white"
                    }`}
                  >
                    <span>{style.emoji}</span>
                    {style.label}
                    {isSelected && <Check className="ml-auto h-3.5 w-3.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 4: Region & language */}
          <div className="rounded-xl border border-[var(--vc-border)] bg-[var(--vc-bg-surface)] p-5">
            <h3 className="mb-1 text-sm font-semibold text-white">
              ④ 人物地区 & Prompt 语言
            </h3>
            <p className="mb-3 text-xs text-slate-500">
              地区影响含人物的风格（生活/模特/户外）；语言切换影响模型理解 prompt 的稳定度，GPT Image 2 推荐 English。
            </p>

            <div className="mb-3">
              <div className="mb-1.5 text-xs text-slate-400">人物地区</div>
              <div className="flex flex-wrap gap-1.5">
                {REGIONS.map((r) => {
                  const active = region === r.value;
                  return (
                    <button
                      key={r.value}
                      onClick={() => setRegion(r.value)}
                      className={`rounded-full border px-3 py-1 text-xs transition-all ${
                        active
                          ? "border-[var(--vc-accent)] bg-[var(--vc-accent)]/10 text-[var(--vc-accent)]"
                          : "border-[var(--vc-border)] text-slate-400 hover:border-white/20 hover:text-white"
                      }`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-xs text-slate-400">Prompt 语言</div>
              <div className="flex gap-1.5">
                {LANGUAGES.map((l) => {
                  const active = language === l.value;
                  return (
                    <button
                      key={l.value}
                      onClick={() => setLanguage(l.value)}
                      className={`rounded-full border px-3 py-1 text-xs transition-all ${
                        active
                          ? "border-[var(--vc-accent)] bg-[var(--vc-accent)]/10 text-[var(--vc-accent)]"
                          : "border-[var(--vc-border)] text-slate-400 hover:border-white/20 hover:text-white"
                      }`}
                    >
                      {l.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Step 5: Custom prompt — collapsible, default closed */}
          <div className="rounded-xl border border-[var(--vc-border)] bg-[var(--vc-bg-surface)] p-5">
            <button
              type="button"
              onClick={() => setCustomPromptOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <div>
                <h3 className="text-sm font-semibold text-white">
                  ⑤ 自定义补充指令{" "}
                  <span className="font-normal text-slate-500">（可选）</span>
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {customPrompt.trim()
                    ? `已启用 · 会附加到每种风格的 prompt 末尾`
                    : "展开可以为所有风格追加一条统一指令"}
                </p>
              </div>
              {customPromptOpen ? (
                <ChevronUp className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              )}
            </button>
            {customPromptOpen && (
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={4}
                placeholder="例：强调夏季地中海度假氛围；暖色调；avoid cluttered props"
                className="mt-3 w-full rounded-lg border border-[var(--vc-border)] bg-black/20 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[var(--vc-accent)] focus:outline-none"
              />
            )}
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={
              generating || !selectedAssetId || selectedStyles.size === 0
            }
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--vc-accent)] px-6 py-3.5 text-sm font-medium text-white transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {generating
              ? progress || "生成中..."
              : `生成 ${selectedStyles.size} 张场景图 · 约 ${totalCost} 积分`}
          </button>
        </div>

        {/* Right: Preview & Results */}
        <div className="space-y-4">
          {/* Selected asset preview */}
          {selectedAsset && (
            <div className="overflow-hidden rounded-xl border border-[var(--vc-border)]">
              <img
                src={selectedAsset.url}
                alt={selectedAsset.filename ?? ""}
                className="w-full object-contain"
                style={{ maxHeight: "300px" }}
              />
              <div className="bg-[var(--vc-bg-surface)] px-3 py-2 text-xs text-slate-400">
                {selectedAsset.filename}
              </div>
            </div>
          )}

          {/* Errors */}
          {errors.map((err, i) => (
            <div
              key={i}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
            >
              {err}
            </div>
          ))}
        </div>
      </div>

      {/* Generated results */}
      {generatedImages.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-white">
            生成结果（{generatedImages.length} 张）
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {generatedImages.map((img, i) => (
              <div
                key={i}
                className="group relative overflow-hidden rounded-xl border border-[var(--vc-border)]"
              >
                <img
                  src={img.url}
                  alt={img.style}
                  className="w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
                  <span className="text-xs text-white">
                    {STYLES.find((s) => s.value === img.style)?.label ??
                      img.style}
                  </span>
                  <a
                    href={img.url}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="rounded p-1 text-white/70 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
