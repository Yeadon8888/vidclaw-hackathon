"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Eye, Heart, Sparkles, Loader2 } from "lucide-react";

interface GalleryCard {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  modelSlug: string | null;
  tags: string[];
  viewCount: number;
  likeCount: number;
  createdAt: string;
  authorName: string | null;
}

export default function GalleryPage() {
  const [items, setItems] = useState<GalleryCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    loadItems(1);
  }, []);

  async function loadItems(p: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/gallery?page=${p}&limit=20`);
      const data = await res.json();
      if (p === 1) {
        setItems(data.items);
      } else {
        setItems((prev) => [...prev, ...data.items]);
      }
      setHasMore(data.items.length === 20);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 py-12 md:px-8">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="mb-3 flex items-center justify-center gap-2">
          <Sparkles className="h-6 w-6 text-[var(--vc-accent)]" />
          <h1 className="text-3xl font-bold text-white">灵感广场</h1>
        </div>
        <p className="text-slate-400">
          探索社区优秀的 AI 带货视频作品，获取灵感，一键复用 Prompt。
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <Link
            href="/generate"
            className="rounded-lg bg-[var(--vc-accent)] px-5 py-2.5 text-sm font-medium text-white transition-all hover:brightness-110"
          >
            开始创作
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-[var(--vc-border)] px-5 py-2.5 text-sm text-slate-300 transition-all hover:bg-white/5"
          >
            登录
          </Link>
        </div>
      </div>

      {/* Grid */}
      {items.length === 0 && !loading ? (
        <div className="py-20 text-center text-slate-500">
          还没有作品，成为第一个分享的人吧！
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <GalleryCardView key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && !loading && items.length > 0 && (
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => loadItems(page + 1)}
            className="rounded-lg border border-[var(--vc-border)] px-6 py-2.5 text-sm text-slate-300 transition-all hover:bg-white/5"
          >
            加载更多
          </button>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--vc-accent)]" />
        </div>
      )}
    </div>
  );
}

function GalleryCardView({ item }: { item: GalleryCard }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  function handleEnter() {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    void v.play().catch(() => undefined);
  }

  function handleLeave() {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
  }

  return (
    <Link
      href={`/gallery/${item.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-[var(--vc-border)] bg-[var(--vc-bg-surface)] transition-all hover:border-[var(--vc-accent)]/40 hover:shadow-lg hover:shadow-[var(--vc-accent)]/5"
    >
      {/* Video — always rendered with metadata preload so the first frame
          shows as a poster; hover plays it inline. */}
      <div
        className="relative aspect-[9/16] max-h-80 w-full overflow-hidden bg-black"
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <video
          ref={videoRef}
          src={item.videoUrl}
          poster={item.thumbnailUrl ?? undefined}
          className="h-full w-full object-cover"
          muted
          loop
          playsInline
          preload="metadata"
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-4xl text-white/40 opacity-100 transition-opacity duration-200 group-hover:opacity-0">
          ▶
        </span>
        {item.modelSlug && (
          <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium text-slate-300 backdrop-blur-sm">
            {item.modelSlug}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col p-3">
        <p className="line-clamp-2 text-sm font-medium text-white group-hover:text-[var(--vc-accent)]">
          {item.title}
        </p>
        <div className="mt-auto flex items-center gap-3 pt-2 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {formatCount(item.viewCount)}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3" />
            {formatCount(item.likeCount)}
          </span>
          {item.authorName && (
            <span className="ml-auto truncate">{item.authorName}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
