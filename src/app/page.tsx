import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ArrowRight, Zap, Film } from "lucide-react";
import { AnimatedCounter } from "@/components/landing/AnimatedCounter";
import { FeatureCards } from "@/components/landing/FeatureTabs";
import { ShowcaseGrid } from "@/components/landing/ShowcaseGrid";
import { ScrollReveal } from "@/components/landing/ScrollReveal";

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ctaHref = user ? "/generate" : "/register";
  const ctaLabel = user ? "进入工作台" : "免费开始创作";

  return (
    <div className="min-h-screen vc-mesh-gradient text-white">
      {/* ═══════════════════ 导航栏 ═══════════════════ */}
      <header className="sticky top-0 z-50 border-b border-[var(--vc-accent)]/10 bg-[var(--vc-bg-root)]/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-[1280px] items-center justify-between px-6 lg:px-12">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--vc-accent)]">
              <Film className="h-5 w-5 text-[var(--vc-bg-root)]" />
            </div>
            <span className="font-heading text-xl font-extrabold tracking-tight">
              VidClaw<span className="text-[var(--vc-accent)]">v2</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-semibold text-[var(--vc-text-secondary)] md:flex">
            <a href="#features" className="transition-colors duration-200 hover:text-[var(--vc-accent)]">功能特性</a>
            <a href="#showcase" className="transition-colors duration-200 hover:text-[var(--vc-accent)]">案例展示</a>
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <Link
                href="/generate"
                className="vc-glow-btn inline-flex items-center gap-2 px-6 py-2.5 text-sm"
              >
                工作台
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden rounded-full border border-[var(--vc-accent)]/20 px-6 py-2 text-sm font-semibold text-[var(--vc-text-secondary)] transition-all duration-200 hover:bg-[var(--vc-accent)]/5 hover:text-white sm:inline-flex"
                >
                  登录
                </Link>
                <Link
                  href="/register"
                  className="vc-glow-btn inline-flex items-center px-6 py-2.5 text-sm"
                >
                  免费开始
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ═══════════════════ Hero ═══════════════════ */}
      <section className="relative overflow-hidden px-6 pb-20 pt-20 lg:px-12 lg:pt-32">
        {/* Animated orbs */}
        <div className="vc-orb absolute -left-32 -top-32 h-[500px] w-[500px] bg-[var(--vc-accent)]/20" />
        <div className="vc-orb absolute -right-48 top-20 h-[400px] w-[400px] bg-cyan-500/10" style={{ animationDelay: '2s' }} />
        <div className="vc-orb absolute bottom-0 left-1/3 h-[300px] w-[300px] bg-teal-500/10" style={{ animationDelay: '4s' }} />
        {/* Grid overlay */}
        <div className="vc-grid-overlay pointer-events-none absolute inset-0" />

        <div className="relative mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-16 lg:grid-cols-2">
          {/* Left — Text */}
          <div>
            <ScrollReveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--vc-accent)]/20 bg-[var(--vc-accent)]/10 px-4 py-2 text-xs font-bold tracking-wider text-[var(--vc-accent)]">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--vc-accent)] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--vc-accent)]" />
                </span>
                VEO 3.1 & Sora 双引擎
              </span>
            </ScrollReveal>

            <ScrollReveal delay={0.08}>
              <h1 className="mt-8 font-heading text-5xl font-black leading-[1.1] tracking-tight lg:text-7xl">
                AI 驱动的
                <br />
                <span className="vc-gradient-text">
                  带货短视频
                </span>
                <br />
                生成器
              </h1>
            </ScrollReveal>

            <ScrollReveal delay={0.16}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-400">
                粘贴链接、上传视频或描述主题，3 分钟自动生成高质量带货短视频 — AI 分析画面 → 智能脚本 → 一键出片
              </p>
            </ScrollReveal>

            <ScrollReveal delay={0.24}>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link
                  href={ctaHref}
                  className="vc-glow-btn inline-flex items-center justify-center gap-2 px-8 py-3 text-sm"
                >
                  <Zap className="h-4 w-4" />
                  {ctaLabel}
                </Link>
                <span className="text-sm text-slate-500">无需信用卡 · 免费体验</span>
              </div>
            </ScrollReveal>
          </div>

          {/* Right — Search-style input preview */}
          <ScrollReveal delay={0.3}>
            <div className="rounded-xl border border-[var(--vc-accent)]/15 bg-[var(--vc-bg-surface)]/80 p-2 shadow-2xl shadow-[var(--vc-accent)]/5 backdrop-blur-sm">
              <div className="flex items-start gap-4 rounded-lg p-4">
                <Zap className="mt-1 h-7 w-7 shrink-0 text-[var(--vc-accent)]" />
                <div className="flex-1">
                  <div className="text-xl text-slate-500 md:text-2xl">
                    粘贴抖音/TikTok 链接或输入创意主题...
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--vc-border)]/50 p-4">
                <div className="flex gap-2">
                  {["9:16", "15s", "VEO 3.1"].map((tag) => (
                    <span key={tag} className="rounded-full border border-[var(--vc-border)] bg-[var(--vc-bg-root)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {tag}
                    </span>
                  ))}
                </div>
                <Link href={ctaHref} className="vc-glow-btn px-8 py-3 text-sm">
                  生成
                </Link>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══════════════════ 数据带 ═══════════════════ */}
      <section className="relative px-6 pb-20 lg:px-12">
        <ScrollReveal>
          <div className="mx-auto flex max-w-[1280px] flex-wrap justify-between gap-12 rounded-2xl border border-[var(--vc-accent)]/10 bg-gradient-to-r from-[var(--vc-bg-surface)]/60 to-[var(--vc-accent)]/5 p-8 shadow-lg shadow-[var(--vc-accent)]/5 backdrop-blur-sm lg:p-12">
            {[
              { label: "视频已生成", value: 120000, suffix: "+" },
              { label: "平均生成时间", value: 2.8, suffix: "min", isRaw: true },
              { label: "全球可用率", value: 99.9, suffix: "%", isRaw: true },
              { label: "支持平台", value: 6, suffix: "+", isRaw: true },
            ].map((item) => (
              <div key={item.label} className="flex flex-col gap-1">
                <span className="text-sm uppercase tracking-wider text-slate-400">{item.label}</span>
                {item.isRaw ? (
                  <span className="font-heading text-5xl font-black tabular-nums text-white">{item.value}{item.suffix}</span>
                ) : (
                  <AnimatedCounter target={item.value} suffix={item.suffix} />
                )}
              </div>
            ))}
          </div>
        </ScrollReveal>
      </section>

      {/* ═══════════════════ 功能入口区 ═══════════════════ */}
      <section id="features" className="px-6 pb-24 lg:px-12">
        <div className="mx-auto max-w-[1280px]">
          <ScrollReveal>
            <div className="text-center">
              <h2 className="font-heading text-3xl font-bold lg:text-4xl">
                三种模式，覆盖所有创作场景
              </h2>
              <p className="mt-3 text-lg text-slate-400">
                无论是二创热门视频还是从零生产内容
              </p>
            </div>
          </ScrollReveal>

          <div className="mt-12">
            <FeatureCards />
          </div>
        </div>
      </section>

      {/* ═══════════════════ 案例展示 ═══════════════════ */}
      <section id="showcase" className="border-t border-[var(--vc-border)] px-6 py-24 lg:px-12">
        <div className="mx-auto max-w-[1280px]">
          <ScrollReveal>
            <div className="text-center">
              <h2 className="font-heading text-3xl font-bold lg:text-4xl">
                AI 生成的产品广告
              </h2>
              <p className="mt-3 text-lg text-slate-400">
                不同品类、不同风格
              </p>
            </div>
          </ScrollReveal>

          <div className="mt-12">
            <ShowcaseGrid />
          </div>
        </div>
      </section>

      {/* ═══════════════════ CTA ═══════════════════ */}
      <section className="relative overflow-hidden border-t border-[var(--vc-border)] px-6 py-24 lg:px-12">
        <div className="vc-orb absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 bg-[var(--vc-accent)]/8" />
        <div className="relative mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-8 text-center lg:flex-row lg:text-left">
          <ScrollReveal>
            <h2 className="font-heading text-3xl font-bold leading-tight lg:text-5xl">
              今天开始，<span className="vc-gradient-text">明天就有内容</span>
            </h2>
          </ScrollReveal>

          <ScrollReveal delay={0.1}>
            <Link
              href={ctaHref}
              className="vc-glow-btn inline-flex items-center gap-2 px-8 py-3.5 text-base"
            >
              <Zap className="h-5 w-5" />
              {ctaLabel}
            </Link>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══════════════════ Footer ═══════════════════ */}
      <footer className="border-t border-[var(--vc-border)] px-6 py-8 lg:px-12">
        <div className="mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-3 opacity-50 transition-opacity hover:opacity-100">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--vc-accent)]">
              <Film className="h-4 w-4 text-[var(--vc-bg-root)]" />
            </div>
            <span className="font-heading text-sm font-bold">VidClaw</span>
          </div>
          <p className="text-xs text-slate-600">
            © {new Date().getFullYear()} VidClaw · AI 短视频生成平台
          </p>
        </div>
      </footer>
    </div>
  );
}
