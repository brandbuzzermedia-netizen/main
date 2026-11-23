import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { designFor } from "@/domain/design";
import { PageHead } from "@/components/dp/shell";
import { FieldTabs } from "../tabs";

export const metadata: Metadata = { title: "Add leads" };

const OPTIONS = [
  ["/quick", "Quick add", "Standing at the shop: name, phone, one tap. The pin is where you are."],
  ["/leads/new", "Full form", "All the details, a Google Maps link or address search, and the pin."],
  ["/search", "Search Google Maps", "\"Car detailing in HSR Layout\": tick the shops to visit."],
  ["/import", "Paste or upload a list", "Rows from Google Sheets or Excel, or a CSV. Duplicates by phone are skipped."],
  ["/from-leads", "From your leads", "Leads already in the OS (Apollo, imports, outreach) onto your field list."],
] as const;

/** Every way to add field leads, one big button each. */
export default async function AddHub({ params, searchParams }: PageProps<"/c/[slug]/field/add">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) notFound();
  return (
    <>
      <PageHead own={designFor(slug).own} treat="Field sales" title="Add leads" tag="Five ways." />
      <FieldTabs slug={slug} current="/add" note={sp.note} />
      <div style={{ display: "grid", gap: 10 }}>
        {OPTIONS.map(([p, t, d], i) => (
          <a key={p} href={`/c/${slug}/field${p}`} style={{ display: "block", background: i === 0 ? "var(--co-btn)" : "#fff", color: i === 0 ? "#fff" : "#141414", border: i === 0 ? 0 : "1px solid #E4E0D6", borderRadius: 14, padding: "16px 18px", textDecoration: "none", minHeight: 64 }}>
            <b style={{ fontSize: 17 }}>{t}</b>
            <div style={{ fontSize: 13.5, marginTop: 4, opacity: i === 0 ? 0.9 : 1, color: i === 0 ? "#fff" : "#6B6B6B", lineHeight: 1.4 }}>{d}</div>
          </a>
        ))}
      </div>
    </>
  );
}
