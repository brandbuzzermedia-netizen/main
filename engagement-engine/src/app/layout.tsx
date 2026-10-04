import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "GBS Engagement Engine", template: "%s · GBS Engagement Engine" },
  description: "AI-assisted, human-approved social engagement for Get Bee Seen clients.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Free stand-ins for the brand faces (Bunga, Neue Leiden); licensed files win if installed. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Archivo:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
