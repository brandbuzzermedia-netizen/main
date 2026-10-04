// The studio's data in the browser: the same shape and rules as the server's
// src/lib/data/repo.ts, kept in IndexedDB on this computer. It survives
// reloads; a backup file (Settings) moves it to another computer or browser.
import { useSyncExternalStore } from "react";
import { thrishankAugust2026 } from "@/lib/fixtures/thrishank-2026-08";
import { DEFAULT_BRAND, monthLabel, reportClient, reportId, slugify, type ClientBrand, type ClientInput, type ClientRow, type ReportSummary } from "@/lib/data/shared";
import type { Brand, InternalNote, Platform, ReportDoc, ReportStatus, Resolution, SourceShot, Template } from "@/lib/report/types";
import type { ParsedReport } from "@/lib/report/parse";

export interface TextVersion { v: number; label: string; at: string; by: string; content: Pick<ReportDoc, "texts" | "variant" | "titles" | "rows"> }
interface StoredReport { id: string; clientId: string; periodStart: string; status: ReportStatus; createdAt: string; doc: ReportDoc | null; versions?: TextVersion[] }
interface State { version: 1; session: string | null; clients: ClientRow[]; reports: StoredReport[]; settings?: { defaultTemplate: Template } }

function seed(): State {
  const doc = thrishankAugust2026();
  return {
    version: 1, session: null,
    clients: [{
      id: "thrishank", name: "Thrishank Doors", slug: "thrishank-doors", company: "Thrishank Doors",
      industry: "Doors and architectural hardware", location: "Bengaluru, India", website: null, instagram: null,
      facebook: null, contact: null, notes: "Sample client from the prototype. Its per-post figures are sample values.",
      template: "premium", createdAt: "2026-06-01",
    }],
    reports: [{ id: doc.id, clientId: "thrishank", periodStart: "2026-08-01", status: "Ready for review", createdAt: "2026-09-03", doc }],
  };
}

let state: State = seed();
let version = 0;
const listeners = new Set<() => void>();
let persisted = false;

// ---------------------------------------------------------------- IndexedDB
const DB = "gbs-report-studio-preview", KEY = "state-v2";
function idb(): Promise<IDBDatabase> {
  return new Promise((ok, err) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => ok(req.result);
    req.onerror = () => err(req.error);
  });
}
async function readSaved(): Promise<State | null> {
  try {
    const db = await idb();
    return await new Promise((ok) => {
      const q = db.transaction("kv").objectStore("kv").get(KEY);
      q.onsuccess = () => ok((q.result as State) ?? null);
      q.onerror = () => ok(null);
    });
  } catch { return null; }
}
async function write() {
  try {
    const db = await idb();
    db.transaction("kv", "readwrite").objectStore("kv").put(state, KEY);
    persisted = true;
  } catch { persisted = false; }
}

export async function boot() {
  // Ask the browser not to clear this data when disk space runs low.
  try { await navigator.storage?.persist?.(); } catch { /* not supported */ }
  const saved = await readSaved();
  if (saved?.version === 1) state = saved;
  else await write();
  emit();
}
export const isPersisted = () => persisted;

function emit() { version++; listeners.forEach((l) => l()); }
function change(fn: (s: State) => void) {
  state = structuredClone(state);
  fn(state);
  emit();
  void write();
}
export function useStore<T>(pick: (s: State) => T): T {
  useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => version);
  return pick(state);
}
export const snapshot = () => state;

export async function resetDemo() {
  const session = state.session;
  state = seed();
  state.session = session;
  emit();
  await write();
}

// ---------------------------------------------------------------- session
export const signInAs = (name: string) => change((s) => { s.session = name || "GBS team"; });
export const signOutNow = () => change((s) => { s.session = null; });

// ---------------------------------------------------------------- clients
export const listClients = () => state.clients.slice().sort((a, b) => a.name.localeCompare(b.name));
export const getClient = (id: string) => state.clients.find((c) => c.id === id) ?? null;

export function createClient(input: ClientInput): string {
  const base = slugify(input.name);
  let slug = base;
  for (let n = 2; state.clients.some((c) => c.slug === slug); n++) slug = `${base}-${n}`;
  change((s) => { s.clients.push({ ...input, id: slug, slug, createdAt: new Date().toISOString().slice(0, 10) }); });
  return slug;
}
export const updateClient = (id: string, input: ClientInput) => change((s) => { const c = s.clients.find((x) => x.id === id); if (c) Object.assign(c, input); });
export const getReportRecordFull = (id: string) => state.reports.find((x) => x.id === id) ?? null;
export const deleteClient = (id: string) => change((s) => { s.clients = s.clients.filter((c) => c.id !== id); s.reports = s.reports.filter((r) => r.clientId !== id); });
export const setClientBrand = (id: string, brand: ClientBrand) => change((s) => { const c = s.clients.find((x) => x.id === id); if (c) c.brand = brand; });

// ---------------------------------------------------------------- reports
export function listReports(clientId?: string): ReportSummary[] {
  const name = (id: string) => state.clients.find((c) => c.id === id)?.name ?? "";
  return state.reports.filter((r) => !clientId || r.clientId === clientId).map((r) => ({
    id: r.id, clientId: r.clientId, clientName: name(r.clientId), periodStart: r.periodStart,
    month: monthLabel(r.periodStart), status: r.status, createdAt: r.createdAt, available: !!r.doc,
  }));
}

export function getReportDoc(id: string): ReportDoc | null {
  const r = state.reports.find((x) => x.id === id);
  if (!r?.doc) return null;
  const doc = structuredClone(r.doc);
  doc.status = r.status;
  const client = state.clients.find((c) => c.id === r.clientId);
  if (client) {
    doc.client = reportClient(client);
    if (client.brand) doc.brand = { ...doc.brand, ...client.brand } satisfies Brand;
  }
  return doc;
}
export const getReportRecord = (id: string) => state.reports.find((x) => x.id === id) ?? null;

export function saveReportData(existingId: string | null, clientId: string, parsed: ParsedReport, uploads: Partial<Record<Platform, SourceShot[]>>, copy: { rows?: string[][] | null; titles?: Record<string, string>; copiedFrom?: ReportDoc["copiedFrom"] } = {}): string {
  const id = existingId || reportId(clientId, parsed.data.period.start);
  change((s) => {
    const r = s.reports.find((x) => x.id === id);
    if (r?.doc) {
      Object.assign(r.doc, { template: parsed.template, sections: parsed.sections, data: parsed.data, uploads, isDemo: false });
      r.periodStart = parsed.data.period.start;
      return;
    }
    const client = s.clients.find((c) => c.id === clientId)!;
    const doc: ReportDoc = {
      id, status: "Draft", createdAt: new Date().toISOString().slice(0, 10),
      client: reportClient(client),
      brand: { ...DEFAULT_BRAND, gbs: null, ...(client.brand ?? {}) },
      template: parsed.template, sections: parsed.sections, data: parsed.data,
      texts: {}, variant: {}, titles: copy.titles ?? {}, rows: copy.rows ?? null, uploads, resolutions: {}, notes: [], isDemo: false, copiedFrom: copy.copiedFrom ?? null,
    };
    s.reports.push({ id, clientId, periodStart: parsed.data.period.start, status: "Draft", createdAt: doc.createdAt, doc });
  });
  return id;
}

export const setReportStatus = (id: string, status: ReportStatus) => change((s) => { const r = s.reports.find((x) => x.id === id); if (r) r.status = status; });
export const addInternalNote = (reportId: string, text: string) => change((s) => {
  const note: InternalNote = { text, by: s.session || "GBS team", date: new Date().toISOString().slice(0, 10) };
  s.reports.find((r) => r.id === reportId)?.doc?.notes.push(note);
});
export const setResolution = (reportId: string, metric: string, choice: Resolution | null) => change((s) => {
  const doc = s.reports.find((r) => r.id === reportId)?.doc;
  if (!doc) return;
  if (choice) doc.resolutions[metric] = choice; else delete doc.resolutions[metric];
});

// ---------------------------------------------------------------- settings
export const getDefaultTemplate = (): Template => state.settings?.defaultTemplate ?? "premium";
export const setDefaultTemplate = (t: Template) => change((s) => { s.settings = { defaultTemplate: t }; });

// ---------------------------------------------------------------- report text and versions
const textContent = (d: ReportDoc): TextVersion["content"] => structuredClone({ texts: d.texts, variant: d.variant, titles: d.titles, rows: d.rows });
function pushVersion(r: StoredReport, label: string, by: string) {
  if (!r.doc) return;
  const list = (r.versions ??= []);
  list.push({ v: (list.at(-1)?.v ?? 0) + 1, label, at: new Date().toISOString(), by, content: textContent(r.doc) });
}
export const listVersions = (id: string): TextVersion[] => (state.reports.find((r) => r.id === id)?.versions ?? []).slice().reverse();
export const setBlock = (reportId: string, blockId: string, ch: { text?: string | null; variant?: number }) => change((s) => {
  const doc = s.reports.find((r) => r.id === reportId)?.doc;
  if (!doc) return;
  if (ch.variant != null) doc.variant[blockId] = ch.variant;
  if (ch.text === null) delete doc.texts[blockId]; else if (ch.text != null) doc.texts[blockId] = ch.text;
});
export const saveVersion = (reportId: string, label: string) => change((s) => { const r = s.reports.find((x) => x.id === reportId); if (r) pushVersion(r, label, s.session || "GBS team"); });
export const resetAllText = (reportId: string) => change((s) => {
  const r = s.reports.find((x) => x.id === reportId);
  if (!r?.doc) return;
  if (!r.versions?.length) pushVersion(r, "Before changes", s.session || "GBS team");
  r.doc.texts = {}; r.doc.variant = {};
  pushVersion(r, "Reset to template text", s.session || "GBS team");
});
export const restoreVersion = (reportId: string, v: number) => change((s) => {
  const r = s.reports.find((x) => x.id === reportId);
  const ver = r?.versions?.find((x) => x.v === v);
  if (!r?.doc || !ver) return;
  Object.assign(r.doc, structuredClone(ver.content));
  pushVersion(r, `Restored version ${v}`, s.session || "GBS team");
});

// ---------------------------------------------------------------- backup
const BACKUP_KIND = "gbs-report-studio-backup";

/** Everything the studio holds (clients, reports, screenshots, logos) as one JSON file. */
export function exportBackup(): Blob {
  const { session: _session, ...data } = state;
  void _session;
  return new Blob([JSON.stringify({ kind: BACKUP_KIND, exportedAt: new Date().toISOString(), data })], { type: "application/json" });
}

/** Replaces all data with a backup file's. Returns an error message, or null when done. */
export async function importBackup(file: File): Promise<string | null> {
  let parsed: { kind?: string; data?: Partial<State> };
  try { parsed = JSON.parse(await file.text()); } catch { return "That file is not a studio backup."; }
  const d = parsed.data;
  if (parsed.kind !== BACKUP_KIND || !d || d.version !== 1 || !Array.isArray(d.clients) || !Array.isArray(d.reports)) return "That file is not a studio backup.";
  state = { ...(d as State), session: state.session };
  emit();
  await write();
  return null;
}
