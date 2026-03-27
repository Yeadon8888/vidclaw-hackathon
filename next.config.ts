import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack is the default in Next.js 16; empty config acknowledges this explicitly.
  // undici is server-only and loaded via require() at runtime — no bundler config needed.
  turbopack: {},
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
      {
        protocol: "https",
        hostname: "vc-upload.yeadon.top",
      },
    ],
  },
  // Serverless function timeout for SSE streaming (Vercel Pro)
  serverExternalPackages: ["postgres"],
  // Security headers
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https://*.r2.dev https://*.workers.dev https://*.bltcy.ai https://vc-upload.yeadon.top",
            "media-src 'self' blob: https:",
            "font-src 'self' data:",
            "connect-src 'self' https://*.supabase.co https://*.r2.dev https://*.workers.dev https://*.bltcy.ai https://vc-upload.yeadon.top",
            "frame-ancestors 'none'",
          ].join("; "),
        },
      ],
    },
  ],
};

export default nextConfig;
