import type { MetadataRoute } from "next";
import { desc, eq } from "drizzle-orm";
import { posts } from "@/lib/blog";
import { db } from "@/lib/db";
import { galleryItems } from "@/lib/db/schema";

const SITE_URL = "https://video.yeadon.top";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
      alternates: {
        languages: {
          "zh-CN": SITE_URL,
          "en-US": `${SITE_URL}/en`,
        },
      },
    },
    {
      url: `${SITE_URL}/gallery`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/blog`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/register`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
  ];

  const blogEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  let galleryEntries: MetadataRoute.Sitemap = [];
  try {
    const items = await db
      .select({
        id: galleryItems.id,
        createdAt: galleryItems.createdAt,
      })
      .from(galleryItems)
      .where(eq(galleryItems.isApproved, true))
      .orderBy(desc(galleryItems.createdAt))
      .limit(1000);

    galleryEntries = items.map((item) => ({
      url: `${SITE_URL}/gallery/${item.id}`,
      lastModified: item.createdAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
  } catch (err) {
    console.error("[sitemap] failed to load gallery items:", err);
  }

  return [...staticEntries, ...blogEntries, ...galleryEntries];
}
