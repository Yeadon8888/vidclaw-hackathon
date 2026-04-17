import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { galleryItems, users } from "@/lib/db/schema";
import GalleryDetailClient from "./GalleryDetailClient";

const SITE_URL = "https://video.yeadon.top";

async function getItem(id: string) {
  const [item] = await db
    .select({
      id: galleryItems.id,
      title: galleryItems.title,
      videoUrl: galleryItems.videoUrl,
      thumbnailUrl: galleryItems.thumbnailUrl,
      prompt: galleryItems.prompt,
      modelSlug: galleryItems.modelSlug,
      tags: galleryItems.tags,
      createdAt: galleryItems.createdAt,
      authorName: users.name,
    })
    .from(galleryItems)
    .innerJoin(users, eq(galleryItems.userId, users.id))
    .where(eq(galleryItems.id, id))
    .limit(1);
  return item ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const item = await getItem(id).catch(() => null);
  if (!item) {
    return {
      title: "作品不存在",
      robots: { index: false, follow: false },
    };
  }

  const url = `${SITE_URL}/gallery/${id}`;
  const description =
    item.prompt?.slice(0, 150) ??
    `AI 带货视频作品：${item.title}。查看 Prompt 与分镜脚本，一键复用灵感创作同款视频。`;

  return {
    title: item.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "video.other",
      title: item.title,
      description,
      url,
      videos: [{ url: item.videoUrl, type: "video/mp4" }],
      images: item.thumbnailUrl ? [{ url: item.thumbnailUrl }] : undefined,
      locale: "zh_CN",
    },
    twitter: {
      card: "player",
      title: item.title,
      description,
    },
  };
}

export default async function GalleryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await getItem(id).catch(() => null);

  const jsonLd = item
    ? {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        name: item.title,
        description:
          item.prompt?.slice(0, 300) ?? `AI 生成的带货视频作品：${item.title}`,
        thumbnailUrl: item.thumbnailUrl ?? undefined,
        uploadDate:
          item.createdAt instanceof Date
            ? item.createdAt.toISOString()
            : item.createdAt,
        contentUrl: item.videoUrl,
        embedUrl: `${SITE_URL}/gallery/${id}`,
        keywords: item.tags?.join(", "),
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <GalleryDetailClient />
    </>
  );
}
