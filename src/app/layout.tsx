import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter, JetBrains_Mono } from "next/font/google";
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

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["400", "500"],
});

const SITE_URL = "https://video.yeadon.top";

export const metadata: Metadata = {
  title: {
    default: "VidClaw V2 — AI Video Generator for E-Commerce",
    template: "%s | VidClaw V2",
  },
  description:
    "Create high-converting product videos in minutes. Paste a Douyin/TikTok link or describe a theme — AI generates scripts, videos, and marketing copy automatically. Powered by VEO 3.1 & Sora.",
  keywords: [
    "AI video generator",
    "product video maker",
    "e-commerce video",
    "short video automation",
    "Sora video",
    "VEO video generation",
    "Douyin video remix",
    "TikTok video creator",
    "AI 短视频生成",
    "带货视频",
    "抖音二创",
  ],
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  verification: {
    google: "-1beEzZn8Yipt2lsWvNX6MWN4-JE7yl37EUwYxSFE28",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
  },
  openGraph: {
    type: "website",
    siteName: "VidClaw V2",
    title: "VidClaw V2 — AI Video Generator for E-Commerce",
    description:
      "Paste a link or describe a theme. AI generates product videos with scripts and marketing copy in minutes.",
    url: SITE_URL,
    locale: "zh_CN",
  },
  twitter: {
    card: "summary_large_image",
    title: "VidClaw V2 — AI Video Generator",
    description:
      "Create product videos in minutes with AI. Supports Douyin/TikTok remix, video upload, and theme-to-video.",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`dark ${jakarta.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-[family-name:var(--font-inter)] antialiased">
        {children}
      </body>
    </html>
  );
}
