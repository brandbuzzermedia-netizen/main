// Browser-side logo tools for the branding form: measure what a logo looks
// like (so reports know whether it needs a backing) and remove a plain
// background colour around it. Runs on a canvas; nothing leaves the browser.
import type { LogoTone } from "@/lib/report/types";

async function load(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

function pixels(img: HTMLImageElement) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return { c, ctx, data: ctx.getImageData(0, 0, c.width, c.height) };
}

const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * "boxed" when the logo fills its image with an opaque background (it then
 * needs no backing), otherwise "light" or "dark" from its visible pixels.
 */
export async function measureLogo(src: string): Promise<LogoTone> {
  const { data } = pixels(await load(src));
  const d = data.data, n = d.length / 4;
  let opaque = 0, edgeOpaque = 0, edge = 0, sum = 0;
  const w = data.width, h = data.height;
  for (let i = 0; i < n; i++) {
    const a = d[i * 4 + 3];
    const x = i % w, y = (i / w) | 0;
    const onEdge = x < 2 || y < 2 || x >= w - 2 || y >= h - 2;
    if (onEdge) { edge++; if (a > 200) edgeOpaque++; }
    if (a > 128) { opaque++; sum += lum(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); }
  }
  if (edge && edgeOpaque / edge > 0.9 && opaque / n > 0.9) {
    // An opaque rectangle: a white or near-white one reads as a dark logo on a white sheet.
    return sum / opaque > 235 ? "dark" : "boxed";
  }
  return opaque && sum / opaque > 170 ? "light" : "dark";
}

/**
 * Makes the background colour around the logo transparent and trims the
 * empty edges. The background is the colour along the logo's outer edge; it
 * is removed only where it connects to that edge, so the same colour inside
 * the logo is kept. Run it again to remove a second layer (e.g. a white
 * margin around a coloured box).
 */
export async function removeBackground(src: string): Promise<Blob> {
  const img = await load(src);
  const { c, ctx, data } = pixels(img);
  const d = data.data, w = data.width, h = data.height;
  // Bounds of the visible logo, and the background colour along them.
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 16) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) throw new Error("The logo is empty.");
  const ring: number[] = [];
  for (let x = x0; x <= x1; x++) ring.push(y0 * w + x, y1 * w + x);
  for (let y = y0; y <= y1; y++) ring.push(y * w + x0, y * w + x1);
  const opaqueRing = ring.filter((i) => d[i * 4 + 3] > 200);
  if (!opaqueRing.length) throw new Error("This logo already has a transparent background.");
  const chan = (k: number) => { const v = opaqueRing.map((i) => d[i * 4 + k]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const bg = [chan(0), chan(1), chan(2)];
  const dist = (i: number) => Math.hypot(d[i * 4] - bg[0], d[i * 4 + 1] - bg[1], d[i * 4 + 2] - bg[2]);
  const TOL = 60, SOFT = 110;
  // Flood fill from the edge through background-coloured (or already clear) pixels.
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (const i of ring) if (d[i * 4 + 3] <= 16 || dist(i) < TOL) { seen[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w, y = (i / w) | 0;
    d[i * 4 + 3] = 0;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j < 0 || seen[j]) continue;
      seen[j] = 1;
      if (d[j * 4 + 3] <= 16 || dist(j) < TOL) stack.push(j);
      else if (dist(j) < SOFT) d[j * 4 + 3] = Math.min(d[j * 4 + 3], Math.round((255 * (dist(j) - TOL)) / (SOFT - TOL))); // soft edge
    }
  }
  ctx.putImageData(data, 0, 0);
  // Trim to what is left, with a small margin.
  let tx0 = w, ty0 = h, tx1 = -1, ty1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 24) { tx0 = Math.min(tx0, x); ty0 = Math.min(ty0, y); tx1 = Math.max(tx1, x); ty1 = Math.max(ty1, y); }
  if (tx1 < 0) throw new Error("Nothing would be left of the logo. It may be a single colour.");
  const m = Math.round(Math.max(tx1 - tx0, ty1 - ty0) * 0.03);
  const ox = Math.max(0, tx0 - m), oy = Math.max(0, ty0 - m), ow = Math.min(w, tx1 + m + 1) - ox, oh = Math.min(h, ty1 + m + 1) - oy;
  const out = document.createElement("canvas");
  out.width = ow; out.height = oh;
  out.getContext("2d")!.drawImage(c, ox, oy, ow, oh, 0, 0, ow, oh);
  return new Promise((ok, bad) => out.toBlob((b) => (b ? ok(b) : bad(new Error("The logo could not be saved."))), "image/png"));
}
