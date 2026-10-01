import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addNote, changeStatus, chooseResolution } from "@/app/(app)/actions";
import { blockConfidence, buildPages, ReportPages } from "@/components/report/pages";
import { FitPages } from "@/components/studio/fit-pages";
import { PageHeader, StatusChip } from "@/components/studio/views";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { analyze, hasPrevious } from "@/lib/analysis";
import { G } from "@/lib/copy/generators";
import { getReportDoc } from "@/lib/data/repo";
import { PCT, fDate } from "@/lib/format";
import { clientReady, resolveData } from "@/lib/report/conflicts";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const doc = await getReportDoc((await params).id);
  return { title: doc ? `${doc.client.name}, ${analyze(doc.data).month}` : "Report" };
}

type Warn = ["medium" | "low", React.ReactNode];

export default async function ReportViewer({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ duplicates?: string }> }) {
  const { id } = await params;
  const duplicates = Number((await searchParams).duplicates) || 0;
  const doc = await getReportDoc(id);
  if (!doc) notFound();
  const { data, conflicts } = resolveData(doc);
  const A = analyze(data);
  const pages = buildPages(clientReady(doc), A);

  // Admin-only review list. None of this reaches the client report.
  const warns: Warn[] = [];
  const samples = data.content.filter((c) => c.provenance === "sample").length;
  if (samples) warns.push(["medium", `${samples} of ${data.content.length} pieces carry sample figures (only fields confirmed in the brief are real). Replace them with extracted data before sending.`]);
  if (doc.isDemo && !Object.keys(doc.uploads).length) warns.push(["medium", "Source screenshot pages show placeholder renders of the figures, not the uploaded screenshots."]);
  if (!doc.isDemo && !Object.values(doc.uploads).some((l) => l?.length)) warns.push(["medium", "No source screenshots attached, so the report has no source pages and its figures cannot be checked against them. Add them under Edit data."]);
  if (!data.content.length && doc.sections.content) warns.push(["medium", "No posts entered, so the content pages show no pieces."]);
  warns.push(["low", "“Why it performed this way” is hedged on purpose. Visual causes need creative-file review."]);
  if (!hasPrevious(data)) warns.push(["medium", "No previous-month data, so month-over-month is hidden."]);
  ([["profileVisits", "Profile visits"], ["websiteClicks", "Website clicks"]] as const).forEach(([k, l]) => {
    if (data.ig[k] == null) warns.push(["low", `${l} not in uploaded data. Shown as unavailable.`]);
  });
  if (data.outcomes.sales == null) warns.push(["medium", "No sales data, so the report states sales attribution is unavailable."]);

  const blocks = Object.keys(G);
  const conf = { high: 0, medium: 0, low: 0 };
  blocks.forEach((b) => conf[blockConfidence(b)]++);

  return (
    <>
      <PageHeader
        title={`${doc.client.name}, ${A.month}`}
        sub={
          <span className="flex flex-wrap gap-1.5">
            <StatusChip status={doc.status} />
            <Badge>{doc.template[0].toUpperCase() + doc.template.slice(1)}</Badge>
            {doc.isDemo ? <Badge variant="warn">Contains sample data</Badge> : null}
          </span>
        }
      >
        <Button asChild variant="ghost"><Link href="/reports">All reports</Link></Button>
        <Button asChild><Link href={`/reports/${doc.id}/edit`}>Edit data</Link></Button>
        <Button asChild><a href={`/print/reports/${doc.id}`} target="_blank" rel="noreferrer">Print view</a></Button>
        <Button asChild variant="primary"><a href={`/api/reports/${doc.id}/pdf`}>Download PDF</a></Button>
      </PageHeader>

      {duplicates ? (
        <p role="status" className="mb-4 rounded-2xl border border-border bg-card px-3.5 py-2 text-[13px]">
          {duplicates} screenshot{duplicates === 1 ? " was" : "s were"} already attached, so {duplicates === 1 ? "it was" : "they were"} skipped instead of being counted twice.
        </p>
      ) : null}
      <div className="grid grid-cols-[190px_minmax(0,1fr)_300px] items-start gap-[18px] max-[1560px]:grid-cols-[minmax(0,1fr)_280px] max-[980px]:grid-cols-1">
        <nav aria-label="Pages" className="sticky top-4 max-h-[calc(100vh-40px)] overflow-auto text-[12.5px] max-[1560px]:hidden">
          {pages.map((p, i) => (
            <a key={p.key} href={`#pg-${i}`} className="flex gap-2 rounded-md px-1.5 py-[5px] text-muted-foreground hover:bg-muted hover:text-foreground">
              <i className="min-w-5 not-italic tabular-nums">{i + 1}</i>
              <span>{doc.titles[p.key] ?? p.title}</span>
            </a>
          ))}
        </nav>

        <FitPages>
          <ReportPages doc={doc} mode="screen" scale="var(--fit, 1)" />
        </FitPages>

        <aside className="sticky top-4 grid max-h-[calc(100vh-40px)] gap-3.5 overflow-auto max-[980px]:static max-[980px]:max-h-none">
          <form action={changeStatus} className="flex flex-wrap items-end gap-2 rounded-[20px] border border-border bg-card p-3.5">
            <input type="hidden" name="reportId" value={doc.id} />
            <label className="grid flex-1 gap-1 text-[12.5px] font-medium text-muted-foreground">
              Status
              <select name="status" defaultValue={doc.status} className="h-8 rounded-xl border border-input bg-card px-2 text-sm text-foreground">
                {["Draft", "Pending", "Ready for review", "Delivered"].map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
            <Button size="sm" type="submit">Update</Button>
          </form>
          {conflicts.map((c) => (
            <div key={c.metric} className={`rounded-[20px] border bg-card p-3.5 ${c.chosen ? "border-border" : "border-warn"}`}>
              <h2 className="mb-1.5 text-[13px] font-bold">Potential data conflict detected: {c.label.toLowerCase()}</h2>
              <p className="mb-2.5 text-[12.5px] text-muted-foreground">
                The platform reports {PCT(c.reported)}; the confirmed follower figures calculate to {PCT(c.calculated)}.{" "}
                {c.chosen ? `The report uses the ${c.chosen === "reported" ? "platform-reported" : "calculated"} value.` : "Choose one. Until then it is left out of the report."}
              </p>
              <form action={chooseResolution} className="flex flex-wrap gap-1.5">
                <input type="hidden" name="reportId" value={doc.id} />
                <input type="hidden" name="metric" value={c.metric} />
                <Button size="sm" name="choice" value="reported" variant={c.chosen === "reported" ? "primary" : "default"}>Use {PCT(c.reported)}</Button>
                <Button size="sm" name="choice" value="calculated" variant={c.chosen === "calculated" ? "primary" : "default"}>Use {PCT(c.calculated)}</Button>
              </form>
            </div>
          ))}

          <div className="rounded-[20px] border border-border bg-card p-3.5">
            <h2 className="mb-2 text-[13px] font-bold">Review before sharing</h2>
            <ul className="grid gap-2 text-[12.5px]">
              {warns.map(([level, text], i) => (
                <li key={i} className="flex gap-2">
                  <Badge variant={level === "low" ? "bad" : "warn"} className="h-fit flex-none">{level === "low" ? "Low" : "Medium"}</Badge>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-xs text-muted-foreground">
              Copy confidence: {conf.high} high, {conf.medium} medium, {conf.low} low blocks. Confidence is for the GBS team and is never shown to the client.
            </p>
          </div>

          <div className="rounded-[20px] border border-border bg-card p-3.5">
            <h2 className="mb-1 text-[13px] font-bold">Internal notes</h2>
            <p className="mb-2 text-xs text-muted-foreground">Never appears in the client report.</p>
            {doc.notes.map((n, i) => (
              <div key={i} className="mb-1.5 rounded-lg bg-muted px-2.5 py-2 text-[12.5px]">
                {n.text}
                <div className="text-[11px] text-muted-foreground">{n.by}, {fDate(n.date)}</div>
              </div>
            ))}
            <form action={addNote} className="grid gap-1.5">
              <input type="hidden" name="reportId" value={doc.id} />
              <label className="sr-only" htmlFor="note">Add an internal note</label>
              <Textarea id="note" name="text" rows={2} placeholder="Add an internal note" required maxLength={2000} />
              <Button size="sm" type="submit" className="justify-self-start">Add note</Button>
            </form>
          </div>
        </aside>
      </div>
    </>
  );
}
