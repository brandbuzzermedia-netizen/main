import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright launches a real browser; keep it out of the server bundle.
  serverExternalPackages: ["playwright", "playwright-core"],
  // Report forms carry screenshots (up to 10 MB each).
  experimental: { serverActions: { bodySizeLimit: "60mb" } },
};

export default nextConfig;
