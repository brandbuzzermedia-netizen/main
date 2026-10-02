import { fontVariables } from "@/lib/fonts";

// Bare root layout for the print view: report CSS only, no studio chrome or
// Tailwind, so what Playwright prints is exactly the report pages.
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={fontVariables} style={{ margin: 0, background: "#fff" }}>
        {children}
      </body>
    </html>
  );
}
