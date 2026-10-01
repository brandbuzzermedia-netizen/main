// Client and report shapes and pure helpers, shared by the server data
// layer (repo.ts) and anything that runs in the browser.
import { MONTHS, parseDay } from "@/lib/format";
import { SECTION_KEYS, type ReportStatus, type SectionKey } from "@/lib/report/types";

/** A client's report branding. Logo and cover are stored file URLs. */
export interface ClientBrand {
  primary: string;
  accent: string;
  logo: string | null;
  cover: string | null;
}

/** Palette used until a client's own colours are set (the prototype's placeholder). */
export const DEFAULT_BRAND: ClientBrand = { primary: "#3B2A21", accent: "#C9974A", logo: null, cover: null };

export interface ClientRow {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  location: string | null;
  website: string | null;
  instagram: string | null;
  createdAt: string;
  brand?: ClientBrand;
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

/** Report ids are "<client>-<yyyy-mm>", one report per client per month. */
export const reportId = (clientId: string, periodStart: string) => `${clientId}-${periodStart.slice(0, 7)}`;

export const allSections = (on: boolean) => Object.fromEntries(SECTION_KEYS.map((k) => [k, on])) as Record<SectionKey, boolean>;
