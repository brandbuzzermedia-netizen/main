import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "GBS Finance OS", template: "%s · GBS Finance OS" },
  description: "Collections, billing follow-ups and cash flow for Get Bee Seen.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${archivo.variable} h-full antialiased`}>
      <body className="min-h-full font-sans text-[15px]">{children}</body>
    </html>
  );
}
