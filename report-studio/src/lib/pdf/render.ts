// Server-side PDF rendering with Playwright. One headless Chromium is kept
// warm per server process and each export gets its own browser context.
import { chromium, type Browser } from "playwright";

const g = globalThis as unknown as { __gbsBrowser?: Promise<Browser> };

function browser(): Promise<Browser> {
  if (!g.__gbsBrowser) {
    g.__gbsBrowser = chromium
      .launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined })
      .then((b) => {
        b.on("disconnected", () => (g.__gbsBrowser = undefined));
        return b;
      })
      .catch((e) => {
        g.__gbsBrowser = undefined;
        throw e;
      });
  }
  return g.__gbsBrowser;
}

export interface RenderOptions {
  /** Absolute URL of the print page. */
  url: string;
  /** Session cookies forwarded so the print page loads as the same user (the print page requires a valid session). */
  cookies: { name: string; value: string }[];
}

export async function renderPdf({ url, cookies }: RenderOptions): Promise<Buffer> {
  const context = await (await browser()).newContext();
  try {
    if (cookies.length) await context.addCookies(cookies.map((c) => ({ ...c, url: new URL(url).origin })));
    const page = await context.newPage();
    const res = await page.goto(url, { waitUntil: "networkidle" });
    if (!res || !res.ok()) throw new Error(`Print page returned ${res?.status() ?? "no response"}`);
    await page.emulateMedia({ media: "print" });
    // Embedded fonts and images must be ready, or the PDF falls back to system fonts.
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images).map((img) =>
          img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }),
        ),
      );
    });
    // Explicit A4 rather than preferCSSPageSize: the CSS route rounds the page
    // to 841.92 x 594.96 pt, while 297 x 210 mm gives 841.92 x 595.92 pt,
    // the same paper as browser print and the reference PDF.
    return await page.pdf({ printBackground: true, width: "297mm", height: "210mm" });
  } finally {
    await context.close();
  }
}
