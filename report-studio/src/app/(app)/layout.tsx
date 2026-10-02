import type { Metadata } from "next";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "GBS Client Report Studio", template: "%s · GBS Client Report Studio" },
  description: "Monthly client performance reports by Get Bee Seen.",
  icons: { icon: "/brand/bee.png" },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={fontVariables}>{children}</body>
    </html>
  );
}
