import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow external images from R2 CDN and video providers
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.r2.dev",
      },
      {
        protocol: "https",
        hostname: "**.bltcy.ai",
      },
      {
        protocol: "https",
        hostname: "**.workers.dev",
      },
    ],
  },
  // Serverless function timeout for SSE streaming (Vercel Pro)
  serverExternalPackages: ["postgres"],
  // Suppress turbopack root warning in monorepo
  turbopack: {
    root: ".",
  },
};

export default nextConfig;
