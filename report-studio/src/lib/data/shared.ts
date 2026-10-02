// Client and report shapes and pure helpers, shared by the server data
// layer (repo.ts) and anything that runs in the browser.
import { MONTHS, parseDay } from "@/lib/format";
import { SECTION_KEYS, type Brand, type ReportClient, type ReportStatus, type SectionKey, type Template } from "@/lib/report/types";

/** A client's report branding. Logo and cover are stored file URLs. */
export interface ClientBrand {
  primary: string;
  accent: string;
  logo: string | null;
  cover: string | null;
  logoTone?: Brand["logoTone"];
  logoPlate?: Brand["logoPlate"];
  art?: string | null;
}

/** Palette used until a client's own colours are set (the prototype's placeholder). */
export const DEFAULT_BRAND: ClientBrand = { primary: "#3B2A21", accent: "#C9974A", logo: null, cover: null };

export interface ClientRow {
  id: string;
  /** Short name used on reports and in file names ("Thrishank Doors"). */
  name: string;
  slug: string;
  /** Registered company name, printed on the thank-you page when set. */
  company?: string | null;
  industry: string | null;
  location: string | null;
  website: string | null;
  /** Instagram handle without the @. */
  instagram: string | null;
  /** Facebook page address. */
  facebook?: string | null;
  contact?: string | null;
  /** Internal only. Never printed in a report. */
  notes?: string | null;
  /** Report design used for this client's new reports. */
  template?: Template | null;
  createdAt: string;
  brand?: ClientBrand;
}

export type ClientInput = Pick<ClientRow, "name" | "company" | "industry" | "location" | "website" | "instagram" | "facebook" | "contact" | "notes" | "template">;

/** The client details a report prints, taken from the client's profile. */
export const reportClient = (c: ClientRow): ReportClient => ({
  id: c.id, name: c.name, industry: c.industry ?? "", location: c.location ?? "",
  company: c.company ?? null, website: c.website ?? null, instagram: c.instagram ?? null, facebook: c.facebook ?? null,
});

/** "Wudgres_September_2026_Monthly_Performance_Report.pdf". Every word of the client name is kept. */
export function pdfFileName(clientName: string, periodStart: string) {
  const name = clientName.normalize("NFKD").replace(/[^A-Za-z0-9 ]+/g, "").trim().split(/\s+/).join("_") || "Client";
  return `${name}_${monthLabel(periodStart).replace(" ", "_")}_Monthly_Performance_Report.pdf`;
}

/** "2026-09-01" -> "september-2026": the folder for a report month's files. */
export const monthFolder = (periodStart: string) => monthLabel(periodStart).toLowerCase().replace(" ", "-");

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
