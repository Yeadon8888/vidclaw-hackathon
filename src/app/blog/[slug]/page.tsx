import Link from "next/link";
import { notFound } from "next/navigation";
import { Film, ArrowLeft, Calendar, Clock, Tag } from "lucide-react";
import { posts, getPostBySlug, getAllSlugs } from "@/lib/blog";
import type { Metadata } from "next";

const SITE_URL = "https://video.yeadon.top";

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.description,
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url: `${SITE_URL}/blog/${post.slug}`,
      publishedTime: post.date,
      tags: post.tags,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    url: `${SITE_URL}/blog/${post.slug}`,
    publisher: {
      "@type": "Organization",
      name: "VidClaw",
      url: SITE_URL,
    },
    inLanguage: post.lang === "zh" ? "zh-CN" : "en",
  };

  return (
    <div className="min-h-screen bg-[var(--vc-bg-root)] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-[var(--vc-accent)]/10 bg-[var(--vc-bg-root)]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
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

      <main className="mx-auto max-w-3xl px-6 py-16">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1 text-sm text-[var(--vc-accent)] hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回博客列表
        </Link>

        <article className="mt-8">
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

          <h1 className="mt-4 font-heading text-3xl font-black leading-tight tracking-tight lg:text-4xl">
            {post.title}
          </h1>

          <div className="mt-3 flex flex-wrap gap-2">
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

          {/* Article content */}
          <div
            className="blog-content mt-10"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        </article>

        {/* CTA */}
        <div className="mt-16 rounded-xl border border-[var(--vc-accent)]/20 bg-[var(--vc-accent)]/5 p-8 text-center">
          <p className="text-lg font-semibold text-white">
            准备好试试 AI 视频生成了吗？
          </p>
          <p className="mt-2 text-sm text-slate-400">
            免费体验，无需信用卡
          </p>
          <Link
            href="/register"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--vc-accent)] px-6 py-2.5 text-sm font-semibold text-[var(--vc-bg-root)] transition-opacity hover:opacity-90"
          >
            免费开始创作
          </Link>
        </div>

        {/* Related posts */}
        <div className="mt-16">
          <h2 className="text-lg font-bold text-white">更多文章</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {posts
              .filter((p) => p.slug !== post.slug)
              .slice(0, 2)
              .map((p) => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  className="rounded-lg border border-[var(--vc-border)] bg-[var(--vc-bg-surface)]/50 p-4 transition-colors hover:border-[var(--vc-accent)]/30"
                >
                  <span className="text-xs text-slate-500">{p.date}</span>
                  <h3 className="mt-1 text-sm font-semibold text-white line-clamp-2">
                    {p.title}
                  </h3>
                </Link>
              ))}
          </div>
        </div>
      </main>
    </div>
  );
}
