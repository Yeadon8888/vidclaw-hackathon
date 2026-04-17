import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  weight: ["500", "600", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const SITE_URL = "https://video.yeadon.top";
const SITE_NAME = "VidClaw V2";

const ZH_TITLE = "VidClaw V2 — AI 带货短视频生成平台｜抖音/TikTok 二创";
const ZH_DESCRIPTION =
  "粘贴一条抖音/TikTok 链接或输入一句主题，AI 自动生成带货视频、分镜脚本与配套文案。支持 Sora 2、VEO 3.1、海螺、Seedance 等 8 大视频模型，3 分钟完成一条爆款短视频。";

const EN_TITLE = "VidClaw V2 — AI Product Video Generator for E-Commerce";
const EN_DESCRIPTION =
  "Create high-converting product videos in minutes. Paste a Douyin/TikTok link or describe a theme — AI generates videos, shot-by-shot scripts, and marketing copy. Powered by Sora 2, VEO 3.1, Hailuo, Seedance.";

export const metadata: Metadata = {
  title: {
    default: ZH_TITLE,
    template: "%s | VidClaw V2",
  },
  description: ZH_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "VidClaw Team" }],
  creator: "VidClaw",
  publisher: "VidClaw",
  category: "technology",
  keywords: [
    "AI 视频生成",
    "AI 短视频",
    "带货视频",
    "抖音二创",
    "TikTok 二创",
    "Sora 视频",
    "VEO 3.1",
    "海螺视频",
    "Seedance",
    "电商视频",
    "产品视频生成",
    "Gemini 视频",
    "AI video generator",
    "product video maker",
    "e-commerce video",
    "short video automation",
  ],
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: "/",
    languages: {
      "zh-CN": "/",
      "en-US": "/en",
      "x-default": "/",
    },
  },
  verification: {
    google: "-1beEzZn8Yipt2lsWvNX6MWN4-JE7yl37EUwYxSFE28",
    yandex: "1c162c59aa930982",
    other: {
      "baidu-site-verification": ["codeva-y6DooOdxaK"],
    },
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: ZH_TITLE,
    description: ZH_DESCRIPTION,
    url: SITE_URL,
    locale: "zh_CN",
    alternateLocale: ["en_US"],
  },
  twitter: {
    card: "summary_large_image",
    title: EN_TITLE,
    description: EN_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const siteJsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/favicon.svg`,
    sameAs: [],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: ["zh-CN", "en-US"],
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/gallery?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`dark ${jakarta.variable} ${inter.variable}`}
      style={{
        ["--font-jetbrains" as string]:
          '"SF Mono", "Cascadia Code", "Fira Code", ui-monospace, monospace',
      }}
    >
      <body className="font-[family-name:var(--font-inter)] antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
