import type { Metadata } from "next";
import { saveDefaultTemplate } from "@/app/(app)/actions";
import { ReportCover, ReportThumb } from "@/components/report/pages";
import { PageHeader } from "@/components/studio/views";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getReportDoc, getSettings, listReports } from "@/lib/data/repo";
import type { Template } from "@/lib/report/types";

export const metadata: Metadata = { title: "Templates" };

const TEMPLATES: [Template, string, string][] = [
  ["premium", "Premium", "Editorial: the client's colour on the cover, warm paper pages."],
  ["minimal", "Minimal", "White pages with a slim client-colour edge on the cover."],
  ["dark", "Dark", "Dark pages with the client's accent colour for figures."],
];

export default async function TemplatesPage() {
  const [settings, reports] = await Promise.all([getSettings(), listReports()]);
  const sample = reports.find((r) => r.available);
  const doc = sample ? await getReportDoc(sample.id) : null;
  return (
    <>
      <PageHeader title="Templates" sub="Three looks for every report. The client's colours and logo layer on top. Each report can use a different one; this sets the default for new reports." />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
        {TEMPLATES.map(([id, name, desc]) => (
          <section key={id} className={`rounded-[20px] border-2 bg-card p-3.5 ${settings.defaultTemplate === id ? "border-gbs-green" : "border-border"}`}>
            {doc ? (
              <div className="grid gap-2 overflow-hidden">
                <ReportCover doc={{ ...doc, template: id }} scale={0.27} />
                <ReportThumb doc={{ ...doc, template: id }} scale={0.27} index={1} />
              </div>
            ) : null}
            <div className="mt-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="font-heading text-[17px] font-bold text-heading">{name}</h2>
                <p className="text-[13px] text-muted-foreground">{desc}</p>
              </div>
              {settings.defaultTemplate === id ? <Badge variant="ok">Default</Badge> : (
                <form action={saveDefaultTemplate}><input type="hidden" name="template" value={id} /><Button size="sm" type="submit">Make default</Button></form>
              )}
            </div>
          </section>
        ))}
      </div>
      {doc ? <p className="mt-4 text-xs text-muted-foreground">Previews use {doc.client.name}, {sample!.month}.</p> : null}
    </>
  );
}
