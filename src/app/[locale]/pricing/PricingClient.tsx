"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Zap,
  Crown,
  Building2,
  Check,
  X,
  MessageCircle,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";

type PlanKey = "starter" | "pro" | "enterprise";

type PlanMeta = {
  id: PlanKey;
  priceUsd: number | null;
  priceCnyApprox: number | null;
  credits: number | null;
  icon: React.ComponentType<{ className?: string }>;
  popular?: boolean;
};

// Mirror of payments/config.ts DEFAULT_PACKAGES — keep in sync.
const PLAN_META: PlanMeta[] = [
  {
    id: "starter",
    priceUsd: 9.9,
    priceCnyApprox: 70,
    credits: 700,
    icon: Zap,
  },
  {
    id: "pro",
    priceUsd: 49,
    priceCnyApprox: 349,
    credits: 3500,
    icon: Crown,
    popular: true,
  },
  {
    id: "enterprise",
    priceUsd: null,
    priceCnyApprox: null,
    credits: null,
    icon: Building2,
  },
];

export function PricingClient({ locale }: { locale: string }) {
  const t = useTranslations("pricingPage");
  const tNav = useTranslations("nav");
  const [qrOpen, setQrOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<PlanKey | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function handleSelect(planId: PlanKey) {
    setCheckoutError(null);
    if (planId === "enterprise") {
      setQrOpen(true);
      return;
    }
    setCheckoutLoading(planId);
    try {
      const res = await fetch("/api/payments/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packageId: planId }),
      });
      const data = (await res.json()) as { paymentUrl?: string; error?: string };
      if (!res.ok || !data.paymentUrl) {
        throw new Error(data.error ?? t("ctaLoading"));
      }
      window.location.href = data.paymentUrl;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "checkout failed";
      setCheckoutError(msg);
      setCheckoutLoading(null);
    }
  }

  const localePrefix = `/${locale}`;

  return (
    <div
      className="relative min-h-screen text-white"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% -20%, rgba(13,204,242,0.10), transparent), #0a1214",
      }}
    >
      {/* Minimal nav — link back to landing */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0a1214]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
          <Link href={localePrefix} className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0dccf2]">
              <Sparkles className="h-4 w-4 text-[#0a1214]" />
            </div>
            <span className="text-lg font-bold tracking-tight">VidClaw</span>
          </Link>
          <Link
            href={localePrefix}
            className="flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {tNav("models")} / {tNav("pricing")}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-6 pb-24">
        {/* Heading */}
        <div className="space-y-4 pt-12 text-center">
          <h1 className="text-4xl font-black tracking-tight text-white lg:text-5xl">
            {t("title")}
          </h1>
          <p className="text-lg text-slate-400">{t("subtitle")}</p>
        </div>

        {/* Pricing cards */}
        <div className="grid gap-6 md:grid-cols-3">
          {PLAN_META.map((plan) => {
            const Icon = plan.icon;
            const features = t.raw(
              `plans.${plan.id}.features`,
            ) as string[];
            const isEnterprise = plan.id === "enterprise";

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border p-6 transition-all ${
                  plan.popular
                    ? "border-[#0dccf2]/40 bg-[#0dccf2]/[0.04] shadow-xl shadow-[#0dccf2]/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#0dccf2] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#0a1214]">
                    {t("popular")}
                  </div>
                )}

                <div className="mb-6 flex items-center gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                      plan.popular
                        ? "bg-[#0dccf2]/15"
                        : isEnterprise
                          ? "bg-amber-500/15"
                          : "bg-blue-500/15"
                    }`}
                  >
                    <Icon
                      className={`h-6 w-6 ${
                        plan.popular
                          ? "text-[#0dccf2]"
                          : isEnterprise
                            ? "text-amber-300"
                            : "text-blue-300"
                      }`}
                    />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {t(`plans.${plan.id}.name`)}
                    </h3>
                    {plan.credits && (
                      <p className="text-sm text-slate-400">
                        {plan.credits} 积分
                      </p>
                    )}
                  </div>
                </div>

                <div className="mb-6">
                  {plan.priceUsd !== null ? (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-black">
                          ${plan.priceUsd}
                        </span>
                        <span className="text-sm text-slate-500">USD</span>
                      </div>
                      {locale === "zh" && plan.priceCnyApprox && (
                        <p className="mt-1 text-xs text-slate-600">
                          {t("cnyHint", { cny: plan.priceCnyApprox })}
                        </p>
                      )}
                      {plan.credits && (
                        <p className="mt-1 text-sm text-slate-500">
                          {t("perVideo", {
                            perVideo: (
                              (plan.priceUsd / plan.credits) *
                              10
                            ).toFixed(2),
                          })}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="text-2xl font-bold text-amber-400">
                      {t(`plans.enterprise.customPrice`)}
                    </div>
                  )}
                </div>

                <ul className="mb-8 flex-1 space-y-3">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0dccf2]" />
                      <span className="text-slate-300">{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSelect(plan.id)}
                  disabled={checkoutLoading === plan.id}
                  className={`w-full rounded-xl py-3 text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                    plan.popular
                      ? "bg-[#0dccf2] text-[#0a1214] shadow-lg shadow-[#0dccf2]/20 hover:brightness-110"
                      : isEnterprise
                        ? "border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                        : "border border-white/10 text-white hover:bg-white/5"
                  }`}
                >
                  {checkoutLoading === plan.id
                    ? t("ctaLoading")
                    : isEnterprise
                      ? t("ctaEnterprise")
                      : t("ctaBuy")}
                </button>
              </div>
            );
          })}
        </div>

        {/* Why VidClaw */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8">
          <h2 className="text-lg font-semibold text-white">{t("why.title")}</h2>
          <ul className="mt-4 space-y-3">
            {(t.raw("why.items") as string[]).map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-slate-300">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0dccf2]" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Notices */}
        <div className="mx-auto max-w-lg space-y-3">
          {checkoutError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {checkoutError}
            </div>
          )}
          <div className="flex items-start gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
            <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />
            <div className="text-sm text-blue-300/90">
              <p className="font-medium">{t("notices.flow")}</p>
              <p className="mt-0.5 text-blue-300/70">{t("notices.flowDesc")}</p>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div className="text-sm text-amber-300/90">
              <p className="font-medium">{t("notices.enterprise")}</p>
              <p className="mt-0.5 text-amber-300/70">
                {t("notices.enterpriseDesc")}
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* WeChat QR modal */}
      {qrOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setQrOpen(false)}
        >
          <div
            className="relative mx-4 w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d181b] p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setQrOpen(false)}
              className="absolute right-4 top-4 rounded-full p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="space-y-5 text-center">
              <div>
                <h3 className="text-xl font-bold text-white">
                  {t("qr.title")}
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  {t("qr.subtitle")}
                </p>
              </div>
              <div className="flex justify-center">
                <div className="overflow-hidden rounded-xl border border-white/10 bg-white p-3">
                  <Image
                    src="/wechat-qr.png"
                    alt={t("qr.alt")}
                    width={220}
                    height={220}
                    className="h-auto w-[220px]"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500">{t("qr.hint")}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
