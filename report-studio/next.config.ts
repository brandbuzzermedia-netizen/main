import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright launches a real browser; keep it out of the server bundle.
  serverExternalPackages: ["playwright", "playwright-core"],
};

export default nextConfig;
