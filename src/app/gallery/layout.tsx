import type { Metadata } from "next";

const SITE_URL = "https://video.yeadon.top";

export const metadata: Metadata = {
  title: "灵感广场 — AI 带货视频作品社区",
  description:
    "浏览 VidClaw 社区生成的 AI 带货短视频作品，查看 Sora、VEO 3.1、海螺等模型的 Prompt 与分镜脚本，一键复用灵感。",
  alternates: {
    canonical: "/gallery",
  },
  openGraph: {
    type: "website",
    title: "VidClaw 灵感广场 — AI 带货视频作品社区",
    description:
      "浏览 AI 生成的带货短视频作品，查看 Prompt 与脚本，一键复用灵感。",
    url: `${SITE_URL}/gallery`,
    locale: "zh_CN",
  },
};

export default function GalleryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--vc-bg-root)]">{children}</div>
  );
}
