"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Clapperboard,
  Copy,
  Check,
  Eye,
  Heart,
  Loader2,
} from "lucide-react";
import type { ScriptResult } from "@/lib/video/types";

interface GalleryDetail {
  id: string;
  title: string;
  videoUrl: string;
  prompt: string | null;
  scriptJson: ScriptResult | null;
  modelSlug: string | null;
  tags: string[];
  viewCount: number;
  likeCount: number;
  createdAt: string;
  authorName: string | null;
}

export default function GalleryDetailClient() {
  const params = useParams();
  const [item, setItem] = useState<GalleryDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/gallery/${params.id}`)
      .then((r) => r.json())
      .then(setItem)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--vc-accent)]" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        作品不存在或已下架
      </div>
    );
  }

  const script = item.scriptJson;

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 py-8 md:px-8">
      <Link
        href="/gallery"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        返回广场
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        {/* Video */}
        <div>
          <div className="overflow-hidden rounded-xl border border-[var(--vc-border)] bg-black">
            <video
              src={item.videoUrl}
              className="mx-auto max-h-[70vh] w-full object-contain"
              controls
              autoPlay
              muted
              playsInline
            />
          </div>
          <div className="mt-3 flex items-center gap-4 text-sm text-slate-400">
            <span className="flex items-center gap-1">
              <Eye className="h-4 w-4" />
              {item.viewCount}
            </span>
            <span className="flex items-center gap-1">
              <Heart className="h-4 w-4" />
              {item.likeCount}
            </span>
            {item.modelSlug && (
              <span className="rounded bg-white/5 px-2 py-0.5 text-xs">
                {item.modelSlug}
              </span>
            )}
            {item.authorName && (
              <span className="ml-auto">by {item.authorName}</span>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="space-y-5">
          <h1 className="text-xl font-bold text-white">{item.title}</h1>

          {/* Tags */}
          {item.tags?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.tags.map((tag, i) => (
                <span
                  key={i}
                  className="rounded-full bg-[var(--vc-accent)]/10 px-3 py-1 text-xs text-[var(--vc-accent)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Prompt */}
          {item.prompt && (
            <DetailSection title="Sora Prompt" copyText={item.prompt}>
              <p className="whitespace-pre-wrap text-sm text-slate-300">
                {item.prompt.length > 500
                  ? item.prompt.slice(0, 500) + "..."
                  : item.prompt}
              </p>
            </DetailSection>
          )}

          {/* Hook */}
          {script?.hook && (
            <DetailSection title="Hook">
              <p className="text-sm text-white">{script.hook}</p>
            </DetailSection>
          )}

          {/* Shots */}
          {script?.shots && script.shots.length > 0 && (
            <DetailSection title="分镜脚本">
              <div className="space-y-2">
                {script.shots.map((shot) => (
                  <div
                    key={shot.id}
                    className="rounded-lg bg-[var(--vc-bg-root)] p-3"
                  >
                    <span className="text-xs font-medium text-[var(--vc-accent)]">
                      镜头 {shot.id} · {shot.camera} · {shot.duration_s}s
                    </span>
                    <p className="mt-1 text-xs text-slate-400">
                      {shot.scene_zh}
                    </p>
                  </div>
                ))}
              </div>
            </DetailSection>
          )}

          {/* Copy */}
          {script?.copy && (
            <DetailSection title="配套文案">
              <div className="space-y-2 text-sm text-slate-300">
                <div>
                  <span className="text-xs text-slate-500">标题：</span>
                  {script.copy.title}
                </div>
                <div>
                  <span className="text-xs text-slate-500">正文：</span>
                  {script.copy.caption}
                </div>
              </div>
            </DetailSection>
          )}

          {/* CTA */}
          <Link
            href={`/generate?prompt=${encodeURIComponent(item.prompt || "")}`}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--vc-accent)] px-6 py-3 text-sm font-medium text-white transition-all hover:brightness-110"
          >
            <Clapperboard className="h-4 w-4" />
            用此 Prompt 生成视频
          </Link>
        </div>
      </div>
    </div>
  );
}

function DetailSection({
  title,
  copyText,
  children,
}: {
  title: string;
  copyText?: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-xl border border-[var(--vc-border)] bg-[var(--vc-bg-surface)] p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </h3>
        {copyText && (
          <button
            onClick={() => {
              navigator.clipboard.writeText(copyText);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-white"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-400" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {copied ? "已复制" : "复制"}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
