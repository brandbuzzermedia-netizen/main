// Edit the written parts of a report, block by block, with saved versions.
// Hook-free: the app renders it with server actions, the preview with local ones.
import Link from "next/link";
import { PageHeader } from "@/components/studio/views";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { analyze } from "@/lib/analysis";
import { reportBlocks } from "@/lib/copy/blocks";
import { CONF, blockText, variantCount } from "@/lib/copy/generators";
import { fDate } from "@/lib/format";
import { resolveData } from "@/lib/report/conflicts";
import type { ReportDoc } from "@/lib/report/types";

type FormFn = (fd: FormData) => void | Promise<void>;

export interface TextVersionView {
  v: number;
  label: string;
  at: string;
  by: string;
}

export interface TextEditorActions {
  editBlock: FormFn;
  saveVersion: FormFn;
  restoreVersion: FormFn;
  resetAll: FormFn;
  /** Present when Claude can be used (ANTHROPIC_API_KEY is set on the server). */
  writeWithClaude?: FormFn;
}

const CONF_LABEL = { high: ["ok", "High confidence"], medium: ["warn", "Medium confidence"], low: ["bad", "Low confidence"] } as const;

export function TextEditor({ doc, versions, actions, aiNote, notice }: {
  doc: ReportDoc; versions: TextVersionView[]; actions: TextEditorActions; aiNote?: string; notice?: string;
}) {
  const A = analyze(resolveData(doc).data);
  const blocks = reportBlocks(doc);
  const pages = [...new Set(blocks.map((b) => b.page))];
  return (
    <>
      <PageHeader title={`Report text: ${doc.client.name}, ${A.month}`} sub="Edit any block. Figures must stay as they are in the report data; confidence is for the GBS team only.">
        <Button asChild variant="ghost"><Link href={`/reports/${doc.id}`}>Back to the report</Link></Button>
      </PageHeader>

      {notice ? <p role="status" className="mb-4 rounded-2xl border border-border bg-card px-4 py-2.5 text-[13px]">{notice}</p> : null}

      <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-5 max-[980px]:grid-cols-1">
        <div className="grid gap-5">
          {pages.map((page) => (
            <section key={page} className="rounded-[20px] border border-border bg-card p-5">
              <h2 className="mb-3 font-heading text-[17px] font-bold text-heading">{page}</h2>
              <div className="grid gap-4">
                {blocks.filter((b) => b.page === page).map((b) => {
                  const edited = doc.texts[b.id] != null;
                  const [variant, label] = CONF_LABEL[CONF[b.id.split(".")[0]] ?? "low"];
                  const many = variantCount(b.id, A) > 1;
                  return (
                    <form key={b.id} id={b.id} action={actions.editBlock} className="grid gap-1.5 scroll-mt-4">
                      <input type="hidden" name="reportId" value={doc.id} />
                      <input type="hidden" name="block" value={b.id} />
                      <div className="flex flex-wrap items-center gap-1.5">
                        <label htmlFor={`t-${b.id}`} className="text-[13px] font-semibold">{b.label}</label>
                        <Badge variant={variant}>{label}</Badge>
                        {edited ? <Badge>Edited</Badge> : null}
                      </div>
                      {/* Keyed by the saved text so a restore or reset replaces what is shown. */}
                      <Textarea key={blockText(doc, A, b.id)} id={`t-${b.id}`} name="text" rows={3} defaultValue={blockText(doc, A, b.id)} maxLength={2000} />
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="primary" name="op" value="save">Save</Button>
                        <Button size="sm" name="op" value="shorten">Shorten</Button>
                        <Button size="sm" name="op" value="expand">Expand</Button>
                        {many ? <Button size="sm" name="op" value="next">Other wording</Button> : null}
                        {edited ? <Button size="sm" variant="ghost" name="op" value="reset">Reset to generated</Button> : null}
                      </div>
                    </form>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <aside className="sticky top-4 grid gap-3.5 max-[980px]:static">
          <div className="rounded-[20px] border border-border bg-card p-3.5">
            <h2 className="mb-1 text-[13px] font-bold">Write with Claude</h2>
            {actions.writeWithClaude ? (
              <form action={actions.writeWithClaude} className="grid gap-2">
                <input type="hidden" name="reportId" value={doc.id} />
                <p className="text-xs text-muted-foreground">Rewrites every block from this report&apos;s figures only. Any block that mentions a figure not in the data is rejected and keeps its current text. The current text is saved as a version first.</p>
                <Button size="sm" variant="primary" type="submit" className="justify-self-start">Write the report text</Button>
              </form>
            ) : (
              <p className="text-xs text-muted-foreground">{aiNote ?? "Set ANTHROPIC_API_KEY on the server to let Claude write the report text."}</p>
            )}
          </div>

          <div className="rounded-[20px] border border-border bg-card p-3.5">
            <h2 className="mb-1 text-[13px] font-bold">Versions</h2>
            <form action={actions.saveVersion} className="mb-2 flex gap-1.5">
              <input type="hidden" name="reportId" value={doc.id} />
              <Input name="label" placeholder="Name this version" className="h-8" aria-label="Version name" maxLength={80} />
              <Button size="sm" type="submit">Save</Button>
            </form>
            {versions.length ? (
              <ul className="grid gap-1.5 text-[12.5px]">
                {versions.map((v) => (
                  <li key={v.v} className="flex items-start justify-between gap-2 rounded-lg bg-muted px-2.5 py-2">
                    <span><b>v{v.v}</b> {v.label}<span className="block text-[11px] text-muted-foreground">{v.by}, {fDate(v.at.slice(0, 10))}</span></span>
                    <form action={actions.restoreVersion}>
                      <input type="hidden" name="reportId" value={doc.id} />
                      <input type="hidden" name="v" value={v.v} />
                      <Button size="sm" variant="ghost" type="submit">Restore</Button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-muted-foreground">No versions yet. Save one before big changes; Claude rewrites save one automatically.</p>}
            <form action={actions.resetAll} className="mt-3 border-t border-border pt-2.5">
              <input type="hidden" name="reportId" value={doc.id} />
              <Button size="sm" variant="ghost" type="submit">Reset all text to templates</Button>
            </form>
          </div>
        </aside>
      </div>
    </>
  );
}
