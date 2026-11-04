// Makes the report PDF in the browser, with no server and no print dialog.
//
// Each report page (1122 x 794 CSS px, A4 landscape) is drawn at twice its
// size: the page's markup and the report styles, with every font and image
// embedded, go into an SVG image, which is painted onto a canvas and saved
// as JPEG. The JPEGs are then written into a PDF with one A4 landscape page
// each, so the file always matches the preview exactly.

const PAGE_W = 1122, PAGE_H = 794;
const PT_W = 841.89, PT_H = 595.28; // A4 landscape in PDF points
const SCALE = 2;
const FONT_FAMILIES = ["Poppins", "Baloo 2", "GBS Report Arrows"];

const dataUrls = new Map<string, Promise<string>>();
function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return Promise.resolve(url);
  const abs = new URL(url, document.baseURI).href;
  if (!dataUrls.has(abs)) {
    dataUrls.set(abs, fetch(abs).then(async (r) => {
      if (!r.ok) throw new Error(`Could not load ${url}`);
      const blob = await r.blob();
      return new Promise<string>((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(blob); });
    }));
  }
  return dataUrls.get(abs)!;
}

/** The report styles plus the report fonts, with every url() embedded. */
async function reportCss(): Promise<string> {
  const parts: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    const base = sheet.href ?? document.baseURI;
    // Print rules apply as printed (they hide on-screen controls); other media rules are for the screen.
    const flat = Array.from(rules).flatMap((r) => r instanceof CSSMediaRule ? (/\bprint\b/.test(r.media.mediaText) ? Array.from(r.cssRules) : []) : [r]);
    for (const rule of flat) {
      const isFont = rule instanceof CSSFontFaceRule;
      if (isFont) {
        const fam = rule.style.getPropertyValue("font-family").replace(/["']/g, "").trim();
        if (!FONT_FAMILIES.includes(fam)) continue;
      } else if (!(sheet.href ?? "").includes("main.css")) continue; // report.css + report-type.css
      let text = rule.cssText;
      const urls = [...text.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]).filter((u) => !u.startsWith("data:"));
      for (const u of urls) text = text.split(u).join(await toDataUrl(new URL(u, base).href));
      parts.push(text);
    }
  }
  return parts.join("\n");
}

const xmlSafe = (s: string) => s.replace(/]]>/g, "]]]]><![CDATA[>");

async function pageToJpeg(page: HTMLElement, css: string): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  const clone = page.cloneNode(true) as HTMLElement;
  for (const img of Array.from(clone.querySelectorAll("img"))) {
    const src = img.getAttribute("src");
    if (src) img.setAttribute("src", await toDataUrl(src));
  }
  // Only the page box itself: the preview's scaling and shadow are left out.
  const vars = "--s:1;--font-poppins:'Poppins';--font-baloo:'Baloo 2'";
  const html = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}">` +
    `<foreignObject x="0" y="0" width="${PAGE_W}" height="${PAGE_H}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" class="pages report-root" style="${vars};display:block;margin:0;width:${PAGE_W}px;height:${PAGE_H}px">` +
    `<style><![CDATA[${xmlSafe(css)}]]></style>` +
    `<div class="pbox" style="width:${PAGE_W}px;height:${PAGE_H}px;box-shadow:none">${html}</div></div>` +
    `</foreignObject></svg>`;
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_W * SCALE; canvas.height = PAGE_H * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((ok, bad) => canvas.toBlob((b) => (b ? ok(b) : bad(new Error("The page could not be drawn."))), "image/jpeg", 0.92));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height };
}

/** A PDF with one full-page JPEG per page. */
function writePdf(pages: { bytes: Uint8Array; w: number; h: number }[], title: string): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (c: Uint8Array | string) => { const b = typeof c === "string" ? enc.encode(c) : c; chunks.push(b); length += b.length; };
  const obj = (n: number, body: (Uint8Array | string)[]) => { offsets[n] = length; push(`${n} 0 obj\n`); body.forEach(push); push("\nendobj\n"); };
  const n = pages.length;
  // Object numbers: 1 catalog, 2 pages, 3 info, then per page: page, content, image.
  const id = (i: number, k: 0 | 1 | 2) => 4 + i * 3 + k;
  const pdfText = (s: string) => "(" + s.replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7e]/g, "") + ")";
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  obj(2, [`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${id(i, 0)} 0 R`).join(" ")}] >>`]);
  obj(3, [`<< /Title ${pdfText(title)} /Producer (GBS Report Studio) >>`]);
  pages.forEach((p, i) => {
    const content = `q\n${PT_W} 0 0 ${PT_H} 0 0 cm\n/Im${i} Do\nQ\n`;
    obj(id(i, 0), [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PT_W} ${PT_H}] /Resources << /XObject << /Im${i} ${id(i, 2)} 0 R >> >> /Contents ${id(i, 1)} 0 R >>`]);
    obj(id(i, 1), [`<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`]);
    obj(id(i, 2), [`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`, p.bytes, "\nendstream"]);
  });
  const total = 4 + n * 3;
  const xref = length;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}

/**
 * Builds the PDF from the report pages rendered inside `root` and returns it.
 * `onProgress` is called before each page is drawn.
 */
export async function buildReportPdf(root: HTMLElement, title: string, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  await document.fonts.ready;
  const pages = Array.from(root.querySelectorAll<HTMLElement>("section.page"));
  if (!pages.length) throw new Error("There are no report pages to save.");
  const css = await reportCss();
  // Fonts inside an SVG image load asynchronously and text stays invisible
  // until they do. Draw the first page once and discard it, so every font is
  // decoded before the real pages are drawn.
  await pageToJpeg(pages[0], css);
  await new Promise((r) => setTimeout(r, 300));
  const out = [];
  for (let i = 0; i < pages.length; i++) {
    onProgress?.(i, pages.length);
    out.push(await pageToJpeg(pages[i], css));
  }
  onProgress?.(pages.length, pages.length);
  return writePdf(out, title);
}

/** Saves a file to the computer's downloads. */
export function saveFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName; a.rel = "noopener";
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
