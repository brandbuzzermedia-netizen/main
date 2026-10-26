import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lead data is tenant-scoped and must be read fresh per request, so Cache Components
  // (static shells, cached reads) stays off. Every app page is dynamic and authenticated.
  cacheComponents: false,
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "6mb" } }, // CSV imports up to 5 MB
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
