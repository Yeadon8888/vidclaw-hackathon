import Link from "next/link";
import { Film, ArrowRight, Calendar, Clock, Tag } from "lucide-react";
import { posts } from "@/lib/blog";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Learn about AI video generation, e-commerce content strategies, and product video creation tips. Articles in English and Chinese.",
};

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-[var(--vc-bg-root)] text-white">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-[var(--vc-accent)]/10 bg-[var(--vc-bg-root)]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2" aria-label="VidClaw V2 首页">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--vc-accent)]">
              <Film className="h-4 w-4 text-[var(--vc-bg-root)]" aria-hidden="true" />
            </div>
            <span className="font-heading text-lg font-bold">VidClaw</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/" className="text-[var(--vc-text-secondary)] hover:text-white transition-colors">首页</Link>
            <Link href="/blog" className="text-[var(--vc-accent)] font-semibold">Blog</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="font-heading text-4xl font-black tracking-tight">Blog</h1>
        <p className="mt-3 text-lg text-slate-400">
          AI video generation insights, tutorials, and e-commerce content strategies.
        </p>

        <div className="mt-12 space-y-8">
          {posts.map((post) => (
            <article
              key={post.slug}
              className="group rounded-xl border border-[var(--vc-border)] bg-[var(--vc-bg-surface)]/50 p-6 transition-all duration-200 hover:border-[var(--vc-accent)]/30 hover:bg-[var(--vc-bg-surface)]"
            >
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" aria-hidden="true" />
                  {post.date}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {post.readTime}
                </span>
                <span className="rounded-full bg-[var(--vc-accent)]/10 px-2 py-0.5 text-[var(--vc-accent)]">
                  {post.lang === "zh" ? "中文" : "English"}
                </span>
              </div>

              <Link href={`/blog/${post.slug}`} className="mt-3 block">
                <h2 className="font-heading text-xl font-bold text-white transition-colors group-hover:text-[var(--vc-accent)]">
                  {post.title}
                </h2>
              </Link>

              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {post.description}
              </p>

              <div className="mt-4 flex items-center justify-between">
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-0.5 text-xs text-slate-400"
                    >
                      <Tag className="h-2.5 w-2.5" aria-hidden="true" />
                      {tag}
                    </span>
                  ))}
                </div>
                <Link
                  href={`/blog/${post.slug}`}
                  className="flex items-center gap-1 text-sm font-medium text-[var(--vc-accent)] opacity-0 transition-opacity group-hover:opacity-100"
                >
                  阅读 <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
