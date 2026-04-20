"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, Trash2, Image as ImageIcon, Wand2, Loader2, Check, X } from "lucide-react";
import type { UserAsset } from "@/lib/db/schema";
import {
  inspectReferenceImageUpload,
  MAX_REFERENCE_IMAGE_UPLOAD_BYTES,
} from "@/lib/assets/image-preflight";
import { invalidateProductImagesCache } from "@/lib/assets/product-images-client";

const MAX_REFERENCE_IMAGE_DIMENSION = 2048;

async function prepareImageForUpload(file: File): Promise<File> {
  const preflight = inspectReferenceImageUpload({
    type: file.type,
    size: file.size,
  });
  if (!preflight.ok) {
    throw new Error(preflight.error);
  }

  if (!preflight.needsCompression) {
    return file;
  }

  if (file.type === "image/gif") {
    throw new Error("GIF 文件超过 4MB，请先压缩后再上传。");
  }

  const bitmap = await readImageBitmap(file);
  const scale = Math.min(
    1,
    MAX_REFERENCE_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height),
  );
  const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
  const targetHeight = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("浏览器暂不支持图片压缩，请换一张图片再试。");
  }

  context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  closeImageBitmap(bitmap);

  const qualities = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5];
  for (const quality of qualities) {
    const blob = await canvasToBlob(canvas, "image/webp", quality);
    if (blob.size <= MAX_REFERENCE_IMAGE_UPLOAD_BYTES) {
      return new File(
        [blob],
        renameFileExtension(file.name, "webp"),
        { type: "image/webp" },
      );
    }
  }

  throw new Error("图片压缩后仍超过 4MB，请换一张更小的图片。");
}

function renameFileExtension(filename: string, nextExtension: string): string {
  const dotIndex = filename.lastIndexOf(".");
  const basename = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  return `${basename}.${nextExtension}`;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("图片压缩失败，请换一张图片再试。"));
    }, type, quality);
  });
}

async function readImageBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    return window.createImageBitmap(file);
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片读取失败，请换一张图片再试。"));
    };
    image.src = url;
  });
}

function closeImageBitmap(bitmap: ImageBitmap | HTMLImageElement) {
  if ("close" in bitmap && typeof bitmap.close === "function") {
    bitmap.close();
  }
}

// Result assets created by the 9:16 white-bg pipeline carry this filename suffix.
const TRANSFORM_RESULT_SUFFIX = "-9x16-white";

type TransformJob = {
  id: string;
  status: "pending" | "processing" | "succeeded" | "failed";
  sourceAsset: { id: string };
  targetAsset: { id: string; url: string; filename: string | null } | null;
  errorMessage: string | null;
  creditsCost: number;
};

export function AssetGrid({ initialAssets }: { initialAssets: UserAsset[] }) {
  const router = useRouter();
  const [assets, setAssets] = useState(initialAssets);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jobsByAsset, setJobsByAsset] = useState<Record<string, TransformJob>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  const isResultAsset = (a: UserAsset) =>
    typeof a.filename === "string" && a.filename.includes(TRANSFORM_RESULT_SUFFIX);

  // Refetch transform jobs for source assets in this grid; keep mapping by source.
  const refreshJobs = useCallback(async () => {
    const sourceIds = assets.filter((a) => !isResultAsset(a)).map((a) => a.id);
    if (sourceIds.length === 0) return;
    try {
      const res = await fetch(
        `/api/assets/transforms?assetIds=${encodeURIComponent(sourceIds.join(","))}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { jobs: TransformJob[] };
      const map: Record<string, TransformJob> = {};
      // Server returns newest first; first hit per sourceAsset wins.
      for (const job of data.jobs) {
        if (!map[job.sourceAsset.id]) map[job.sourceAsset.id] = job;
      }
      setJobsByAsset(map);
    } catch {
      // network blip — keep previous state
    }
  }, [assets]);

  // Initial load + poll while any job is in-progress.
  useEffect(() => {
    void refreshJobs();
  }, [refreshJobs]);

  useEffect(() => {
    const inFlight = Object.values(jobsByAsset).some(
      (j) => j.status === "pending" || j.status === "processing",
    );
    if (!inFlight) return;
    const id = window.setInterval(() => {
      void refreshJobs().then(() => {
        // If a job finished, refresh server data so the new result asset shows up.
        const stillInFlight = Object.values(jobsByAsset).some(
          (j) => j.status === "pending" || j.status === "processing",
        );
        if (!stillInFlight) router.refresh();
      });
    }, 4000);
    return () => window.clearInterval(id);
  }, [jobsByAsset, refreshJobs, router]);

  // Sync from props (router.refresh repopulates initialAssets).
  useEffect(() => {
    setAssets(initialAssets);
  }, [initialAssets]);

  async function handleTransform(assetId: string) {
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/assets/${assetId}/transform`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `提交失败 (HTTP ${res.status})`);
      }
      if (data.createdCount === 0 && data.skippedCount > 0) {
        setInfo("该图片已有处理中的任务，请等待结果。");
      } else {
        setInfo(`已开始处理，将消耗 ${data.creditsPerJob} 积分。`);
      }
      // Optimistically mark this asset as pending so UI shows spinner immediately.
      setJobsByAsset((prev) => ({
        ...prev,
        [assetId]: {
          id: `optimistic-${assetId}`,
          status: "pending",
          sourceAsset: { id: assetId },
          targetAsset: null,
          errorMessage: null,
          creditsCost: data.creditsPerJob ?? 0,
        },
      }));
      void refreshJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交转换失败");
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (files.length === 0) return;

    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        const uploadFile = await prepareImageForUpload(file);
        const formData = new FormData();
        formData.append("file", uploadFile);

        const uploadRes = await fetch("/api/assets/upload", {
          method: "POST",
          body: formData,
        });

        if (uploadRes.ok) {
          const asset = await uploadRes.json();
          setAssets((prev) => [asset, ...prev]);
          invalidateProductImagesCache();
        } else {
          const data = await uploadRes.json().catch(() => ({}));
          setError(
            uploadRes.status === 413
              ? "图片体积超过平台限制，请换一张更小的图片。"
              : data.error || `上传失败 (HTTP ${uploadRes.status})`,
          );
        }
      }
    } catch (err) {
      setError(`网络错误: ${String(err).slice(0, 100)}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(assetId: string) {
    const res = await fetch(`/api/assets/${assetId}`, { method: "DELETE" });
    if (res.ok) {
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
      setSelectedIds((prev) => {
        if (!prev.has(assetId)) return prev;
        const next = new Set(prev);
        next.delete(assetId);
        return next;
      });
      invalidateProductImagesCache();
    } else {
      setError("删除失败");
    }
  }

  function toggleSelect(assetId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleBatchTransform() {
    // Only source assets that are not already mid-transform are eligible.
    const eligible = assets.filter((a) => {
      if (!selectedIds.has(a.id)) return false;
      if (isResultAsset(a)) return false;
      const job = jobsByAsset[a.id];
      if (job && (job.status === "pending" || job.status === "processing")) return false;
      return true;
    });

    if (eligible.length === 0) {
      setError("所选图片里没有可转 9:16 的产品原图（结果图或处理中会被跳过）。");
      return;
    }

    setError(null);
    setInfo(null);
    setBatchBusy(true);
    let ok = 0;
    let fail = 0;
    let creditsPerJob = 0;
    try {
      for (const asset of eligible) {
        try {
          const res = await fetch(`/api/assets/${asset.id}/transform`, { method: "POST" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            fail += 1;
            continue;
          }
          ok += 1;
          if (typeof data.creditsPerJob === "number") creditsPerJob = data.creditsPerJob;
          setJobsByAsset((prev) => ({
            ...prev,
            [asset.id]: {
              id: `optimistic-${asset.id}`,
              status: "pending",
              sourceAsset: { id: asset.id },
              targetAsset: null,
              errorMessage: null,
              creditsCost: creditsPerJob,
            },
          }));
        } catch {
          fail += 1;
        }
      }
    } finally {
      setBatchBusy(false);
    }
    const creditsNote = creditsPerJob > 0 ? `，每张消耗 ${creditsPerJob} 积分` : "";
    setInfo(
      fail === 0
        ? `已提交 ${ok} 张图片转 9:16 白底${creditsNote}。`
        : `已提交 ${ok} 张，失败 ${fail} 张${creditsNote}。`,
    );
    clearSelection();
    void refreshJobs();
  }

  async function handleBatchDelete() {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(`确认删除选中的 ${selectedIds.size} 张图片？此操作不可撤销。`);
    if (!confirmed) return;

    setError(null);
    setInfo(null);
    setBatchBusy(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const id of Array.from(selectedIds)) {
        try {
          const res = await fetch(`/api/assets/${id}`, { method: "DELETE" });
          if (res.ok) {
            ok += 1;
            setAssets((prev) => prev.filter((a) => a.id !== id));
          } else {
            fail += 1;
          }
        } catch {
          fail += 1;
        }
      }
    } finally {
      setBatchBusy(false);
      invalidateProductImagesCache();
    }
    setInfo(
      fail === 0 ? `已删除 ${ok} 张图片。` : `已删除 ${ok} 张，失败 ${fail} 张。`,
    );
    clearSelection();
  }

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="flex w-full items-center justify-center gap-2 rounded-[var(--vc-radius-lg)] border-2 border-dashed border-[var(--vc-border)] bg-transparent py-6 text-sm text-[var(--vc-text-muted)] transition-all duration-200 hover:border-[var(--vc-accent)]/40 hover:text-[var(--vc-accent)] disabled:opacity-50 sm:py-8"
      >
        <Upload className="h-5 w-5" />
        {uploading ? "上传中..." : "点击上传产品图片（支持多选）"}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleUpload}
      />

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">关闭</button>
        </div>
      )}

      {info && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300">
          {info}
          <button onClick={() => setInfo(null)} className="ml-2 underline">关闭</button>
        </div>
      )}

      <p className="text-xs text-[var(--vc-text-dim)]">
        大图会自动压缩后上传，建议单张图片控制在 4MB 内。点击图片右下角的 <Wand2 className="inline h-3 w-3" /> 可一键抠图并转 9:16 白底；左上角勾选可批量操作。
      </p>

      {selectedIds.size > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-[var(--vc-radius-lg)] border border-[var(--vc-accent)]/40 bg-[var(--vc-bg-surface)]/95 px-3 py-2 text-sm shadow-lg backdrop-blur">
          <span className="text-[var(--vc-text)]">已选 {selectedIds.size} 张</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBatchTransform}
              disabled={batchBusy}
              className="inline-flex items-center gap-1 rounded-[var(--vc-radius-sm)] border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-300 transition-colors hover:bg-cyan-500/20 disabled:opacity-50"
            >
              {batchBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              一键转 9:16
            </button>
            <button
              onClick={handleBatchDelete}
              disabled={batchBusy}
              className="inline-flex items-center gap-1 rounded-[var(--vc-radius-sm)] border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              批量删除
            </button>
            <button
              onClick={clearSelection}
              disabled={batchBusy}
              className="inline-flex items-center gap-1 rounded-[var(--vc-radius-sm)] border border-[var(--vc-border)] px-3 py-1.5 text-xs text-[var(--vc-text-muted)] transition-colors hover:text-[var(--vc-text)] disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              取消
            </button>
          </div>
        </div>
      )}

      {/* Grid of uploaded assets */}
      {assets.length === 0 ? (
        <div className="vc-card p-8 text-center">
          <ImageIcon className="mx-auto h-8 w-8 text-[var(--vc-text-dim)]" />
          <p className="mt-2 text-sm text-[var(--vc-text-muted)]">
            暂无产品图片，请先上传产品图或风格图
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {assets.map((asset) => {
            const isResult = isResultAsset(asset);
            const job = jobsByAsset[asset.id];
            const inFlight = job && (job.status === "pending" || job.status === "processing");
            const failed = job && job.status === "failed";

            const isSelected = selectedIds.has(asset.id);

            return (
              <div
                key={asset.id}
                className={`group relative overflow-hidden rounded-[var(--vc-radius-lg)] border bg-[var(--vc-bg-surface)] transition-colors ${
                  isSelected ? "border-[var(--vc-accent)] ring-2 ring-[var(--vc-accent)]/60" : "border-[var(--vc-border)]"
                }`}
              >
                <img
                  src={asset.url}
                  alt={asset.filename ?? "产品图片"}
                  className="aspect-square w-full object-cover"
                />

                {/* Selection checkbox — z-10 so the hover gradient overlay below
                    does not steal pointer events even at opacity-0. */}
                <button
                  type="button"
                  aria-label={isSelected ? "取消选中" : "选中"}
                  aria-pressed={isSelected}
                  onClick={() => toggleSelect(asset.id)}
                  className={`absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border text-white shadow transition-colors ${
                    isSelected
                      ? "border-[var(--vc-accent)] bg-[var(--vc-accent)]"
                      : "border-white/60 bg-black/40 hover:bg-black/60"
                  }`}
                >
                  {isSelected && <Check className="h-3.5 w-3.5" />}
                </button>

                {isResult && (
                  <span className="absolute left-2 top-2 rounded-full bg-cyan-500/90 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                    9:16 白底
                  </span>
                )}

                {inFlight && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="text-xs">
                      {job?.status === "processing" ? "AI 处理中..." : "排队中..."}
                    </span>
                  </div>
                )}

                {failed && (
                  <div className="absolute inset-x-0 top-0 bg-red-500/80 px-2 py-1 text-[10px] text-white" title={job?.errorMessage ?? ""}>
                    转换失败,可重试
                  </div>
                )}

                <div className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/70 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <div className="pointer-events-auto flex w-full items-center justify-between gap-2 p-2">
                    <span className="truncate text-xs text-white">
                      {asset.filename}
                    </span>
                    <div className="flex items-center gap-1">
                      {!isResult && !inFlight && (
                        <button
                          onClick={() => handleTransform(asset.id)}
                          title="一键抠图 + 9:16 白底"
                          className="rounded-[var(--vc-radius-sm)] p-1 text-cyan-300 transition-colors hover:bg-cyan-500/20"
                        >
                          <Wand2 className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(asset.id)}
                        className="rounded-[var(--vc-radius-sm)] p-1 text-red-400 transition-colors hover:bg-red-500/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
