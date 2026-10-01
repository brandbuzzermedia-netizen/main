// Data access for the studio, backed by one JSON file on the server's disk
// (DATA_DIR/studio.json, default ./data). It is created from the Thrishank
// Doors seed fixture on first run. Writes go to a temporary file and are
// renamed into place, one at a time, so a crash never leaves a half-written
// file. Suited to one server instance; it is not a multi-server database.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cookies } from "next/headers";
import { SESSION_COOKIE, readSessionToken, type Session } from "@/lib/auth/session";
import { thrishankAugust2026 } from "@/lib/fixtures/thrishank-2026-08";
import { MONTHS, parseDay } from "@/lib/format";
import {
  type Brand, type InternalNote, type ReportData, type ReportDoc, type ReportStatus, type Resolution,
  type SectionKey, type SourceShot, type Template, type Platform,
} from "@/lib/report/types";

export type { Session };
export * from "./shared";
import { DEFAULT_BRAND, monthLabel, reportId, slugify, type ClientBrand, type ClientInput, type ClientRow, type ReportSummary } from "./shared";

/** A client share link. The token is the secret; the password is optional. */
export interface ShareInfo {
  token: string;
  createdAt: string;
  /** scrypt hash, see lib/auth/password.ts. */
  passwordHash: string | null;
}

/** A saved state of a report's written copy, so earlier text can be restored. */
export interface TextVersion {
  v: number;
  label: string;
  at: string;
  by: string;
  content: Pick<ReportDoc, "texts" | "variant" | "titles" | "rows">;
}

interface StoredReport {
  id: string;
  clientId: string;
  periodStart: string;
  status: ReportStatus;
  createdAt: string;
  doc: ReportDoc | null;
  share?: ShareInfo | null;
  versions?: TextVersion[];
}

export interface StudioSettings {
  defaultTemplate: Template;
}

interface Store {
  version: 1;
  clients: ClientRow[];
  reports: StoredReport[];
  settings?: StudioSettings;
}

// ------------------------------------------------------------------ file store

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");
const FILE = join(DATA_DIR, "studio.json");

function seed(): Store {
  const doc = thrishankAugust2026();
  const c = (id: string, name: string, industry: string, location: string | null): ClientRow => ({
    id, name, slug: slugify(name), industry, location, website: null, instagram: null, createdAt: "2026-06-01",
  });
  const r = (id: string, clientId: string, periodStart: string, status: ReportStatus, createdAt: string, d: ReportDoc | null = null): StoredReport => ({
    id, clientId, periodStart, status, createdAt, doc: d,
  });
  return {
    version: 1,
    clients: [
      c("thrishank", "Thrishank Doors", "Doors and architectural hardware", "Bengaluru, India"),
      c("lykes", "Lykes", "Retail", null),
      c("conic-gold", "Conic Gold", "Jewellery", null),
    ],
    reports: [
      r(doc.id, "thrishank", "2026-08-01", "Ready for review", "2026-09-03", doc),
      r("thrishank-2026-07", "thrishank", "2026-07-01", "Delivered", "2026-08-04"),
      r("thrishank-2026-06", "thrishank", "2026-06-01", "Delivered", "2026-07-03"),
      r("lykes-2026-08", "lykes", "2026-08-01", "Pending", "2026-09-30"),
      r("conic-gold-2026-08", "conic-gold", "2026-08-01", "Draft", "2026-10-01"),
    ],
  };
}

const g = globalThis as unknown as { __gbsWrites?: Promise<unknown>; __gbsSeeding?: Promise<void>; __gbsTmp?: number };

async function load(): Promise<Store> {
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as Store;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    // First run: create the file once, however many requests arrive together.
    g.__gbsSeeding ??= save(seed()).finally(() => (g.__gbsSeeding = undefined));
    await g.__gbsSeeding;
    return JSON.parse(await readFile(FILE, "utf8")) as Store;
  }
}

async function save(s: Store) {
  await mkdir(DATA_DIR, { recursive: true });
  // A unique temporary name per write, then an atomic rename into place.
  const tmp = `${FILE}.${process.pid}.${(g.__gbsTmp = (g.__gbsTmp ?? 0) + 1)}.tmp`;
  await writeFile(tmp, JSON.stringify(s, null, 2));
  await rename(tmp, FILE);
}

// Writes are queued so two requests never read-modify-write at once.
function mutate<T>(fn: (s: Store) => T): Promise<T> {
  const run = (g.__gbsWrites ?? Promise.resolve()).then(async () => {
    const s = await load();
    const out = fn(s);
    await save(s);
    return out;
  });
  g.__gbsWrites = run.catch(() => undefined);
  return run;
}

// ------------------------------------------------------------------ session

export async function getSession(): Promise<Session | null> {
  // Reading cookies also marks every page that checks the session as
  // per-request, so no signed-in data is ever prerendered at build time.
  return readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

// ------------------------------------------------------------------ clients

export async function listClients(): Promise<ClientRow[]> {
  return (await load()).clients.slice().sort((a, b) => a.name.localeCompare(b.name));
}

export async function getClient(id: string): Promise<ClientRow | null> {
  return (await load()).clients.find((c) => c.id === id) ?? null;
}

/** Creates a client and returns its id (a unique slug of the name). */
export function createClient(input: ClientInput): Promise<string> {
  return mutate((s) => {
    const base = slugify(input.name);
    let slug = base;
    for (let n = 2; s.clients.some((c) => c.slug === slug); n++) slug = `${base}-${n}`;
    s.clients.push({ ...input, id: slug, slug, createdAt: new Date().toISOString().slice(0, 10) });
    return slug;
  });
}

export function updateClient(id: string, input: ClientInput): Promise<void> {
  return mutate((s) => {
    const c = s.clients.find((x) => x.id === id);
    if (!c) throw new Error("Client not found");
    Object.assign(c, input);
    for (const r of s.reports) {
      if (r.clientId === id && r.doc) Object.assign(r.doc.client, { name: input.name, industry: input.industry ?? "", location: input.location ?? "" });
    }
  });
}

/** Deletes a client and all of their reports. */
export function deleteClient(id: string): Promise<void> {
  return mutate((s) => {
    s.clients = s.clients.filter((c) => c.id !== id);
    s.reports = s.reports.filter((r) => r.clientId !== id);
  });
}

// ------------------------------------------------------------------ reports

export async function listReports(clientId?: string): Promise<ReportSummary[]> {
  const s = await load();
  const name = (id: string) => s.clients.find((c) => c.id === id)?.name ?? "";
  return s.reports
    .filter((r) => !clientId || r.clientId === clientId)
    .map((r) => ({
      id: r.id, clientId: r.clientId, clientName: name(r.clientId), periodStart: r.periodStart,
      month: monthLabel(r.periodStart), status: r.status, createdAt: r.createdAt, available: !!r.doc,
    }));
}

/** The report as the renderer needs it, with the client's current name and branding. */
export async function getReportDoc(id: string): Promise<ReportDoc | null> {
  const s = await load();
  const r = s.reports.find((x) => x.id === id);
  if (!r?.doc) return null;
  const doc = r.doc;
  doc.status = r.status;
  const client = s.clients.find((c) => c.id === r.clientId);
  if (client) {
    doc.client = { id: client.id, name: client.name, industry: client.industry ?? "", location: client.location ?? "" };
    if (client.brand) {
      const b = client.brand;
      doc.brand = { ...doc.brand, primary: b.primary, accent: b.accent, logo: b.logo, cover: b.cover } satisfies Brand;
    }
  }
  return doc;
}

export async function getReportRecord(id: string) {
  const r = (await load()).reports.find((x) => x.id === id);
  return r ? { id: r.id, clientId: r.clientId, status: r.status } : null;
}

export function setClientBrand(id: string, brand: ClientBrand): Promise<void> {
  return mutate((s) => {
    const c = s.clients.find((x) => x.id === id);
    if (!c) throw new Error("Client not found");
    c.brand = brand;
  });
}

export function setReportStatus(id: string, status: ReportStatus): Promise<void> {
  return mutate((s) => {
    const r = s.reports.find((x) => x.id === id);
    if (r) r.status = status;
  });
}

export interface ReportInput {
  clientId: string;
  template: Template;
  sections: Record<SectionKey, boolean>;
  data: ReportData;
}

export class ReportExistsError extends Error {}


export function createReport(input: ReportInput, uploads: Partial<Record<Platform, SourceShot[]>>): Promise<string> {
  return mutate((s) => {
    if (!s.clients.some((c) => c.id === input.clientId)) throw new Error("Client not found");
    const id = reportId(input.clientId, input.data.period.start);
    if (s.reports.some((r) => r.id === id)) throw new ReportExistsError(id);
    const client = s.clients.find((c) => c.id === input.clientId)!;
    const doc: ReportDoc = {
      id, status: "Draft", createdAt: new Date().toISOString().slice(0, 10),
      client: { id: client.id, name: client.name, industry: client.industry ?? "", location: client.location ?? "" },
      brand: { ...DEFAULT_BRAND, gbs: null, ...(client.brand ?? {}) },
      template: input.template, sections: input.sections, data: input.data,
      texts: {}, variant: {}, titles: {}, rows: null, uploads, resolutions: {}, notes: [], isDemo: false,
    };
    s.reports.push({ id, clientId: input.clientId, periodStart: input.data.period.start, status: "Draft", createdAt: doc.createdAt, doc });
    return id;
  });
}

/** Replaces a report's data, keeping its notes, edits and reviewer choices. */
export function updateReport(id: string, input: Omit<ReportInput, "clientId">, uploads: Partial<Record<Platform, SourceShot[]>>): Promise<void> {
  return mutate((s) => {
    const r = s.reports.find((x) => x.id === id);
    if (!r?.doc) throw new Error("Report not found");
    Object.assign(r.doc, { template: input.template, sections: input.sections, data: input.data, uploads, isDemo: false });
    r.periodStart = input.data.period.start;
  });
}



export function addInternalNote(session: Session, reportId: string, text: string): Promise<void> {
  const note: InternalNote = { text, by: session.name, date: new Date().toISOString().slice(0, 10) };
  return mutate((s) => {
    s.reports.find((r) => r.id === reportId)?.doc?.notes.push(note);
  });
}

/** Records the reviewer's choice for a conflicting figure. */
export function setResolution(reportId: string, metric: string, choice: Resolution | null): Promise<void> {
  return mutate((s) => {
    const doc = s.reports.find((r) => r.id === reportId)?.doc;
    if (!doc) return;
    if (choice) doc.resolutions[metric] = choice;
    else delete doc.resolutions[metric];
  });
}

// ------------------------------------------------------------------ settings

export async function getSettings(): Promise<StudioSettings> {
  return { defaultTemplate: "premium", ...((await load()).settings ?? {}) };
}

export function setSettings(next: StudioSettings): Promise<void> {
  return mutate((s) => { s.settings = next; });
}

// ------------------------------------------------------------------ sharing

export async function getShare(reportId: string): Promise<ShareInfo | null> {
  return (await load()).reports.find((r) => r.id === reportId)?.share ?? null;
}

/** Creates a new link (any earlier link for this report stops working). */
export function createShare(reportId: string, token: string): Promise<void> {
  return mutate((s) => {
    const r = s.reports.find((x) => x.id === reportId);
    if (!r?.doc) throw new Error("Report not found");
    r.share = { token, createdAt: new Date().toISOString(), passwordHash: r.share?.passwordHash ?? null };
  });
}

export function setSharePassword(reportId: string, passwordHash: string | null): Promise<void> {
  return mutate((s) => {
    const r = s.reports.find((x) => x.id === reportId);
    if (r?.share) r.share.passwordHash = passwordHash;
  });
}

export function removeShare(reportId: string): Promise<void> {
  return mutate((s) => {
    const r = s.reports.find((x) => x.id === reportId);
    if (r) r.share = null;
  });
}

/** The report behind a client link, when the client, month and token all match. */
export async function findSharedReport(clientSlug: string, monthSlug: string, token: string) {
  const s = await load();
  const r = s.reports.find((x) => x.share?.token === token);
  if (!r?.doc || !r.share) return null;
  const client = s.clients.find((c) => c.id === r.clientId);
  if (!client || client.slug !== clientSlug || shareMonthSlug(r.periodStart) !== monthSlug) return null;
  const doc = await getReportDoc(r.id);
  return doc ? { doc, share: r.share } : null;
}

/** "2026-08-01" -> "august-2026", used in client links. */
export const shareMonthSlug = (periodStart: string) => monthLabel(periodStart).toLowerCase().replace(" ", "-");

export async function shareUrlPath(reportId: string): Promise<string | null> {
  const s = await load();
  const r = s.reports.find((x) => x.id === reportId);
  const client = r && s.clients.find((c) => c.id === r.clientId);
  if (!r?.share || !client) return null;
  return `/report/${client.slug}/${shareMonthSlug(r.periodStart)}/${r.share.token}`;
}

// ------------------------------------------------------------------ report text and versions

const textContent = (d: ReportDoc): TextVersion["content"] =>
  structuredClone({ texts: d.texts, variant: d.variant, titles: d.titles, rows: d.rows });

function pushVersion(r: StoredReport, label: string, by: string) {
  if (!r.doc) return;
  const list = (r.versions ??= []);
  list.push({ v: (list.at(-1)?.v ?? 0) + 1, label, at: new Date().toISOString(), by, content: textContent(r.doc) });
  if (list.length > 50) list.splice(0, list.length - 50);
}

export async function listVersions(reportId: string): Promise<TextVersion[]> {
  return ((await load()).reports.find((r) => r.id === reportId)?.versions ?? []).slice().reverse();
}

/** Changes one copy block (null resets it to the generated text) and/or its variant. */
export function setBlock(reportId: string, blockId: string, change: { text?: string | null; variant?: number }): Promise<void> {
  return mutate((s) => {
    const doc = s.reports.find((r) => r.id === reportId)?.doc;
    if (!doc) throw new Error("Report not found");
    if (change.variant != null) doc.variant[blockId] = change.variant;
    if (change.text === null) delete doc.texts[blockId];
    else if (change.text != null) doc.texts[blockId] = change.text;
  });
}

export function setPageTitle(reportId: string, key: string, title: string | null): Promise<void> {
  return mutate((s) => {
    const doc = s.reports.find((r) => r.id === reportId)?.doc;
    if (!doc) throw new Error("Report not found");
    if (title) doc.titles[key] = title; else delete doc.titles[key];
  });
}

export function setActionRows(reportId: string, rows: string[][] | null): Promise<void> {
  return mutate((s) => {
    const doc = s.reports.find((r) => r.id === reportId)?.doc;
    if (doc) doc.rows = rows;
  });
}

/** Saves the current copy as a version, before and after big changes. */
export function saveVersion(reportId: string, label: string, by: string): Promise<void> {
  return mutate((s) => {
    const r = s.reports.find((x) => x.id === reportId);
    if (r) pushVersion(r, label, by);
  });
}

/** Replaces the copy with generated text (keeping a version of what was there). */
export function applyTexts(reportId: string, texts: Record<string, string>, label: string, by: string, reset = false): Promise<void> {
  return mutate((s) => {
    const r = s.reports.find((x) => x.id === reportId);
    if (!r?.doc) throw new Error("Report not found");
    if (!r.versions?.length) pushVersion(r, "Before changes", by);
    if (reset) { r.doc.texts = {}; r.doc.variant = {}; }
    Object.assign(r.doc.texts, texts);
    pushVersion(r, label, by);
  });
}

export function restoreVersion(reportId: string, v: number, by: string): Promise<boolean> {
  return mutate((s) => {
    const r = s.reports.find((x) => x.id === reportId);
    const ver = r?.versions?.find((x) => x.v === v);
    if (!r?.doc || !ver) return false;
    Object.assign(r.doc, structuredClone(ver.content));
    pushVersion(r, `Restored version ${v}`, by);
    return true;
  });
}
