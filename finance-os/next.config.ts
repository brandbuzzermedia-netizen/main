import type { NextConfig } from "next";

// Third-party origins the browser talks to: Supabase (auth, signed document links) and Google Maps
// (Field Sales map and address search; loaded only when NEXT_PUBLIC_GOOGLE_MAPS_KEY is set).
const supabaseOrigin = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin; } catch { return ""; }
})();
const csp = [
  "default-src 'self'",
  // Next.js inlines its bootstrap scripts; the only third-party scripts are Google Maps'.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://maps.googleapis.com https://maps.gstatic.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  `img-src 'self' data: blob: ${supabaseOrigin} https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.googleusercontent.com`,
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self' ${supabaseOrigin} https://*.googleapis.com https://*.gstatic.com https://*.google.com`,
  "worker-src 'self' blob:",
  `frame-src ${supabaseOrigin || "'none'"}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Finance data must always be read fresh per request, so Cache Components (static
  // shells, cached reads) stays off. Every page here is dynamic and authenticated.
  cacheComponents: false,
  poweredByHeader: false,
  // Logos, bills and vault documents are uploaded through server actions (Vercel allows up to 4.5 MB per request).
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
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
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
