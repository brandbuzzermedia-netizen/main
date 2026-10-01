"use client";
// Create or edit a report's data: the figures typed from the month's
// screenshots, each published piece, and the screenshots themselves.
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { saveReport, type ReportFormState } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { POST_METRICS, type ContentRowInput } from "@/lib/report/parse";
import { PLATFORM_LABELS, SECTION_KEYS, SECTION_LABELS, type Platform, type ReportData, type SectionKey, type SourceShot, type Template } from "@/lib/report/types";
import { cn } from "@/lib/utils";

type Field = [name: string, label: string, hint?: string];

const IG: Field[] = [
  ["ig.views", "Views", "Insights › Overview"],
  ["ig.unique", "Accounts reached"],
  ["ig.nonFol", "Views from non-followers (%)"],
  ["ig.followers", "Followers at month end"],
  ["ig.net", "Net follows", "Gained minus lost, e.g. 49 or -12"],
  ["ig.growth", "Follower growth (%)", "As Insights reports it. Leave blank if not shown."],
  ["ig.profileVisits", "Profile visits"],
  ["ig.websiteClicks", "External link taps"],
  ["ig.messages", "Messages from organic posts"],
];
const META: Field[] = [
  ["meta.campaign", "Campaign name"],
  ["meta.objective", "Objective", "e.g. Messages"],
  ["meta.spend", "Amount spent (₹)"],
  ["meta.conv", "Messaging conversations started", "The report describes results as messaging conversations."],
  ["meta.impr", "Impressions"],
  ["meta.reach", "Reach"],
  ["meta.clicks", "Link clicks", "Leave blank if not in the screenshot."],
];
const OUTCOMES: Field[] = [
  ["outcomes.qualified", "Qualified leads"],
  ["outcomes.bookings", "Bookings"],
  ["outcomes.sales", "Sales"],
  ["outcomes.revenue", "Revenue (₹)"],
];
const PREV: Field[] = [
  ["prev.views", "Instagram views"], ["prev.unique", "Accounts reached"], ["prev.followers", "Followers"],
  ["prev.net", "Net follows"], ["prev.posts", "Posts published"], ["prev.reels", "Reels published"],
  ["prev.spend", "Ad spend (₹)"], ["prev.conv", "Messaging conversations"], ["prev.impr", "Impressions"], ["prev.reach", "Ad reach"],
];
const TEXT_FIELDS = new Set(["meta.campaign", "meta.objective"]);

export interface ReportFormInitial {
  id?: string;
  clientId?: string;
  template: Template;
  sections: Record<SectionKey, boolean>;
  data?: ReportData;
  uploads?: Partial<Record<Platform, SourceShot[]>>;
}

const emptyRow = (): ContentRowInput => ({ date: "", type: "Reel", theme: "", caption: "", tags: "" });
const pathValue = (data: ReportData | undefined, name: string) => {
  if (!data) return "";
  const [group, key] = name.split(".");
  const v = (data as unknown as Record<string, Record<string, unknown>>)[group]?.[key];
  return v == null ? "" : String(v);
};

export function ReportForm({ clients, initial }: { clients: { id: string; name: string }[]; initial: ReportFormInitial }) {
  const [state, action] = useActionState<ReportFormState, FormData>(saveReport, {});
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<ContentRowInput[]>(() =>
    initial.data?.content.map((c) => ({
      date: c.date, type: c.type, theme: c.theme, caption: c.caption, tags: c.tags,
      ...Object.fromEntries(POST_METRICS.map((k) => [k, c[k] == null ? "" : String(c[k])])),
    })) ?? [emptyRow()],
  );
  const err = state.errors ?? {};
  const setRow = (i: number, patch: Partial<ContentRowInput>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const field = ([name, label, hint]: Field) => (
    <Label key={name}>
      {label}
      <Input
        name={name}
        defaultValue={pathValue(initial.data, name)}
        inputMode={TEXT_FIELDS.has(name) ? undefined : "decimal"}
        placeholder={TEXT_FIELDS.has(name) ? "" : "Not available"}
        aria-invalid={!!err[name]}
        aria-describedby={err[name] ? `${name}-err` : undefined}
      />
      {err[name] ? <span id={`${name}-err`} className="text-xs text-bad">{err[name]}</span> : hint ? <span className="text-[11.5px] font-normal">{hint}</span> : null}
    </Label>
  );
  const group = (title: string, sub: string, fields: Field[]) => (
    <fieldset className="rounded-[20px] border border-border bg-card p-5">
      <legend className="px-1 font-heading text-[17px] font-bold text-heading">{title}</legend>
      <p className="mb-3.5 text-[13px] text-muted-foreground">{sub}</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3.5">{fields.map(field)}</div>
    </fieldset>
  );

  return (
    <form
      noValidate
      encType="multipart/form-data"
      className="grid gap-5"
      // Submitting through a transition keeps every field (and chosen files) after a validation error.
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(() => action(fd));
      }}
    >
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="content" value={JSON.stringify(rows)} />

      {state.error ? <p role="alert" className="rounded-2xl border border-bad bg-card px-4 py-2.5 text-sm text-bad">{state.error}</p> : null}

      <fieldset className="rounded-[20px] border border-border bg-card p-5">
        <legend className="px-1 font-heading text-[17px] font-bold text-heading">Client and period</legend>
        <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3.5">
          <Label>
            Client
            <select
              name="clientId"
              defaultValue={initial.clientId ?? ""}
              disabled={!!initial.id}
              aria-invalid={!!err.clientId}
              className="h-9 w-full rounded-xl border border-input bg-card px-2.5 text-sm text-foreground"
            >
              <option value="" disabled>Choose a client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {err.clientId ? <span className="text-xs text-bad">{err.clientId}</span> : null}
          </Label>
          <Label>
            First day
            <Input type="date" name="periodStart" defaultValue={initial.data?.period.start} aria-invalid={!!err.periodStart} />
            {err.periodStart ? <span className="text-xs text-bad">{err.periodStart}</span> : null}
          </Label>
          <Label>
            Last day
            <Input type="date" name="periodEnd" defaultValue={initial.data?.period.end} aria-invalid={!!err.periodEnd} />
            {err.periodEnd ? <span className="text-xs text-bad">{err.periodEnd}</span> : null}
          </Label>
          <Label>
            Template
            <select name="template" defaultValue={initial.template} className="h-9 w-full rounded-xl border border-input bg-card px-2.5 text-sm text-foreground">
              <option value="premium">Premium</option>
              <option value="minimal">Minimal</option>
              <option value="dark">Dark</option>
            </select>
          </Label>
        </div>
      </fieldset>

      {group("Instagram Insights", "Type the figures exactly as the Insights screenshots show them. Leave a field blank when it is not in the screenshots; the report then says it is not available.", IG)}
      {group("Meta Ads", "From Ads Manager for the same period. Leave everything blank if no ads ran.", META)}
      {group("Results reported by the client", "Only what the client told you. The report never estimates leads, bookings or sales.", OUTCOMES)}
      {group("Previous month (optional)", "Fill these in to add a month-over-month page. Rows left blank are shown as not comparable.", PREV)}

      <fieldset className="min-w-0 rounded-[20px] border border-border bg-card p-5">
        <legend className="px-1 font-heading text-[17px] font-bold text-heading">Content published</legend>
        <p className="mb-3.5 text-[13px] text-muted-foreground">One row per post, from each post&apos;s Insights. Theme groups similar posts (e.g. Product showcase, Festival).</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-[12.5px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                {["Date", "Type", "Theme", "Caption", "Hashtags", "Views", "Reach", "Likes", "Comments", "Shares", "Saves", ""].map((h) => (
                  <th key={h} className="border-b border-border px-1 py-1.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const rowErr = Object.entries(err).filter(([k]) => k.startsWith(`content.${i}.`)).map(([, v]) => v);
                const cell = "h-8 rounded-lg px-1.5 text-[12.5px]";
                return (
                  <tr key={i} className="align-top">
                    <td className="px-1 py-1"><Input type="date" aria-label={`Post ${i + 1} date`} value={r.date} onChange={(e) => setRow(i, { date: e.target.value })} className={cn(cell, "w-[132px]")} aria-invalid={!!err[`content.${i}.date`]} /></td>
                    <td className="px-1 py-1">
                      <select aria-label={`Post ${i + 1} type`} value={r.type} onChange={(e) => setRow(i, { type: e.target.value })} className="h-8 rounded-lg border border-input bg-card px-1 text-[12.5px] text-foreground">
                        <option>Reel</option><option>Post</option><option>Carousel</option>
                      </select>
                    </td>
                    <td className="px-1 py-1"><Input aria-label={`Post ${i + 1} theme`} value={r.theme} onChange={(e) => setRow(i, { theme: e.target.value })} className={cn(cell, "w-[130px]")} placeholder="Product showcase" /></td>
                    <td className="px-1 py-1"><Input aria-label={`Post ${i + 1} caption`} value={r.caption} onChange={(e) => setRow(i, { caption: e.target.value })} className={cn(cell, "w-[200px]")} /></td>
                    <td className="px-1 py-1"><Input aria-label={`Post ${i + 1} hashtags`} value={r.tags} onChange={(e) => setRow(i, { tags: e.target.value })} className={cn(cell, "w-[130px]")} /></td>
                    {POST_METRICS.map((k) => (
                      <td key={k} className="px-1 py-1">
                        <Input aria-label={`Post ${i + 1} ${k}`} inputMode="numeric" value={r[k] ?? ""} onChange={(e) => setRow(i, { [k]: e.target.value })} className={cn(cell, "w-[72px]")} aria-invalid={!!err[`content.${i}.${k}`]} />
                      </td>
                    ))}
                    <td className="px-1 py-1">
                      <Button type="button" size="sm" variant="ghost" aria-label={`Remove post ${i + 1}`} onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>Remove</Button>
                      {rowErr.length ? <div className="mt-1 w-[180px] text-[11.5px] text-bad">{rowErr.join(" ")}</div> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {err.content ? <p className="mt-2 text-xs text-bad">{err.content}</p> : null}
        <Button type="button" size="sm" className="mt-3" onClick={() => setRows((x) => [...x, emptyRow()])}>+ Add post</Button>
      </fieldset>

      <fieldset className="rounded-[20px] border border-border bg-card p-5">
        <legend className="px-1 font-heading text-[17px] font-bold text-heading">Source screenshots</legend>
        <p className="mb-3.5 text-[13px] text-muted-foreground">PNG, JPG or WebP, up to 10 MB each. They appear in the report as the source of every figure. The same screenshot uploaded twice is only kept once.</p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3.5">
          {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
            <div key={p} className="rounded-2xl border border-dashed border-gbs-sage p-3">
              <Label>
                <span className="font-semibold text-foreground">{PLATFORM_LABELS[p]}</span>
                <input type="file" name={`shots.${p}`} multiple accept="image/png,image/jpeg,image/webp" className="text-xs" />
              </Label>
              {(initial.uploads?.[p] ?? []).map((f) => (
                <label key={f.hash ?? f.url} className="mt-2 flex items-center gap-2 text-xs">
                  <input type="checkbox" name={`keep.${p}`} value={f.hash} defaultChecked />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt="" className="size-8 rounded object-cover" />
                  <span className="truncate">{f.name}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="rounded-[20px] border border-border bg-card p-5">
        <legend className="px-1 font-heading text-[17px] font-bold text-heading">Pages to include</legend>
        <p className="mb-3.5 text-[13px] text-muted-foreground">Turn off what this client does not need. A page without data shows a one-line note rather than an empty page.</p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2">
          {SECTION_KEYS.map((k) => (
            <label key={k} className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 font-medium">
              <input type="checkbox" name="sections" value={k} defaultChecked={initial.sections[k]} />
              {SECTION_LABELS[k]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="lg" disabled={pending}>{pending ? "Saving…" : initial.id ? "Save and view report" : "Create report"}</Button>
        <Button asChild variant="ghost" size="lg"><Link href={initial.id ? `/reports/${initial.id}` : "/reports"}>Cancel</Link></Button>
      </div>
    </form>
  );
}
