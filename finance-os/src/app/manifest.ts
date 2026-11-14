import type { MetadataRoute } from "next";

/** Lets phones install the OS as an app: home-screen icon, full screen, brand colours. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Diwani Parivaar OS",
    short_name: "Diwani OS",
    description: "Run every Diwani Parivaar business from one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F5F1E8",
    theme_color: "#173F32",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
