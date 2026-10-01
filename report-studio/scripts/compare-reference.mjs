#!/usr/bin/env node
// Checks a generated report PDF against the prototype, page by page.
//
//   node scripts/compare-reference.mjs --fetch http://127.0.0.1:3000   (server in demo mode)
//   node scripts/compare-reference.mjs generated.pdf
//
// Two baselines:
//   prototype  prototype/gbs-client-report-studio.html, exported through the
//              same Playwright pipeline and the same self-hosted fonts as the
//              app. Pixel comparison; this is the pass/fail check.
//   reference  reference/*.pdf, the prototype's original export. Every number
//              on every page must match it. Pixels are reported but not
//              enforced: that file was printed in a different browser setup
//              whose glyph advances are wider, and the prototype itself
//              differs from it by the same 0.4-3.3% per page when exported here.
//
// KNOWN_DEVIATIONS lists pages that intentionally differ from the prototype.
//
// PDFs are rasterised at 96 dpi with pdftoppm (poppler-utils), so one image
// pixel is one CSS pixel, and compared in headless Chromium. A pixel counts
// as different when any channel differs by more than THRESHOLD. Diff images
// (changes in red) go to compare-output/. Exits non-zero on any failure.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "..");
const REFERENCE = join(ROOT, "reference", "Thrishank-Doors_Monthly-Report_August-2026_GBS.pdf");
const PROTOTYPE = join(ROOT, "prototype", "gbs-client-report-studio.html");
const FONTS = join(ROOT, "src", "fonts");
const OUT = join(ROOT, "compare-output");
const THRESHOLD = Number(process.env.THRESHOLD ?? 48);
const MAX_PCT = Number(process.env.MAX_PCT ?? 0.1);
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

// Prototype bug: the rating pill on top pieces has class "top", which the
// prototype's print CSS hides (it is also the studio header class). The port
// shows "Top performing on views" as intended. Allowed up to MAX_KNOWN_PCT.
const KNOWN_DEVIATIONS = {
  7: "Top performing on views pill restored (hidden by a class clash in the prototype)",
  8: "Top performing on views pill restored (hidden by a class clash in the prototype)",
};
const MAX_KNOWN_PCT = 0.5;

const args = process.argv.slice(2);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let generated = args[0];
if (args[0] === "--fetch") {
  const origin = args[1] || "http://127.0.0.1:3000";
  const res = await fetch(`${origin}/api/reports/thrishank-2026-08/pdf`, { headers: { cookie: "gbs_demo_session=1" } });
  if (!res.ok) throw new Error(`PDF route returned ${res.status}: ${await res.text()}`);
  generated = join(OUT, "generated.pdf");
  writeFileSync(generated, Buffer.from(await res.arrayBuffer()));
}
if (!generated) {
  console.error("Usage: compare-reference.mjs <generated.pdf> | --fetch <origin>");
  process.exit(2);
}

const browser = await chromium.launch({ executablePath });

// --- Export the prototype exactly as the app exports reports. Its Google
// Fonts request is answered with the app's self-hosted static fonts.
const FACES = [
  ["Instrument Serif", 400, "normal", "InstrumentSerif-Regular"], ["Instrument Serif", 400, "italic", "InstrumentSerif-Italic"],
  ["Hanken Grotesk", 400, "normal", "HankenGrotesk-Regular"], ["Hanken Grotesk", 500, "normal", "HankenGrotesk-Medium"],
  ["Hanken Grotesk", 600, "normal", "HankenGrotesk-SemiBold"], ["Hanken Grotesk", 700, "normal", "HankenGrotesk-Bold"],
  ["Baloo 2", 600, "normal", "Baloo2-SemiBold"], ["Baloo 2", 700, "normal", "Baloo2-Bold"], ["Baloo 2", 800, "normal", "Baloo2-ExtraBold"],
  ["Poppins", 400, "normal", "Poppins-Regular"], ["Poppins", 500, "normal", "Poppins-Medium"],
  ["Poppins", 600, "normal", "Poppins-SemiBold"], ["Poppins", 700, "normal", "Poppins-Bold"],
];
const fontCss = FACES.map(([f, w, s, file]) => `@font-face{font-family:'${f}';font-style:${s};font-weight:${w};font-display:block;src:url(https://fonts.local/${file}.ttf) format('truetype')}`).join("\n");
const protoPdf = join(OUT, "prototype.pdf");
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith("https://fonts.googleapis.com/css2")) return route.fulfill({ contentType: "text/css", body: fontCss });
    if (url.startsWith("https://fonts.local/")) return route.fulfill({ contentType: "font/ttf", body: readFileSync(join(FONTS, basename(new URL(url).pathname))) });
    if (url.startsWith("file:") || url.startsWith("data:")) return route.continue();
    return route.abort();
  });
  await page.goto("file://" + PROTOTYPE);
  await page.click("[data-act=login]");
  await page.click("[data-act=open][data-id=r1]");
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => document.querySelector("#pages").style.setProperty("--s", "1"));
  await page.pdf({ path: protoPdf, printBackground: true, width: "297mm", height: "210mm" });
  await page.close();
}

// --- Helpers
const raster = (pdf, prefix) => {
  execFileSync("pdftoppm", ["-r", "96", "-png", pdf, join(OUT, prefix)]);
  return readdirSync(OUT).filter((f) => f.startsWith(prefix + "-") && f.endsWith(".png")).sort().map((f) => join(OUT, f));
};
const pageCount = (pdf) => Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [pdf]).toString())[1]);
const pageText = (pdf, n) => execFileSync("pdftotext", ["-f", String(n), "-l", String(n), "-raw", pdf, "-"]).toString();
/** Every figure on a page, in order: 81,560 / 98.4% / ₹8,474.59 / +49 / 2.1×. */
const numbers = (text) => (text.match(/[₹+−-]?\d[\d,]*(\.\d+)?[%×K]?/g) ?? []).join(" ");

const cmp = await browser.newPage();
async function pixelDiff(a, b, diffPath) {
  const toUrl = (f) => "data:image/png;base64," + readFileSync(f).toString("base64");
  const r = await cmp.evaluate(async ({ a, b, threshold }) => {
    const load = (src) => new Promise((ok, err) => { const im = new Image(); im.onload = () => ok(im); im.onerror = err; im.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
    const px = (im) => { const c = new OffscreenCanvas(w, h), x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0); return x.getImageData(0, 0, w, h); };
    const da = px(ia), db = px(ib), out = new ImageData(w, h);
    let diff = 0;
    for (let p = 0; p < da.data.length; p += 4) {
      const d = Math.max(Math.abs(da.data[p] - db.data[p]), Math.abs(da.data[p + 1] - db.data[p + 1]), Math.abs(da.data[p + 2] - db.data[p + 2]));
      if (d > threshold) { diff++; out.data.set([255, 0, 0, 255], p); }
      else { const g = 255 - (255 - (da.data[p] + da.data[p + 1] + da.data[p + 2]) / 3) * 0.25; out.data.set([g, g, g, 255], p); }
    }
    const c = new OffscreenCanvas(w, h);
    c.getContext("2d").putImageData(out, 0, 0);
    const bytes = new Uint8Array(await (await c.convertToBlob({ type: "image/png" })).arrayBuffer());
    let bin = "";
    for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
    return { diff, total: w * h, same: ia.width === ib.width && ia.height === ib.height, png: btoa(bin) };
  }, { a: toUrl(a), b: toUrl(b), threshold: THRESHOLD });
  writeFileSync(diffPath, Buffer.from(r.png, "base64"));
  return { pct: (r.diff / r.total) * 100, same: r.same };
}

// --- Compare
let failed = false;
const n = pageCount(generated), nRef = pageCount(REFERENCE), nProto = pageCount(protoPdf);
if (n !== nRef || n !== nProto) {
  failed = true;
  console.log(`Page count differs: generated ${n}, prototype ${nProto}, reference ${nRef}`);
}
const gen = raster(generated, "gen"), proto = raster(protoPdf, "proto"), ref = raster(REFERENCE, "ref");
console.log("page   vs prototype (pixels)   vs reference (numbers, pixels)");
for (let i = 0; i < Math.min(n, nRef, nProto); i++) {
  const k = String(i + 1).padStart(2, "0");
  const p = await pixelDiff(proto[i], gen[i], join(OUT, `diff-prototype-${k}.png`));
  const r = await pixelDiff(ref[i], gen[i], join(OUT, `diff-reference-${k}.png`));
  const numsOk = numbers(pageText(generated, i + 1)) === numbers(pageText(REFERENCE, i + 1));
  const known = KNOWN_DEVIATIONS[i + 1];
  const pixelFail = p.pct > (known ? MAX_KNOWN_PCT : MAX_PCT) || !p.same;
  if (pixelFail || !numsOk) failed = true;
  const verdict = pixelFail ? " FAIL " : known && p.pct > MAX_PCT ? " known" : "      ";
  console.log(`${k}     ${p.pct.toFixed(3).padStart(7)}%${p.same ? "" : " size!"}${verdict}           ${numsOk ? "numbers same" : "NUMBERS DIFFER"}, ${r.pct.toFixed(2)}%`);
}
await browser.close();
console.log(failed
  ? `FAIL: see ${OUT}`
  : `PASS: ${n} pages; every number matches the reference; pixels within ${MAX_PCT}% of the prototype (channel threshold ${THRESHOLD}) apart from known deviations:\n` +
    Object.entries(KNOWN_DEVIATIONS).map(([pg, why]) => `  page ${pg}: ${why}`).join("\n"));
process.exit(failed ? 1 : 0);
