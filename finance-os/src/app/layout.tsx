import type { Metadata } from "next";
import { Baloo_2, Caprasimo, Figtree, Newsreader, Outfit } from "next/font/google";
import "./globals.css";

// The Company OS design's typefaces: Figtree for text, Newsreader for the group, and each
// company's own display face (Caprasimo for GBS, Outfit for Brightwire and IYP, Baloo 2 for Tan O' Fun).
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"] });
const caprasimo = Caprasimo({ variable: "--font-caprasimo", subsets: ["latin"], weight: "400" });
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const baloo = Baloo_2({ variable: "--font-baloo", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "Diwani Parivaar OS", template: "%s · Diwani Parivaar OS" },
  description: "Private operating system for the Diwani Parivaar family business group.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${figtree.variable} ${newsreader.variable} ${caprasimo.variable} ${outfit.variable} ${baloo.variable} h-full antialiased`}>
      <body className="min-h-full font-sans text-[15px]">{children}</body>
    </html>
  );
}
