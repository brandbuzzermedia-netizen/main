// Data access for the studio. Two backends with one interface:
//  - Supabase, acting as the signed-in user so row-level security applies;
//  - demo mode, an in-memory store seeded from the Thrishank fixture, used
//    only when Supabase is not configured (see lib/supabase/env.ts).
import { cookies } from "next/headers";
import { thrishankAugust2026 } from "@/lib/fixtures/thrishank-2026-08";
import { MONTHS, parseDay } from "@/lib/format";
import { DEMO_COOKIE, demoAllowed, supabaseEnv } from "@/lib/supabase/env";
import { supabaseServer } from "@/lib/supabase/server";
import {
  SECTION_KEYS, type ContentItem, type ContentType, type InternalNote, type Platform, type Provenance,
  type ReportDoc, type ReportStatus, type Resolution, type SectionKey, type SourceShot, type Template,
} from "@/lib/report/types";

export type Role = "owner" | "admin" | "staff" | "client_viewer";

export interface Session {
  mode: "supabase" | "demo";
  email: string;
  name: string;
  role: Role;
  agencyId: string;
  agencyName: string;
}

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

export const monthLabel = (isoDay: string) => {
  const d = parseDay(isoDay);
  return `${MONTHS[d.m]} ${d.y}`;
};

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";

// ------------------------------------------------------------------ demo

interface DemoStore {
  clients: ClientRow[];
  reports: ReportSummary[];
  docs: Record<string, ReportDoc>;
}

function demoStore(): DemoStore {
  const g = globalThis as unknown as { __gbsDemo?: DemoStore };
  if (!g.__gbsDemo) {
    const doc = thrishankAugust2026();
    const c = (id: string, name: string, industry: string, location: string | null): ClientRow => ({
      id, name, slug: slugify(name), industry, location, website: null, instagram: null, createdAt: "2026-06-01",
    });
    const r = (id: string, clientId: string, clientName: string, periodStart: string, status: ReportStatus, createdAt: string, available = false): ReportSummary => ({
      id, clientId, clientName, periodStart, month: monthLabel(periodStart), status, createdAt, available,
    });
    g.__gbsDemo = {
      clients: [
        c("thrishank", "Thrishank Doors", "Doors and architectural hardware", "Bengaluru, India"),
        c("lykes", "Lykes", "Retail", null),
        c("conic", "Conic Gold", "Jewellery", null),
      ],
      reports: [
        r(doc.id, "thrishank", "Thrishank Doors", "2026-08-01", "Ready for review", "2026-09-03", true),
        r("thrishank-2026-07", "thrishank", "Thrishank Doors", "2026-07-01", "Delivered", "2026-08-04"),
        r("thrishank-2026-06", "thrishank", "Thrishank Doors", "2026-06-01", "Delivered", "2026-07-03"),
        r("lykes-2026-08", "lykes", "Lykes", "2026-08-01", "Pending", "2026-09-30"),
        r("conic-2026-08", "conic", "Conic Gold", "2026-08-01", "Draft", "2026-10-01"),
      ],
      docs: { [doc.id]: doc },
    };
  }
  return g.__gbsDemo;
}

// ------------------------------------------------------------------ session

export async function getSession(): Promise<Session | null> {
  // Reading cookies first also marks every page that checks the session as
  // per-request, so no signed-in data is ever prerendered at build time.
  const jar = await cookies();
  if (supabaseEnv()) {
    const sb = await supabaseServer();
    const { data: auth } = await sb.auth.getUser();
    if (!auth.user) return null;
    const { data: u } = await sb
      .from("users")
      .select("role, full_name, agency_id, agencies(name)")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (!u) return null;
    const agency = u.agencies as unknown as { name: string } | null;
    return {
      mode: "supabase",
      email: auth.user.email ?? "",
      name: u.full_name ?? auth.user.email ?? "",
      role: u.role as Role,
      agencyId: u.agency_id,
      agencyName: agency?.name ?? "",
    };
  }
  if (demoAllowed() && jar.get(DEMO_COOKIE)?.value === "1") {
    return { mode: "demo", email: "mehul@getbeeseen.com", name: "Mehul", role: "owner", agencyId: "demo", agencyName: "Get Bee Seen" };
  }
  return null;
}

// ------------------------------------------------------------------ clients

const clientCols = "id, name, slug, industry, location, website, instagram, created_at";
type ClientDb = { id: string; name: string; slug: string; industry: string | null; location: string | null; website: string | null; instagram: string | null; created_at: string };
const toClient = (r: ClientDb): ClientRow => ({
  id: r.id, name: r.name, slug: r.slug, industry: r.industry, location: r.location,
  website: r.website, instagram: r.instagram, createdAt: r.created_at.slice(0, 10),
});

export async function listClients(): Promise<ClientRow[]> {
  if (!supabaseEnv()) return demoStore().clients.slice().sort((a, b) => a.name.localeCompare(b.name));
  const sb = await supabaseServer();
  const { data, error } = await sb.from("clients").select(clientCols).order("name");
  if (error) throw error;
  return (data as ClientDb[]).map(toClient);
}

export async function getClient(id: string): Promise<ClientRow | null> {
  if (!supabaseEnv()) return demoStore().clients.find((c) => c.id === id) ?? null;
  const sb = await supabaseServer();
  const { data } = await sb.from("clients").select(clientCols).eq("id", id).maybeSingle();
  return data ? toClient(data as ClientDb) : null;
}

/** Creates a client in the caller's agency. Returns its id. */
export async function createClient(session: Session, input: ClientInput): Promise<string> {
  if (!supabaseEnv()) {
    const s = demoStore();
    let slug = slugify(input.name), n = 2;
    while (s.clients.some((c) => c.slug === slug)) slug = `${slugify(input.name)}-${n++}`;
    const row: ClientRow = { ...input, id: slug, slug, createdAt: new Date().toISOString().slice(0, 10) };
    s.clients.push(row);
    return row.id;
  }
  const sb = await supabaseServer();
  const base = slugify(input.name);
  for (let n = 1; n < 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const { data, error } = await sb.from("clients").insert({ ...input, slug, agency_id: session.agencyId }).select("id").single();
    if (!error) return data.id as string;
    if (error.code !== "23505") throw error; // unique slug taken: try the next one
  }
  throw new Error("Could not find a free client slug");
}

export async function updateClient(id: string, input: ClientInput): Promise<void> {
  if (!supabaseEnv()) {
    const c = demoStore().clients.find((x) => x.id === id);
    if (c) Object.assign(c, input);
    demoStore().reports.filter((r) => r.clientId === id).forEach((r) => (r.clientName = input.name));
    const doc = Object.values(demoStore().docs).find((d) => d.client.id === id);
    if (doc) Object.assign(doc.client, { name: input.name, industry: input.industry ?? "", location: input.location ?? "" });
    return;
  }
  const sb = await supabaseServer();
  const { error } = await sb.from("clients").update(input).eq("id", id);
  if (error) throw error;
}

/** Deletes a client and, by cascade, all of its reports and data. */
export async function deleteClient(id: string): Promise<void> {
  if (!supabaseEnv()) {
    const s = demoStore();
    s.clients = s.clients.filter((c) => c.id !== id);
    s.reports.filter((r) => r.clientId === id).forEach((r) => delete s.docs[r.id]);
    s.reports = s.reports.filter((r) => r.clientId !== id);
    return;
  }
  const sb = await supabaseServer();
  const { error } = await sb.from("clients").delete().eq("id", id);
  if (error) throw error;
}

// ------------------------------------------------------------------ reports

export async function listReports(clientId?: string): Promise<ReportSummary[]> {
  if (!supabaseEnv()) {
    return demoStore().reports.filter((r) => !clientId || r.clientId === clientId);
  }
  const sb = await supabaseServer();
  let q = sb.from("reports").select("id, client_id, period_start, status, created_at, clients(name), extracted_metrics(count)").order("created_at", { ascending: false });
  if (clientId) q = q.eq("client_id", clientId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    clientId: r.client_id,
    clientName: (r.clients as unknown as { name: string } | null)?.name ?? "",
    periodStart: r.period_start,
    month: monthLabel(r.period_start),
    status: r.status as ReportStatus,
    createdAt: String(r.created_at).slice(0, 10),
    available: ((r.extracted_metrics as unknown as { count: number }[])?.[0]?.count ?? 0) > 0,
  }));
}

export async function getReportDoc(id: string): Promise<ReportDoc | null> {
  if (!supabaseEnv()) {
    const doc = demoStore().docs[id];
    return doc ? structuredClone(doc) : null;
  }
  return loadReportFromSupabase(id);
}

export async function addInternalNote(session: Session, reportId: string, text: string): Promise<void> {
  const note: InternalNote = { text, by: session.name, date: new Date().toISOString().slice(0, 10) };
  if (!supabaseEnv()) {
    demoStore().docs[reportId]?.notes.push(note);
    return;
  }
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  const { error } = await sb.from("internal_notes").insert({
    agency_id: session.agencyId, report_id: reportId, body: text, author_id: auth.user?.id, author_name: session.name,
  });
  if (error) throw error;
}

/** Records the reviewer's choice for a conflicting figure. */
export async function setResolution(reportId: string, metric: string, choice: Resolution | null): Promise<void> {
  if (!supabaseEnv()) {
    const doc = demoStore().docs[reportId];
    if (!doc) return;
    if (choice) doc.resolutions[metric] = choice;
    else delete doc.resolutions[metric];
    return;
  }
  const sb = await supabaseServer();
  const { data } = await sb.from("reports").select("resolutions").eq("id", reportId).single();
  const next = { ...((data?.resolutions as Record<string, Resolution>) ?? {}) };
  if (choice) next[metric] = choice;
  else delete next[metric];
  const { error } = await sb.from("reports").update({ resolutions: next }).eq("id", reportId);
  if (error) throw error;
}

// ------------------------------------------------------------------ Supabase report loader

type MetricRow = { metric_key: string; value: number | string | null; text_value: string | null; provenance: Provenance; conflict_group: string | null; user_confirmed: boolean };
type PostRow = {
  id: string; published_on: string; post_type: ContentType; theme: string | null; caption: string | null; tags: string | null;
  cover_path: string | null; provenance: Provenance; position: number;
  social_post_metrics: { metric_key: string; value: number | string | null; provenance: Provenance }[];
};

const num = (v: number | string | null | undefined) => (v == null ? null : Number(v));

/**
 * One value per metric key. A key with rows in a conflict group uses only the
 * user-confirmed row; with none confirmed it stays empty rather than guessed.
 */
function pickMetrics(rows: MetricRow[]) {
  const out: Record<string, MetricRow> = {};
  const byKey: Record<string, MetricRow[]> = {};
  rows.forEach((r) => (byKey[r.metric_key] = byKey[r.metric_key] || []).push(r));
  for (const [key, list] of Object.entries(byKey)) {
    const grouped = list.some((r) => r.conflict_group);
    const confirmed = list.find((r) => r.user_confirmed);
    const pick = grouped ? confirmed : confirmed ?? (list.length === 1 ? list[0] : undefined);
    if (pick) out[key] = pick;
  }
  return out;
}

async function loadReportFromSupabase(id: string): Promise<ReportDoc | null> {
  const sb = await supabaseServer();
  const { data: r } = await sb
    .from("reports")
    .select("id, client_id, status, template, resolutions, period_start, period_end, created_at, current_version_id, clients(id, name, industry, location)")
    .eq("id", id)
    .maybeSingle();
  if (!r) return null;
  const client = r.clients as unknown as { id: string; name: string; industry: string | null; location: string | null };

  const [assets, sections, metrics, posts, campaigns, uploads, notes, version] = await Promise.all([
    sb.from("client_brand_assets").select("kind, storage_path, primary_color, accent_color, created_at").eq("client_id", r.client_id).order("created_at", { ascending: false }),
    sb.from("report_sections").select("section_key, enabled").eq("report_id", id),
    sb.from("extracted_metrics").select("metric_key, value, text_value, provenance, conflict_group, user_confirmed").eq("report_id", id),
    sb.from("social_posts").select("id, published_on, post_type, theme, caption, tags, cover_path, provenance, position, social_post_metrics(metric_key, value, provenance)").eq("report_id", id).order("position"),
    sb.from("campaigns").select("name, objective, platform_id, campaign_metrics(metric_key, value, provenance)").eq("report_id", id).order("created_at"),
    sb.from("uploads").select("platform_id, storage_path, file_name, created_at").eq("report_id", id).eq("include_in_report", true).is("duplicate_of", null).order("created_at"),
    sb.from("internal_notes").select("body, author_name, created_at").eq("report_id", id).order("created_at"),
    r.current_version_id
      ? sb.from("report_versions").select("content").eq("id", r.current_version_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const sign = async (path: string | null | undefined) => {
    if (!path) return null;
    const { data } = await sb.storage.from("report-assets").createSignedUrl(path, 60 * 60);
    return data?.signedUrl ?? null;
  };

  const m = pickMetrics((metrics.data ?? []) as MetricRow[]);
  const mv = (k: string) => num(m[k]?.value);
  const palette = (assets.data ?? []).find((a) => a.kind === "palette");
  const logo = (assets.data ?? []).find((a) => a.kind === "logo");
  const cover = (assets.data ?? []).find((a) => a.kind === "cover");

  const content: ContentItem[] = await Promise.all(
    ((posts.data ?? []) as PostRow[]).map(async (p) => {
      const pm: Record<string, { value: number | null; provenance: Provenance }> = {};
      p.social_post_metrics.forEach((x) => (pm[x.metric_key] = { value: num(x.value), provenance: x.provenance }));
      const brief = Object.entries(pm).filter(([, v]) => v.provenance === "brief").map(([k]) => k);
      if (p.provenance === "brief") brief.push("caption");
      return {
        id: p.id, date: p.published_on, type: p.post_type, theme: p.theme ?? "", caption: p.caption ?? "", tags: p.tags ?? "",
        views: pm.views?.value ?? null, reach: pm.reach?.value ?? null, likes: pm.likes?.value ?? null,
        comments: pm.comments?.value ?? null, shares: pm.shares?.value ?? null, saves: pm.saves?.value ?? null,
        img: await sign(p.cover_path),
        provenance: Object.values(pm).some((v) => v.provenance === "sample") ? "sample" : p.provenance,
        brief,
      };
    }),
  );

  // The renderer reports on one Meta campaign; more arrive with step 3.
  const meta = (campaigns.data ?? []).find((c) => c.platform_id === "meta");
  const cm: Record<string, number | null> = {};
  (meta?.campaign_metrics as { metric_key: string; value: number | string | null }[] | undefined)?.forEach((x) => (cm[x.metric_key] = num(x.value)));

  const shots: Partial<Record<Platform, SourceShot[]>> = {};
  for (const u of uploads.data ?? []) {
    const url = await sign(u.storage_path);
    if (url) (shots[u.platform_id as Platform] = shots[u.platform_id as Platform] || []).push({ name: u.file_name, url });
  }

  const enabled = Object.fromEntries((sections.data ?? []).map((s) => [s.section_key, s.enabled]));
  const sectionMap = Object.fromEntries(SECTION_KEYS.map((k) => [k, enabled[k] ?? true])) as Record<SectionKey, boolean>;
  const v = ((version.data as { content?: Record<string, unknown> } | null)?.content ?? {}) as Partial<Pick<ReportDoc, "texts" | "variant" | "titles" | "rows">>;
  const anySample =
    Object.values(m).some((x) => x.provenance === "sample") || content.some((c) => c.provenance === "sample");

  return {
    id: r.id,
    status: r.status as ReportStatus,
    createdAt: String(r.created_at).slice(0, 10),
    client: { id: client.id, name: client.name, industry: client.industry ?? "", location: client.location ?? "" },
    brand: {
      primary: palette?.primary_color ?? "#3B2A21",
      accent: palette?.accent_color ?? "#C9974A",
      logo: await sign(logo?.storage_path),
      gbs: null,
      cover: await sign(cover?.storage_path),
    },
    template: r.template as Template,
    sections: sectionMap,
    data: {
      period: { start: r.period_start, end: r.period_end },
      ig: {
        views: mv("ig.views"), unique: mv("ig.unique"), nonFol: mv("ig.nonFol"), net: mv("ig.net"),
        followers: mv("ig.followers"), growth: mv("ig.growth"), profileVisits: mv("ig.profileVisits"),
        websiteClicks: mv("ig.websiteClicks"), messages: mv("ig.messages"),
      },
      meta: {
        campaign: meta?.name ?? "", objective: meta?.objective ?? "",
        spend: cm.spend ?? null, conv: cm.conv ?? null, impr: cm.impr ?? null, reach: cm.reach ?? null, clicks: cm.clicks ?? null,
      },
      outcomes: { qualified: mv("outcomes.qualified"), bookings: mv("outcomes.bookings"), sales: mv("outcomes.sales"), revenue: mv("outcomes.revenue") },
      prev: {
        views: mv("prev.views"), unique: mv("prev.unique"), followers: mv("prev.followers"), net: mv("prev.net"),
        posts: mv("prev.posts"), reels: mv("prev.reels"), spend: mv("prev.spend"), conv: mv("prev.conv"),
        impr: mv("prev.impr"), reach: mv("prev.reach"),
      },
      content,
    },
    texts: v.texts ?? {},
    variant: v.variant ?? {},
    titles: v.titles ?? {},
    rows: v.rows ?? null,
    uploads: shots,
    resolutions: (r.resolutions as Record<string, Resolution>) ?? {},
    notes: (notes.data ?? []).map((n) => ({ text: n.body, by: n.author_name ?? "", date: String(n.created_at).slice(0, 10) })),
    isDemo: anySample,
  };
}
