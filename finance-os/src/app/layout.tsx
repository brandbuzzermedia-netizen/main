import type { Metadata } from "next";
import { Caprasimo, Figtree, Newsreader, Outfit } from "next/font/google";
import "./globals.css";

// The Company OS design's typefaces: Figtree for text, Newsreader for the group, and each
// company's own display face (Caprasimo for GBS, Outfit for Brightwire and IYP, Baloo 2 for Tan O' Fun).
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"] });
const caprasimo = Caprasimo({ variable: "--font-caprasimo", subsets: ["latin"], weight: "400" });
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
// Baloo 2 is loaded by stylesheet: Turbopack's next/font build fails on it (Webpack builds it fine).

export const metadata: Metadata = {
  title: { default: "Diwani Parivaar OS", template: "%s · Diwani Parivaar OS" },
  description: "Private operating system for the Diwani Parivaar family business group.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${figtree.variable} ${newsreader.variable} ${caprasimo.variable} ${outfit.variable} h-full antialiased`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700&display=swap" />
      </head>
      <body className="min-h-full font-sans text-[15px]">{children}</body>
    </html>
  );
}
