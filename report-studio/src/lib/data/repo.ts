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
import type { InternalNote, ReportDoc, ReportStatus, Resolution } from "@/lib/report/types";

export type { Session };

export interface ClientRow {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  location: string | null;
  website: string | null;
  instagram: string | null;
  createdAt: string;
}

export type ClientInput = Pick<ClientRow, "name" | "industry" | "location" | "website" | "instagram">;

export interface ReportSummary {
  id: string;
  clientId: string;
  clientName: string;
  periodStart: string;
  month: string;
  status: ReportStatus;
  createdAt: string;
  /** False when the report has no data to render yet. */
  available: boolean;
}

interface StoredReport {
  id: string;
  clientId: string;
  periodStart: string;
  status: ReportStatus;
  createdAt: string;
  doc: ReportDoc | null;
}

interface Store {
  version: 1;
  clients: ClientRow[];
  reports: StoredReport[];
}

export const monthLabel = (isoDay: string) => {
  const d = parseDay(isoDay);
  return `${MONTHS[d.m]} ${d.y}`;
};

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";

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

async function load(): Promise<Store> {
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as Store;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    const s = seed();
    await save(s);
    return s;
  }
}

async function save(s: Store) {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(s, null, 2));
  await rename(tmp, FILE);
}

// Writes are queued so two requests never read-modify-write at once.
const g = globalThis as unknown as { __gbsWrites?: Promise<unknown> };
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

export async function getReportDoc(id: string): Promise<ReportDoc | null> {
  return (await load()).reports.find((r) => r.id === id)?.doc ?? null;
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
