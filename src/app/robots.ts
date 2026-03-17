import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/generate", "/tasks", "/assets", "/settings", "/admin"],
      },
    ],
    sitemap: "https://video.yeadon.top/sitemap.xml",
  };
}
