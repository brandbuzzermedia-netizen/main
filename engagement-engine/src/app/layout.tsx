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
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
