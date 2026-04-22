import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { systemConfig } from "@/lib/db/schema";

export const PAYMENT_CONFIG_KEY = "payments.alipay.config";
export const PAYMENT_PACKAGES_KEY = "payments.credit_packages";
const DEFAULT_SITE_URL = "https://video.yeadon.top";

export interface StripeConfig {
  enabled: boolean;
  secretKey: string;
  webhookSecret: string;
  publishableKey: string;
  siteUrl: string;
  successPath: string;
  cancelPath: string;
  webhookPath: string;
}

/**
 * Stripe config is env-driven (secrets), unlike Alipay (DB-driven).
 * Webhook secret is per-endpoint and rotates separately from the API key.
 */
export function getStripeConfig(): StripeConfig {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL;
  return {
    enabled: Boolean(secretKey),
    secretKey,
    webhookSecret,
    publishableKey,
    siteUrl,
    successPath: "/pricing/result",
    cancelPath: "/pricing",
    webhookPath: "/api/payments/stripe/webhook",
  };
}

export interface AlipayConfig {
  enabled: boolean;
  appId: string;
  privateKey: string;
  alipayPublicKey: string;
  gateway: string;
  siteUrl: string;
  returnPath: string;
  notifyPath: string;
}

export interface CreditPackage {
  id: string;
  name: string;
  /** Display price in CNY fen (1 yuan = 100 fen). Always present, even for USD-charged packs. */
  amountFen: number;
  /** Actual charge amount in USD cents. Stripe Checkout uses this. */
  amountUsdCents: number;
  credits: number;
  expiresInDays: number;
  description?: string;
  badge?: string;
  disabled?: boolean;
  /**
   * Stripe Price ID (price_...). Required for purchasable packs.
   * Enterprise "contact us" packs leave this empty.
   */
  stripePriceId?: string;
  /** "pack" = self-serve checkout; "contact" = show WeChat QR for sales */
  type?: "pack" | "contact";
}

const DEFAULT_ALIPAY_CONFIG: AlipayConfig = {
  enabled: false,
  appId: "",
  privateKey: "",
  alipayPublicKey: "",
  gateway: "https://openapi.alipay.com/gateway.do",
  siteUrl: DEFAULT_SITE_URL,
  returnPath: "/pricing/result",
  notifyPath: "/api/payments/alipay/notify",
};

const DEFAULT_PACKAGES: CreditPackage[] = [
  {
    id: "starter",
    name: "入门版",
    amountFen: 7000, // ¥70 (1 积分 = ¥0.1, 含利润)
    amountUsdCents: 990, // $9.9 ≈ ¥70 at ~7.1 CNY/USD
    credits: 700,
    expiresInDays: 0, // 0 = never expires
    description: "首次体验、中小批量创作",
    type: "pack",
  },
  {
    id: "pro",
    name: "专业版",
    amountFen: 34900, // ¥349
    amountUsdCents: 4900, // $49
    credits: 3500,
    expiresInDays: 0, // 0 = never expires
    badge: "最受欢迎",
    description: "高频跑批、日常商用",
    type: "pack",
  },
  {
    id: "enterprise",
    name: "企业定制",
    amountFen: 0,
    amountUsdCents: 0,
    credits: 0,
    expiresInDays: 0,
    description: "找我定制，微信扫码联系",
    type: "contact",
  },
];

function normalizeConfig(input: unknown): AlipayConfig {
  const value = (input ?? {}) as Partial<AlipayConfig>;
  return {
    enabled: Boolean(value.enabled),
    appId: String(value.appId ?? "").trim(),
    privateKey: String(value.privateKey ?? "").trim(),
    alipayPublicKey: String(value.alipayPublicKey ?? "").trim(),
    gateway: String(value.gateway ?? DEFAULT_ALIPAY_CONFIG.gateway).trim() || DEFAULT_ALIPAY_CONFIG.gateway,
    siteUrl: String(value.siteUrl ?? DEFAULT_ALIPAY_CONFIG.siteUrl).trim() || DEFAULT_ALIPAY_CONFIG.siteUrl,
    returnPath: String(value.returnPath ?? DEFAULT_ALIPAY_CONFIG.returnPath).trim() || DEFAULT_ALIPAY_CONFIG.returnPath,
    notifyPath: String(value.notifyPath ?? DEFAULT_ALIPAY_CONFIG.notifyPath).trim() || DEFAULT_ALIPAY_CONFIG.notifyPath,
  };
}

function normalizePackages(input: unknown): CreditPackage[] {
  if (!Array.isArray(input)) return DEFAULT_PACKAGES;

  return input
    .map((item) => {
      const value = item as Partial<CreditPackage>;
      const type: "pack" | "contact" = value.type === "contact" ? "contact" : "pack";
      return {
        id: String(value.id ?? "").trim(),
        name: String(value.name ?? "").trim(),
        amountFen: Number(value.amountFen ?? 0),
        amountUsdCents: Number(value.amountUsdCents ?? 0),
        credits: Number(value.credits ?? 0),
        expiresInDays: Number(value.expiresInDays ?? 0),
        description: value.description ? String(value.description) : undefined,
        badge: value.badge ? String(value.badge) : undefined,
        disabled: Boolean(value.disabled),
        stripePriceId: value.stripePriceId ? String(value.stripePriceId).trim() : undefined,
        type,
      } satisfies CreditPackage;
    })
    .filter((item) => {
      if (!item.id || !item.name) return false;
      // Contact packs (enterprise) bypass numeric checks — they don't go through checkout.
      if (item.type === "contact") return true;
      return (
        Number.isInteger(item.amountFen) &&
        item.amountFen >= 0 &&
        Number.isInteger(item.amountUsdCents) &&
        item.amountUsdCents >= 0 &&
        Number.isInteger(item.credits) &&
        item.credits > 0 &&
        Number.isInteger(item.expiresInDays) &&
        item.expiresInDays >= 0
      );
    });
}

export async function getAlipayConfig(): Promise<AlipayConfig> {
  const [row] = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.key, PAYMENT_CONFIG_KEY))
    .limit(1);

  return normalizeConfig(row?.value);
}

export async function saveAlipayConfig(params: {
  config: AlipayConfig;
  adminId: string;
}) {
  const value = normalizeConfig(params.config);
  await db
    .insert(systemConfig)
    .values({
      key: PAYMENT_CONFIG_KEY,
      value,
      updatedBy: params.adminId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemConfig.key,
      set: {
        value,
        updatedBy: params.adminId,
        updatedAt: new Date(),
      },
    });
}

export async function listCreditPackages(): Promise<CreditPackage[]> {
  const [row] = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.key, PAYMENT_PACKAGES_KEY))
    .limit(1);

  const normalized = normalizePackages(row?.value);
  return normalized.length > 0 ? normalized : DEFAULT_PACKAGES;
}

export async function saveCreditPackages(params: {
  packages: CreditPackage[];
  adminId: string;
}) {
  const value = normalizePackages(params.packages);
  if (value.length === 0) {
    throw new Error("至少保留一个有效充值套餐");
  }

  await db
    .insert(systemConfig)
    .values({
      key: PAYMENT_PACKAGES_KEY,
      value,
      updatedBy: params.adminId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemConfig.key,
      set: {
        value,
        updatedBy: params.adminId,
        updatedAt: new Date(),
      },
    });
}

export async function getCreditPackageById(id: string) {
  const packages = await listCreditPackages();
  return packages.find((item) => item.id === id && !item.disabled) ?? null;
}

export function buildAbsoluteUrl(siteUrl: string, path: string, params?: Record<string, string>) {
  const url = new URL(path, siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}
