// In-browser versions of the studio's server actions, using the same
// validation (parseClientForm, parseReportForm) and the same upload rules.
import type { BrandFormState, FormState, ReportFormState } from "@/lib/forms";
import { parseReportForm } from "@/lib/report/parse";
import { PLATFORM_LABELS, type Platform, type SourceShot } from "@/lib/report/types";
import { parseClientForm } from "@/lib/validation";
import { DEFAULT_BRAND, reportId } from "@/lib/data/shared";
import { navigate } from "./router";
import * as db from "./store";

const MAX = 10 * 1024 * 1024;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const isFile = (v: FormDataEntryValue | null): v is File => typeof v === "object" && v !== null && v.size > 0;

class UploadError extends Error {}
async function readImage(file: File) {
  if (!TYPES.has(file.type)) throw new UploadError(`${file.name} is not a PNG, JPG or WebP image.`);
  if (file.size > MAX) throw new UploadError(`${file.name} is larger than 10 MB.`);
  const buf = await file.arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buf)), (b) => b.toString(16).padStart(2, "0")).join("");
  const url = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(file); });
  return { hash, url, name: file.name.slice(0, 120) };
}

/**
 * A post cover, scaled down to at most 720 x 900 px (twice its largest size in
 * a report) and saved as JPEG, so covers keep storage and backups small.
 */
async function coverImage(file: File): Promise<string> {
  const { url } = await readImage(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  const k = Math.min(1, 720 / img.naturalWidth, 900 / img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * k); canvas.height = Math.round(img.naturalHeight * k);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.86);
}

export async function signIn(_: FormState, fd: FormData): Promise<FormState> {
  db.signInAs(String(fd.get("name") ?? "").trim().slice(0, 60));
  navigate("/");
  return {};
}

export async function saveClient(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseClientForm(fd);
  if (!parsed.ok) return { fields: parsed.errors };
  const id = typeof fd.get("id") === "string" ? String(fd.get("id")) : "";
  if (id) db.updateClient(id, parsed.value);
  const target = id || db.createClient(parsed.value);
  if (!id) {
    const hex = /^#[0-9a-fA-F]{6}$/, primary = String(fd.get("primary") ?? ""), accent = String(fd.get("accent") ?? ""), logo = fd.get("logo");
    const brand = { ...DEFAULT_BRAND, primary: hex.test(primary) ? primary : DEFAULT_BRAND.primary, accent: hex.test(accent) ? accent : DEFAULT_BRAND.accent };
    const tone = String(fd.get("logoTone") ?? "");
    if (tone === "light" || tone === "dark" || tone === "boxed") Object.assign(brand, { logoTone: tone });
    try { if (isFile(logo)) brand.logo = (await readImage(logo)).url; } catch (e) { if (e instanceof UploadError) return { error: e.message }; throw e; }
    db.setClientBrand(target, brand);
  }
  navigate(`/clients/${target}`);
  return {};
}

export async function saveReport(_: ReportFormState, fd: FormData): Promise<ReportFormState> {
  const get = (k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : null);
  const parsed = parseReportForm(get, get("content"), (k) => fd.getAll(k).filter((v): v is string => typeof v === "string"));
  if (!parsed.ok) return { errors: parsed.errors, error: "Some fields need attention. They are marked below." };
  const existingId = get("id");
  const clientId = existingId ? db.getReportRecord(existingId)?.clientId : get("clientId");
  if (!clientId || !db.getClient(clientId)) return { errors: { clientId: "Choose a client." } };
  if (!existingId && db.getReportRecord(reportId(clientId, parsed.value.data.period.start))) {
    return { errors: { periodStart: "This client already has a report for that month. Open it from Reports to edit it." } };
  }
  const before = existingId ? db.getReportDoc(existingId)?.uploads ?? {} : {};
  const uploads: Partial<Record<Platform, SourceShot[]>> = {};
  const seen = new Set<string>();
  let dupes = 0;
  try {
    for (const p of Object.keys(PLATFORM_LABELS) as Platform[]) {
      const keep = new Set(fd.getAll(`keep.${p}`).map(String));
      const list = (before[p] ?? []).filter((f) => f.hash && keep.has(f.hash));
      list.forEach((f) => seen.add(f.hash!));
      for (const file of fd.getAll(`shots.${p}`)) {
        if (!isFile(file)) continue;
        const img = await readImage(file);
        if (seen.has(img.hash)) { dupes++; continue; }
        seen.add(img.hash);
        list.push({ name: img.name, url: img.url, hash: img.hash });
      }
      if (list.length) uploads[p] = list;
    }
    // Post covers: a new file replaces the cover; a kept cover must already be stored in the browser.
    const rowsIn = (() => { try { return JSON.parse(get("content") || "[]") as { key?: string }[]; } catch { return []; } })();
    for (const [i, c] of parsed.value.data.content.entries()) {
      const key = rowsIn[i]?.key;
      const file = key ? fd.get(`cover.${key}`) : null;
      if (isFile(file)) c.img = await coverImage(file);
      else if (c.img && !c.img.startsWith("data:image/")) c.img = null;
    }
  } catch (e) {
    if (e instanceof UploadError) return { error: e.message };
    throw e;
  }
  // A copy only ever comes from a report of the same client.
  let copy = {};
  const copyFrom = get("copyFrom"), copyKind = get("copyKind");
  if (!existingId && copyFrom && (copyKind === "next-month" || copyKind === "duplicate")) {
    const src = db.getReportDoc(copyFrom);
    if (src && src.client.id === clientId) copy = { copiedFrom: { id: src.id, kind: copyKind }, rows: src.rows ? structuredClone(src.rows) : null, titles: copyKind === "duplicate" ? Object.fromEntries(Object.entries(src.titles).filter(([k]) => k !== "cover")) : {} };
  }
  const id = db.saveReportData(existingId, clientId, parsed.value, uploads, copy);
  navigate(`/reports/${id}${dupes ? `?duplicates=${dupes}` : ""}`);
  return {};
}

export async function saveBrand(_: BrandFormState, fd: FormData): Promise<BrandFormState> {
  const id = String(fd.get("clientId"));
  const client = db.getClient(id);
  if (!client) return { error: "Client not found." };
  const primary = String(fd.get("primary") ?? ""), accent = String(fd.get("accent") ?? "");
  if (!/^#[0-9a-fA-F]{6}$/.test(primary) || !/^#[0-9a-fA-F]{6}$/.test(accent)) return { error: "Choose both brand colours." };
  const tone = String(fd.get("logoTone") ?? ""), plate = String(fd.get("logoPlate") ?? "auto"), art = String(fd.get("art") ?? "auto");
  const brand = {
    ...(client.brand ?? DEFAULT_BRAND), primary, accent,
    logoTone: tone === "light" || tone === "dark" || tone === "boxed" ? (tone as "light" | "dark" | "boxed") : null,
    logoPlate: plate === "white" || plate === "none" ? (plate as "white" | "none") : ("auto" as const),
    art: /^[a-z]{2,20}$/.test(art) ? art : "auto",
  };
  try {
    const logo = fd.get("logo"), cover = fd.get("cover");
    if (isFile(logo)) brand.logo = (await readImage(logo)).url; else if (fd.get("removeLogo")) { brand.logo = null; brand.logoTone = null; }
    if (isFile(cover)) brand.cover = (await readImage(cover)).url; else if (fd.get("removeCover")) brand.cover = null;
  } catch (e) {
    if (e instanceof UploadError) return { error: e.message };
    throw e;
  }
  db.setClientBrand(id, brand);
  return { saved: true };
}
