import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ArrowRight, Zap } from "lucide-react";
import { HeroPreview } from "@/components/landing/TerminalAnimation";
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
    <div className="min-h-screen bg-[var(--vc-bg-root)] text-white">
      {/* ═══════════════════ 导航栏 ═══════════════════ */}
      <header className="sticky top-0 z-50 border-b border-[var(--vc-border)] bg-[var(--vc-bg-surface)]/90 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <span className="font-heading text-lg font-bold tracking-tight">
              VidClaw
            </span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm text-[var(--vc-text-secondary)] md:flex">
            <a href="#features" className="transition-colors duration-200 hover:text-white">功能特性</a>
            <a href="#showcase" className="transition-colors duration-200 hover:text-white">案例展示</a>
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <Link
                href="/generate"
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--vc-accent)] px-5 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--vc-accent-hover)]"
              >
                工作台
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden rounded-lg px-4 py-2 text-sm text-[var(--vc-text-secondary)] transition-colors duration-200 hover:text-white sm:inline-flex"
                >
                  登录
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center rounded-lg bg-[var(--vc-accent)] px-5 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--vc-accent-hover)]"
                >
                  免费开始
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ═══════════════════ Hero ═══════════════════ */}
      <section className="px-6 pb-16 pt-16 sm:pt-20 lg:pt-28">
        <div className="mx-auto flex max-w-[1280px] flex-col items-center gap-12 lg:flex-row lg:items-center lg:gap-16">
          {/* Left 45% — Text */}
          <div className="w-full lg:w-[45%]">
            <ScrollReveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--vc-accent)]/30 bg-[var(--vc-bg-surface)] px-3.5 py-1.5 text-xs font-medium text-[var(--vc-accent)]">
                <Zap className="h-3.5 w-3.5" />
                VEO 3.1 & Sora 双引擎
              </span>
            </ScrollReveal>

            <ScrollReveal delay={0.08}>
              <h1 className="mt-6 font-heading text-[48px] font-bold leading-[1.1] tracking-tight">
                AI 驱动的
                <br />
                <span className="vc-gradient-text">
                  带货短视频
                </span>
                生成器
              </h1>
            </ScrollReveal>

            <ScrollReveal delay={0.16}>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[var(--vc-text-secondary)]">
                粘贴链接、上传视频或描述主题，3分钟自动生成
              </p>
            </ScrollReveal>

            <ScrollReveal delay={0.24}>
              <div className="mt-8">
                <Link
                  href={ctaHref}
                  className="vc-gradient-btn inline-flex items-center gap-2 rounded-lg px-7 py-3 text-sm font-semibold transition-all duration-200"
                >
                  {ctaLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </ScrollReveal>
          </div>

          {/* Right 55% — Product UI preview */}
          <div className="flex w-full justify-center lg:w-[55%] lg:justify-end">
            <HeroPreview />
          </div>
        </div>
      </section>

      {/* ═══════════════════ 数据带 ═══════════════════ */}
      <section className="px-6 pb-16">
        <div className="mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-4 rounded-xl bg-[var(--vc-bg-surface)] border border-[var(--vc-border)] px-8 py-5 sm:flex-row">
          <div className="flex items-center gap-2 text-sm">
            <AnimatedCounter target={120000} suffix="+" />
            <span className="text-[var(--vc-text-secondary)]">视频已生成</span>
          </div>
          <div className="hidden h-4 w-px bg-[var(--vc-border)] sm:block" />
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[var(--vc-text-secondary)]">平均</span>
            <span className="font-mono-data text-[var(--vc-accent)]">2.8</span>
            <span className="text-[var(--vc-text-secondary)]">分钟</span>
          </div>
          <div className="hidden h-4 w-px bg-[var(--vc-border)] sm:block" />
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[var(--vc-text-secondary)]">支持抖音/TikTok/小红书</span>
          </div>
        </div>
      </section>

      {/* ═══════════════════ 功能入口区 ═══════════════════ */}
      <section id="features" className="px-6 pb-24">
        <div className="mx-auto max-w-[1280px]">
          <ScrollReveal>
            <h2 className="font-heading text-[26px] font-bold">
              三种模式，覆盖所有创作场景
            </h2>
            <p className="mt-2 text-[15px] text-[var(--vc-text-secondary)]">
              无论是二创热门视频还是从零生产内容
            </p>
          </ScrollReveal>

          <div className="mt-10">
            <FeatureCards />
          </div>
        </div>
      </section>

      {/* ═══════════════════ 案例展示 ═══════════════════ */}
      <section id="showcase" className="border-t border-[var(--vc-border)] px-6 py-24">
        <div className="mx-auto max-w-[1280px]">
          <ScrollReveal>
            <div className="text-center">
              <h2 className="font-heading text-[26px] font-bold">
                AI 生成的产品广告
              </h2>
              <p className="mt-2 text-[15px] text-[var(--vc-text-secondary)]">
                不同品类、不同风格
              </p>
            </div>
          </ScrollReveal>

          <div className="mt-10">
            <ShowcaseGrid />
          </div>
        </div>
      </section>

      {/* ═══════════════════ CTA ═══════════════════ */}
      <section className="border-t border-[var(--vc-border)] px-6 py-24">
        <div className="mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-8 text-center lg:flex-row lg:text-left">
          <ScrollReveal>
            <h2 className="font-heading text-3xl font-bold leading-tight lg:text-4xl">
              今天开始，明天就有内容
            </h2>
          </ScrollReveal>

          <ScrollReveal delay={0.1}>
            <Link
              href={ctaHref}
              className="vc-gradient-btn inline-flex items-center gap-2 rounded-lg px-8 py-3.5 text-base font-semibold transition-all duration-200"
            >
              {ctaLabel}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══════════════════ Footer ═══════════════════ */}
      <footer className="border-t border-[var(--vc-border)] px-6 py-8">
        <div className="mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="text-base">⚡</span>
            <span className="font-heading text-sm font-bold">VidClaw</span>
          </div>
          <p className="text-xs text-[var(--vc-text-secondary)]">
            © {new Date().getFullYear()} VidClaw · AI 短视频生成平台
          </p>
        </div>
      </footer>
    </div>
  );
}
