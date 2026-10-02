"use client";
// Create or edit a report's data: the figures typed from the month's
// screenshots, each published piece, and the screenshots themselves.
import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import type { FormAction, ReportFormState } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { POST_METRICS, type ContentRowInput } from "@/lib/report/parse";
import { PLATFORM_LABELS, RESULT_TYPES, SECTION_KEYS, SECTION_LABELS, type Platform, type ReportData, type SectionKey, type SourceShot, type Template } from "@/lib/report/types";
import { cn } from "@/lib/utils";

type Field = [name: string, label: string, hint?: string];

const IG: Field[] = [
  ["ig.views", "Views (impressions)", "Insights › Overview"],
  ["ig.unique", "Accounts reached"],
  ["ig.engaged", "Accounts engaged"],
  ["ig.nonFol", "Views from non-followers (%)"],
  ["ig.followersStart", "Followers at month start"],
  ["ig.followers", "Followers at month end"],
  ["ig.net", "Net follows", "Gained minus lost. Calculated from start and end when left blank."],
  ["ig.growth", "Follower growth (%)", "As Insights reports it. Leave blank if not shown."],
  ["ig.likes", "Likes"],
  ["ig.comments", "Comments"],
  ["ig.shares", "Shares"],
  ["ig.saves", "Saves"],
  ["ig.posts", "Posts published"],
  ["ig.reels", "Reels published"],
  ["ig.stories", "Stories published"],
  ["ig.profileVisits", "Profile visits"],
  ["ig.websiteClicks", "External link taps"],
  ["ig.messages", "Messages from organic posts"],
];
const META: Field[] = [
  ["meta.campaign", "Campaign name"],
  ["meta.objective", "Objective", "As Ads Manager shows it, e.g. Leads or Engagement"],
  ["meta.resultType", "Results are", "What Ads Manager counts as a result. The report's wording follows it."],
  ["meta.spend", "Amount spent (₹)"],
  ["meta.conv", "Results", "Leads, conversations, calls… of the type chosen above."],
  ["meta.impr", "Impressions"],
  ["meta.reach", "Reach"],
  ["meta.clicks", "Link clicks", "Leave blank if not in the screenshot."],
  ["meta.ctr", "CTR (%)", "Only if clicks are not shown. Otherwise it is calculated."],
  ["meta.cpc", "Cost per click (₹)", "Only if clicks are not shown."],
  ["meta.cpm", "CPM (₹)", "Only if impressions are not shown."],
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
  ["prev.spend", "Ad spend (₹)"], ["prev.conv", "Ad results"], ["prev.impr", "Impressions"], ["prev.reach", "Ad reach"],
];
const TEXT_FIELDS = new Set(["meta.campaign", "meta.objective"]);

export interface ReportFormInitial {
  id?: string;
  /** Shown above the form, e.g. where pre-filled figures came from. */
  note?: string;
  clientId?: string;
  template: Template;
  sections: Record<SectionKey, boolean>;
  data?: ReportData;
  uploads?: Partial<Record<Platform, SourceShot[]>>;
  /** The report this one is copied from (same client only). */
  copyFrom?: { id: string; kind: "next-month" | "duplicate" };
}

let rowSeq = 0;
/** A key per row, so a cover file stays with its post when rows are added or removed. */
const rowKey = () => `r${Date.now().toString(36)}${(rowSeq++).toString(36)}`;
const emptyRow = (): ContentRowInput => ({ key: rowKey(), date: "", type: "Reel", theme: "", caption: "", tags: "" });
const pathValue = (data: ReportData | undefined, name: string) => {
  if (!data) return "";
  const [group, key] = name.split(".");
  const v = (data as unknown as Record<string, Record<string, unknown>>)[group]?.[key];
  return v == null ? "" : String(v);
};

type Mark = { kind: "filled" | "conflict"; confidence: string; value: string };
type ExtractStatus = { busy?: boolean; text?: string; bad?: boolean };
type Extracted = {
  error?: string; notes?: string;
  fields?: Record<string, { value: number | string; confidence: string }>;
  account?: string | null;
  period?: { start: string | null; end: string | null };
  posts?: { date: string | null; type: string | null; caption: string | null; views: number | null; reach: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null }[];
};

export function ReportForm({ clients, initial, action: save, extractEnabled = false }: {
  clients: { id: string; name: string; instagram?: string | null }[]; initial: ReportFormInitial; action: FormAction<ReportFormState>;
  /** Claude can read screenshots (ANTHROPIC_API_KEY is set on the server). */
  extractEnabled?: boolean;
}) {
  const [state, action] = useActionState<ReportFormState, FormData>(save, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [extract, setExtract] = useState<Record<string, ExtractStatus>>({});

  /** Reads one platform's chosen screenshots with Claude and fills the empty fields. Nothing is saved. */
  async function readScreenshots(p: "instagram" | "meta") {
    const form = formRef.current;
    const input = form?.elements.namedItem(`shots.${p}`) as HTMLInputElement | null;
    const files = Array.from(input?.files ?? []);
    if (!form || !files.length) { setExtract((x) => ({ ...x, [p]: { text: "Choose the screenshots first, then read them.", bad: true } })); return; }
    setExtract((x) => ({ ...x, [p]: { busy: true, text: "Reading the screenshots…" } }));
    const fd = new FormData();
    fd.set("platform", p);
    fd.set("clientId", (form.elements.namedItem("clientId") as HTMLSelectElement).value);
    fd.set("periodStart", (form.elements.namedItem("periodStart") as HTMLInputElement).value);
    files.slice(0, 6).forEach((f) => fd.append("files", f));
    let res: Extracted;
    try { res = await (await fetch("/api/extract", { method: "POST", body: fd })).json(); }
    catch { res = { error: "The screenshots could not be sent. Check your connection and try again." }; }
    if (res.error) { setExtract((x) => ({ ...x, [p]: { text: res.error, bad: true } })); return; }
    const next: Record<string, Mark> = {};
    let filled = 0, conflicts = 0;
    for (const [name, f] of Object.entries(res.fields ?? {})) {
      const el = form.elements.namedItem(name) as HTMLInputElement | null;
      if (!el) continue;
      const value = String(f.value);
      const current = el.value.replace(/[,\s₹%]/g, "");
      if (!current) { el.value = value; filled++; next[name] = { kind: "filled", confidence: f.confidence, value }; }
      else if (current !== value.replace(/[,\s]/g, "")) { conflicts++; next[name] = { kind: "conflict", confidence: f.confidence, value }; }
    }
    setMarks((m) => ({ ...m, ...next }));
    const posts = (res.posts ?? []).filter((x) => x.date);
    if (posts.length) {
      setRows((r) => [...r.filter((x) => x.date || x.theme || x.caption), ...posts.map((x) => ({
        key: rowKey(), date: x.date ?? "", type: x.type ?? "Post", theme: "", caption: x.caption ?? "", tags: "",
        ...Object.fromEntries(POST_METRICS.map((k) => [k, x[k] == null ? "" : String(x[k])])),
      }))]);
    }
    const start = (form.elements.namedItem("periodStart") as HTMLInputElement).value, end = (form.elements.namedItem("periodEnd") as HTMLInputElement).value;
    const period = res.period?.start && start && (res.period.start !== start || res.period.end !== end)
      ? ` The screenshots show ${res.period.start} to ${res.period.end}, which is not the report period: check they are the right screenshots.` : "";
    // Isolation check: the screenshots should show this client's own account.
    const chosen = clients.find((c) => c.id === (form.elements.namedItem("clientId") as HTMLSelectElement).value);
    const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
    const acct = res.account ? norm(res.account) : "";
    const expected = [chosen?.instagram, chosen?.name].filter(Boolean).map((v) => norm(v!));
    const mismatch = acct && chosen && !expected.some((e) => e && (acct.includes(e) || e.includes(acct)))
      ? ` These screenshots appear to show the account "${res.account}", not ${chosen.name}. Check you uploaded this client's screenshots.` : "";
    setExtract((x) => ({ ...x, [p]: {
      bad: !!period || conflicts > 0 || !!mismatch,
      text: `Filled ${filled} field${filled === 1 ? "" : "s"}${posts.length ? ` and added ${posts.length} post${posts.length === 1 ? "" : "s"}` : ""}. Check each one against the screenshot before saving.` +
        (conflicts ? ` ${conflicts} field${conflicts === 1 ? "" : "s"} already had a different value; both are shown so you can choose.` : "") + period + mismatch + (res.notes ? ` Note: ${res.notes}` : ""),
    } }));
  }
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<ContentRowInput[]>(() =>
    !initial.id && !initial.data?.content.length ? [emptyRow()] : initial.data!.content.map((c) => ({
      key: rowKey(), img: c.img ?? "", date: c.date, type: c.type, theme: c.theme, caption: c.caption, tags: c.tags,
      ...Object.fromEntries(POST_METRICS.map((k) => [k, c[k] == null ? "" : String(c[k])])),
    })) ?? [],
  );
  // Previews of cover files picked but not saved yet, by row key.
  const [coverPreview, setCoverPreview] = useState<Record<string, string>>({});
  const err = state.errors ?? {};
  const setRow = (i: number, patch: Partial<ContentRowInput>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const field = ([name, label, hint]: Field) => name === "meta.resultType" ? (
    <Label key={name}>
      {label}
      <select name={name} defaultValue={pathValue(initial.data, name)} aria-invalid={!!err[name]} className="h-9 w-full rounded-xl border border-input bg-card px-2.5 text-sm text-foreground">
        <option value="">Choose…</option>
        {RESULT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      {err[name] ? <span className="text-xs text-bad">{err[name]}</span> : hint ? <span className="text-[11.5px] font-normal">{hint}</span> : null}
    </Label>
  ) : (
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
      {err[name] ? <span id={`${name}-err`} className="text-xs text-bad">{err[name]}</span>
        : marks[name]?.kind === "conflict" ? (
          <span className="text-xs text-warn">
            Potential data conflict: the screenshot shows {marks[name].value}.{" "}
            <button type="button" className="font-semibold underline" onClick={() => {
              const el = formRef.current?.elements.namedItem(name) as HTMLInputElement | null;
              if (el) el.value = marks[name].value;
              setMarks((m) => ({ ...m, [name]: { ...m[name], kind: "filled" } }));
            }}>Use the screenshot value</button>
          </span>
        )
        : marks[name] ? <span className="text-xs text-ok">From screenshot ({marks[name].confidence} confidence). Check it.</span>
        : hint ? <span className="text-[11.5px] font-normal">{hint}</span> : null}
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
      ref={formRef}
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
      {initial.copyFrom ? <><input type="hidden" name="copyFrom" value={initial.copyFrom.id} /><input type="hidden" name="copyKind" value={initial.copyFrom.kind} /></> : null}
      <input type="hidden" name="content" value={JSON.stringify(rows)} />

      {initial.note ? <p className="rounded-2xl border border-border bg-card px-4 py-2.5 text-sm">{initial.note}</p> : null}
      {state.error ? <p role="alert" className="rounded-2xl border border-bad bg-card px-4 py-2.5 text-sm text-bad">{state.error}</p> : null}

      <fieldset className="rounded-[20px] border border-border bg-card p-5">
        <legend className="px-1 font-heading text-[17px] font-bold text-heading">Client and period</legend>
        <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3.5">
          <Label>
            Client
            {initial.id || initial.copyFrom ? <input type="hidden" name="clientId" value={initial.clientId} /> : null}
            <select
              name="clientId"
              defaultValue={initial.clientId ?? ""}
              disabled={!!initial.id || !!initial.copyFrom}
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
        <p className="mb-3.5 text-[13px] text-muted-foreground">One row per post, from each post&apos;s Insights. Theme groups similar posts (e.g. Product showcase, Festival). Click <b>+ Cover</b> to add the post&apos;s cover image: a screenshot of the Reel cover or post, ideally <b>1080 × 1350 px</b> (4:5). Reel covers of 1080 × 1920 px work too; the report shows the middle of the image.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1160px] border-collapse text-[12.5px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                {["Cover", "Date", "Type", "Theme", "Caption", "Hashtags", "Views", "Reach", "Likes", "Comments", "Shares", "Saves", ""].map((h) => (
                  <th key={h} className="border-b border-border px-1 py-1.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const rowErr = Object.entries(err).filter(([k]) => k.startsWith(`content.${i}.`)).map(([, v]) => v);
                const cell = "h-8 rounded-lg px-1.5 text-[12.5px]";
                return (
                  <tr key={r.key ?? i} className="align-top">
                    <td className="px-1 py-1">
                      {(() => {
                        const k = r.key ?? `i${i}`, src = coverPreview[k] || r.img;
                        return (
                          <div className="flex items-center gap-1.5">
                            <label className="relative grid h-[52px] w-[42px] flex-none cursor-pointer place-items-center overflow-hidden rounded-md border border-dashed border-gbs-sage bg-muted text-[10px] font-semibold text-muted-foreground hover:border-gbs-green" title="Upload this post's cover image">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              {src ? <img src={src} alt={`Post ${i + 1} cover`} className="absolute inset-0 size-full object-cover" /> : "+ Cover"}
                              <input type="file" name={`cover.${k}`} accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={`Post ${i + 1} cover image`}
                                onChange={(e) => { const f = e.target.files?.[0]; setCoverPreview((p) => ({ ...p, [k]: f ? URL.createObjectURL(f) : "" })); }} />
                            </label>
                            {src ? (
                              <button type="button" className="text-[10.5px] font-semibold text-bad underline" aria-label={`Remove post ${i + 1} cover`} onClick={(e) => {
                                const input = (e.currentTarget.previousElementSibling as HTMLElement).querySelector("input");
                                if (input) (input as HTMLInputElement).value = "";
                                setCoverPreview((p) => ({ ...p, [k]: "" }));
                                setRow(i, { img: "" });
                              }}>Clear</button>
                            ) : null}
                          </div>
                        );
                      })()}
                    </td>
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
              {p === "instagram" || p === "meta" ? (
                extractEnabled ? (
                  <div className="mt-2 grid gap-1">
                    <Button type="button" size="sm" className="justify-self-start" disabled={extract[p]?.busy} onClick={() => readScreenshots(p)}>
                      {extract[p]?.busy ? "Reading…" : extract[p]?.text ? "Read again" : "Read figures from screenshots"}
                    </Button>
                    {extract[p]?.text ? <span role="status" className={`text-[11.5px] ${extract[p]?.bad ? "text-warn" : "text-muted-foreground"}`}>{extract[p]?.text}</span> : null}
                  </div>
                ) : <p className="mt-2 text-[11.5px] text-muted-foreground">Reading figures from screenshots needs Claude (ANTHROPIC_API_KEY on the server). Enter them by hand meanwhile.</p>
              ) : null}
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
        <p className="mb-3.5 text-[13px] text-muted-foreground">Turn off what this client does not need. Pages without data are left out of the report automatically.</p>
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
