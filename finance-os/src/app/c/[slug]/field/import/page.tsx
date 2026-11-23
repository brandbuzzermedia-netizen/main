import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { designFor } from "@/domain/design";
import { PageHead } from "@/components/dp/shell";
import { bigPrimary } from "@/components/field/field-client";
import { importFieldLeadsAction } from "../actions";
import { Box, FieldTabs } from "../tabs";

export const metadata: Metadata = { title: "Bulk add leads" };

/** Paste rows or upload a CSV. Duplicates by phone are skipped. */
export default async function FieldImport({ params, searchParams }: PageProps<"/c/[slug]/field/import">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) notFound();
  return (
    <>
      <PageHead own={designFor(slug).own} treat="Field sales" title="Bulk add" tag="Paste or upload." />
      <FieldTabs slug={slug} current="/import" note={sp.note} />
      <Box title="Add many leads at once">
        <form action={importFieldLeadsAction.bind(null, slug)} style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: "#444" }}>
            First row is the header. Columns it understands: <b>Business name</b>, <b>Phone</b> (needed), Owner, WhatsApp, Segment, Address, Area, Lat, Lng, Source, Notes.
            Copy rows straight from Google Sheets or Excel, or upload a CSV. Leads with a phone already on your field list are skipped.
          </div>
          <textarea name="text" rows={8} aria-label="Paste rows" placeholder={"Business name,Owner,Phone,Area,Segment\nShine Detailing,Ravi,9845012345,HSR Layout,Detailing"}
            style={{ width: "100%", border: "1px solid #E4E0D6", borderRadius: 10, padding: 12, fontSize: 14.5, fontFamily: "var(--font-mono), monospace", boxSizing: "border-box" }} />
          <label style={{ fontSize: 14, display: "grid", gap: 6 }}>Or upload a CSV file<input type="file" name="file" accept=".csv,text/csv" style={{ fontSize: 15 }} /></label>
          <button style={{ ...bigPrimary, width: "100%" }}>Add leads</button>
        </form>
      </Box>
    </>
  );
}
