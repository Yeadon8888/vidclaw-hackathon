"use client";

import { useState, useRef } from "react";
import { Upload, Trash2, Image as ImageIcon } from "lucide-react";
import type { UserAsset } from "@/lib/db/schema";
import {
  inspectReferenceImageUpload,
  MAX_REFERENCE_IMAGE_UPLOAD_BYTES,
} from "@/lib/assets/image-preflight";

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

export function AssetGrid({ initialAssets }: { initialAssets: UserAsset[] }) {
  const [assets, setAssets] = useState(initialAssets);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    } else {
      setError("删除失败");
    }
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
        {uploading ? "上传中..." : "点击上传参考图片（支持多选）"}
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

      <p className="text-xs text-[var(--vc-text-dim)]">
        大图会自动压缩后上传，建议单张图片控制在 4MB 内。
      </p>

      {/* Grid of uploaded assets */}
      {assets.length === 0 ? (
        <div className="vc-card p-8 text-center">
          <ImageIcon className="mx-auto h-8 w-8 text-[var(--vc-text-dim)]" />
          <p className="mt-2 text-sm text-[var(--vc-text-muted)]">
            暂无参考图片，请先上传产品图或风格图
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="group relative overflow-hidden rounded-[var(--vc-radius-lg)] border border-[var(--vc-border)] bg-[var(--vc-bg-surface)]"
            >
              <img
                src={asset.url}
                alt={asset.filename ?? "参考图片"}
                className="aspect-square w-full object-cover"
              />
              <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <div className="flex w-full items-center justify-between p-2">
                  <span className="truncate text-xs text-white">
                    {asset.filename}
                  </span>
                  <button
                    onClick={() => handleDelete(asset.id)}
                    className="rounded-[var(--vc-radius-sm)] p-1 text-red-400 transition-colors hover:bg-red-500/20"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
