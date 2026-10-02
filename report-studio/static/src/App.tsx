// The studio as a browser-only app: the app's own components and checks,
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AiError, writeReportText } from "@/lib/ai/write";
import { aiConfigured, getApiKey, setApiKey } from "./ai-client";
import { buildReportPdf, saveFile } from "./pdf";
import { GBS_TAGLINE } from "@/lib/brand";
// with data kept in this browser instead of on a server.
import Link from "next/link";
import { ReportCover, ReportPages, ReportThumb } from "@/components/report/pages";
import { TextEditor } from "@/components/studio/text-editor";
import { Badge } from "@/components/ui/badge";
import { blockText, variantCount } from "@/lib/copy/generators";
import { expand, shorten } from "@/lib/copy/edit";
import { resolveData } from "@/lib/report/conflicts";
import { duplicateData, followingMonth, nextMonthData } from "@/lib/report/next-month";
import type { Template } from "@/lib/report/types";
import { BrandForm } from "@/components/studio/brand-form";
import { ClientForm } from "@/components/studio/client-form";
import { ReportForm } from "@/components/studio/report-form";
import { ReportReview } from "@/components/studio/report-review";
import { SignInForm } from "@/components/studio/sign-in-form";
import { ClientSwatch, ClientsTable, ComingInStep, PageHeader, ReportsTable, Stats } from "@/components/studio/views";
import type { ReportFormInitial } from "@/components/studio/report-form";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { analyze } from "@/lib/analysis";
import { DEFAULT_BRAND, allSections, pdfFileName, reportId } from "@/lib/data/shared";
import { cn } from "@/lib/utils";
import * as act from "./actions";
import { match, navigate, query, usePath } from "./router";
import * as db from "./store";

const ICONS: Record<string, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></>,
  clients: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.5-4 3-6 6.5-6s6 2 6.5 6" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14c2.5 0 4 1.5 4.5 5" /></>,
  reports: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
  create: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  templates: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 9h18M9 9v11" /></>,
  brand: <><circle cx="12" cy="12" r="9" /><circle cx="8.5" cy="10" r="1" /><circle cx="12" cy="7.5" r="1" /><circle cx="15.5" cy="10" r="1" /><path d="M12 21c-1.5 0-2-1-1.5-2s2-1.5 2-3-1-2-3-2" /></>,
  analytics: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
};
const NAV: [string, string, string][] = [
  ["/", "dashboard", "Dashboard"], ["/clients", "clients", "Clients"], ["/reports", "reports", "Reports"], ["/create", "create", "Create report"],
  ["/templates", "templates", "Templates"], ["/brand", "brand", "Brand assets"], ["/analytics", "analytics", "Analytics"], ["/settings", "settings", "Settings"],
];

const fd2 = (fn: (fd: FormData) => void) => (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); fn(new FormData(e.currentTarget)); };

function Shell({ path, children }: { path: string; children: React.ReactNode }) {
  const name = db.useStore((s) => s.session);
  const p = path.split("?")[0];
  return (
    <div className="grid min-h-screen grid-cols-[236px_minmax(0,1fr)] max-[860px]:grid-cols-1">
      <aside className="bg-hex sticky top-0 flex h-screen flex-col gap-1.5 overflow-auto px-3.5 py-[22px] text-sidebar-foreground max-[860px]:static max-[860px]:h-auto max-[860px]:p-2.5">
        <div className="px-2 pt-1.5 pb-[18px] max-[860px]:pb-2"><img src="brand/logo-stacked-white.png" alt="Get Bee Seen" className="block w-32 max-[860px]:w-20" /></div>
        <nav className="flex flex-col gap-1.5 max-[860px]:flex-row max-[860px]:flex-wrap max-[860px]:gap-0.5" aria-label="Studio">
          {NAV.map(([href, icon, label]) => {
            const on = href === "/" ? p === "/" : p === href || p.startsWith(href + "/");
            return (
              <Link key={href} href={href} aria-current={on ? "page" : undefined}
                className={cn("flex items-center gap-[11px] rounded-full px-2.5 py-[9px] font-medium text-sidebar-muted hover:bg-gbs-cream/12 hover:text-sidebar-foreground max-[860px]:px-[9px] max-[860px]:py-[7px]",
                  on && "bg-gbs-cream/18 text-white after:ml-auto after:size-[9px] after:rounded-full after:bg-gbs-gold after:content-[''] max-[860px]:after:hidden")}>
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] flex-none fill-none stroke-current" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">{ICONS[icon]}</svg>
                <span className="max-[860px]:sr-only">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex-1 max-[860px]:hidden" />
        <div className="space-y-3 border-t border-gbs-cream/18 p-2.5 text-xs text-sidebar-muted max-[860px]:hidden">
          <div className="flex items-center gap-2.5"><img src="brand/bee.png" alt="" className="bee-hover h-[34px] w-auto" /><span>{GBS_TAGLINE}</span></div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">{name}</span>
            <button className="font-semibold text-sidebar-foreground underline-offset-2 hover:underline" onClick={() => { db.signOutNow(); navigate("/login"); }}>Sign out</button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-[34px] pt-7 pb-[60px] max-[860px]:px-3.5 max-[860px]:pt-[18px]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-warn bg-muted px-3.5 py-2 text-[13px]">
          <span>Your reports are saved in this browser on this computer. Download a backup from <b>Settings</b> regularly.</span>
          <a href="/settings" className="font-semibold underline underline-offset-2">Backup</a>
        </div>
        <div key={path.split("?")[0]} className="page-enter">{children}</div>
      </main>
    </div>
  );
}

function Dashboard() {
  const clients = db.useStore(() => db.listClients());
  const reports = db.useStore(() => db.listReports());
  const thisMonth = new Date().toISOString().slice(0, 7);
  const recent = reports.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 8);
  return (
    <>
      <section className="bg-hex hex-drift mb-[22px] flex flex-wrap items-center justify-between gap-5 rounded-[26px] px-8 py-[26px] text-gbs-cream">
        <div>
          <span className="mb-2.5 inline-block rounded-full bg-gbs-gold px-3.5 py-1 text-xs font-bold text-gbs-ink">Client Report Studio</span>
          <h1 className="m-0 font-heading text-[40px] leading-[1.05] font-extrabold">Monthly reports</h1>
          <p className="mt-1.5 opacity-90">Choose a client, upload the month&apos;s screenshots, review, and send.</p>
        </div>
        <div className="flex items-center gap-[18px]">
          <img src="brand/bee.png" alt="" className="bee-fly h-[92px] w-auto max-[640px]:hidden" />
          <div className="flex flex-wrap gap-2">
            <Button asChild><Link href="/clients/new">+ Add client</Link></Button>
            <Button asChild variant="primary"><Link href="/create">+ Create report</Link></Button>
          </div>
        </div>
      </section>
      <Stats items={[
        [clients.length, "Total clients"],
        [reports.filter((r) => r.createdAt.startsWith(thisMonth)).length, "Reports created this month"],
        [reports.filter((r) => r.status !== "Delivered").length, "Pending reports"],
        [reports.filter((r) => r.status === "Delivered").length, "Delivered reports"],
      ]} />
      <Card className="mb-5"><CardTitle>Clients</CardTitle><CardDescription>Each client&apos;s latest report. Start next month&apos;s report from here.</CardDescription><ClientsTable clients={clients} reports={reports} /></Card>
      <Card><CardTitle>Recent reports</CardTitle><CardDescription>Open a report to review it or see its PDF pages.</CardDescription><ReportsTable reports={recent} /></Card>
    </>
  );
}

function Clients() {
  const clients = db.useStore(() => db.listClients());
  const reports = db.useStore(() => db.listReports());
  return (
    <>
      <PageHeader title="Clients" sub="Select a client to see their profile and report history."><Button asChild variant="primary"><Link href="/clients/new">+ Add client</Link></Button></PageHeader>
      <Card><ClientsTable clients={clients} reports={reports} /></Card>
    </>
  );
}

function ClientPage({ id }: { id: string }) {
  const client = db.useStore(() => db.getClient(id));
  const reports = db.useStore(() => db.listReports(id));
  if (!client) return <NotFound />;
  const history = reports.slice().sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1));
  const latest = history.find((r) => r.available);
  const years = [...new Set(history.map((r) => r.periodStart.slice(0, 4)))];
  const details = [client.industry, client.location].filter(Boolean).join(" · ");
  const profile: [string, ReactNode][] = [
    ["Company", client.company], ["Industry", client.industry], ["Contact", client.contact],
    ["Website", client.website], ["Instagram", client.instagram ? `@${client.instagram}` : null], ["Facebook", client.facebook],
    ["Report design", (client.template ?? db.getDefaultTemplate()).replace(/^./, (c) => c.toUpperCase()) + (client.template ? "" : " (studio default)")],
  ];
  return (
    <>
      <PageHeader title={client.name} sub={<span className="flex items-center gap-2"><ClientSwatch client={client} size={22} />{details || "No industry set"}</span>}>
        <Button asChild variant="ghost"><Link href="/clients">All clients</Link></Button>
        <Button asChild><Link href={`/clients/${id}/edit`}>Edit profile</Link></Button>
        {latest ? <Button asChild><Link href={`/create?from=${latest.id}`}>Start next month</Link></Button> : null}
        <Button asChild variant="primary"><Link href={`/create?client=${id}`}>+ Create monthly report</Link></Button>
      </PageHeader>
      <div className="mb-5 grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-5 max-[980px]:grid-cols-1">
        <Card>
          <CardTitle>Report history</CardTitle>
          <CardDescription>{latest ? <>Latest: {latest.month}. &quot;Start next month&quot; copies its branding, template, pages and action plan, and starts every figure empty.</> : "No reports yet. Create the first monthly report for this client."}</CardDescription>
          {years.map((y) => (
            <div key={y} className="mt-3">
              <h3 className="mb-1 font-heading text-[15px] font-bold text-heading">{y}</h3>
              <ReportsTable reports={history.filter((r) => r.periodStart.startsWith(y))} showClient={false} />
            </div>
          ))}
        </Card>
        <Card>
          <CardTitle>Profile</CardTitle>
          <dl className="mt-2 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[13.5px]">
            {profile.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="m-0 break-words">{v || <span className="text-muted-foreground">—</span>}</dd></div>)}
          </dl>
          {client.notes ? <p className="mt-3 rounded-xl bg-muted p-2.5 text-[13px]"><b>Internal notes.</b> {client.notes}</p> : null}
        </Card>
      </div>
      <Card className="mb-5">
        <CardTitle>Report branding</CardTitle>
        <CardDescription>This client&apos;s logo and colours lead every one of their reports; Get Bee Seen co-brands each page.</CardDescription>
        <BrandForm action={act.saveBrand} clientId={client.id} industry={client.industry} brand={client.brand ?? DEFAULT_BRAND} />
      </Card>
      <Card>
        <CardTitle>Delete client</CardTitle>
        <CardDescription>Removes {client.name} and all {reports.length} of their report{reports.length === 1 ? "" : "s"}, uploads and notes. This cannot be undone.</CardDescription>
        <form onSubmit={fd2(() => { db.deleteClient(client.id); navigate("/clients"); })}>
          <Button type="submit" variant="destructive" size="sm">Delete {client.name}</Button>
        </form>
      </Card>
    </>
  );
}

function ReportsPage() {
  const reports = db.useStore(() => db.listReports()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return (
    <>
      <PageHeader title="Reports" sub="All reports, newest first."><Button asChild variant="primary"><Link href="/create">+ Create new report</Link></Button></PageHeader>
      <Card><ReportsTable reports={reports} /></Card>
    </>
  );
}

function CreateReport({ client, from, duplicate }: { client: string | null; from: string | null; duplicate: string | null }) {
  const clients = db.useStore(() => db.listClients());
  if (!clients.length) return (<><PageHeader title="Create report" /><p className="mb-3 text-muted-foreground">Add a client first, then create their monthly report.</p><Button asChild variant="primary"><Link href="/clients/new">+ Add client</Link></Button></>);
  const sourceId = from || duplicate;
  const source = sourceId ? db.getReportDoc(sourceId) : null;
  const chosen = clients.find((c) => c.id === (source?.client.id ?? client));
  const sections = source?.sections ?? { ...allSections(true), google: false, linkedin: false };
  const template = source?.template ?? chosen?.template ?? db.getDefaultTemplate();
  let initial: ReportFormInitial, title = "Create monthly report";
  if (source && duplicate) {
    const taken = new Set(db.listReports(source.client.id).map((r) => r.id));
    let period = followingMonth(source.data.period.start);
    while (taken.has(reportId(source.client.id, period.start))) period = followingMonth(period.start);
    title = "Duplicate report";
    initial = { clientId: source.client.id, template, sections, data: duplicateData(source, period), copyFrom: { id: source.id, kind: "duplicate" },
      note: `Copied from ${source.client.name}, ${analyze(source.data).month}. Every figure and post below is that month's: replace them with this month's figures, and attach this month's screenshots, before sending. Choose the month with the first and last day.` };
  } else if (source) {
    title = "Start next month";
    initial = { clientId: source.client.id, template, sections, data: nextMonthData(source), copyFrom: { id: source.id, kind: "next-month" },
      note: `Started from ${source.client.name}, ${analyze(source.data).month}. Its figures are filled in as the previous month, and its branding, template, pages and action plan carry over. Check them, then enter this month's figures and screenshots.` };
  } else initial = { clientId: chosen?.id, template, sections };
  return (
    <>
      <PageHeader title={title} sub={chosen ? `${chosen.name}. Enter the month's figures from the platform screenshots and attach the screenshots. The report is written from these figures only.` : "Choose the client, then enter the month's figures from the platform screenshots. The report is written from these figures only."} />
      <ReportForm action={act.saveReport} extractEnabled={aiConfigured()} clients={clients.map((c) => ({ id: c.id, name: c.name, instagram: c.instagram }))} initial={initial} />
    </>
  );
}

function ReportText({ id }: { id: string }) {
  const [notice, setNotice] = useState<string | null>(null);
  const doc = db.useStore(() => db.getReportDoc(id));
  const versions = db.useStore(() => db.listVersions(id));
  if (!doc) return <NotFound />;
  const editBlock = (f: FormData) => {
    const block = String(f.get("block")), op = String(f.get("op"));
    const A = analyze(resolveData(doc).data);
    const current = String(f.get("text") ?? "").trim() || blockText(doc, A, block);
    if (op === "save") db.setBlock(id, block, { text: current.slice(0, 2000) });
    else if (op === "shorten") db.setBlock(id, block, { text: shorten(current) });
    else if (op === "expand") db.setBlock(id, block, { text: expand(block, current, A) });
    else if (op === "next") db.setBlock(id, block, { text: null, variant: ((doc.variant[block] ?? 0) + 1) % variantCount(block, A) });
    else if (op === "reset") db.setBlock(id, block, { text: null, variant: 0 });
  };
  return (
    <TextEditor doc={doc} versions={versions} notice={notice ?? undefined} aiNote="Add your Anthropic API key in Settings to let Claude write the report text."
      actions={{
        writeWithClaude: aiConfigured() ? async () => {
          setNotice("Claude is writing the report text…");
          try {
            const others = db.listClients().filter((c) => c.id !== doc.client.id).flatMap((c) => [c.name, c.company ?? ""]).filter((n) => n && !doc.client.name.toLowerCase().includes(n.toLowerCase()));
            const r = await writeReportText(doc, others);
            const n = Object.keys(r.accepted).length;
            db.saveVersion(id, "Before Claude rewrite");
            for (const [block, text] of Object.entries(r.accepted)) db.setBlock(id, block, { text });
            db.saveVersion(id, "Written by Claude");
            setNotice(`Claude rewrote ${n} block${n === 1 ? "" : "s"}.` + (r.rejected.length ? ` ${r.rejected.length} kept their current text: ${r.rejected.map((x) => `${x.id} (${x.reason})`).join("; ")}.` : " Every figure matched the report data."));
          } catch (e) {
            setNotice(e instanceof AiError ? e.message : "Claude could not be reached. Check your connection and API key, then try again.");
          }
        } : undefined,
        editBlock,
        saveVersion: (f) => db.saveVersion(id, String(f.get("label") ?? "").trim().slice(0, 80) || "Saved by hand"),
        restoreVersion: (f) => db.restoreVersion(id, Number(f.get("v"))),
        resetAll: () => db.resetAllText(id),
      }} />
  );
}

const TEMPLATES: [Template, string, string][] = [
  ["premium", "Premium", "Editorial: the client's colour on the cover, warm paper pages."],
  ["minimal", "Minimal", "White pages with a slim client-colour edge on the cover."],
  ["dark", "Dark", "Dark pages with the client's accent colour for figures."],
];

function TemplatesPage() {
  const def = db.useStore(() => db.getDefaultTemplate());
  const sample = db.useStore(() => db.listReports().find((r) => r.available));
  const doc = sample ? db.getReportDoc(sample.id) : null;
  return (
    <>
      <PageHeader title="Templates" sub="Three looks for every report. The client's colours and logo layer on top. Each report can use a different one; this sets the default for new reports." />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
        {TEMPLATES.map(([id, name, desc]) => (
          <section key={id} className={`rounded-[20px] border-2 bg-card p-3.5 ${def === id ? "border-gbs-green" : "border-border"}`}>
            {doc ? <div className="grid gap-2 overflow-hidden"><ReportCover doc={{ ...doc, template: id }} scale={0.27} /><ReportThumb doc={{ ...doc, template: id }} scale={0.27} index={1} /></div> : null}
            <div className="mt-3 flex items-start justify-between gap-2">
              <div><h2 className="font-heading text-[17px] font-bold text-heading">{name}</h2><p className="text-[13px] text-muted-foreground">{desc}</p></div>
              {def === id ? <Badge variant="ok">Default</Badge> : <Button size="sm" onClick={() => db.setDefaultTemplate(id)}>Make default</Button>}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function BrandPage() {
  const clients = db.useStore(() => db.listClients());
  return (
    <>
      <PageHeader title="Brand assets" sub="Each client's logo and report colours. Open a client to upload a logo or change colours." />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
        {clients.map((c) => {
          const b = c.brand ?? DEFAULT_BRAND;
          return (
            <section key={c.id} className="rounded-[20px] border border-border bg-card p-3.5">
              <div className="grid h-24 place-items-center overflow-hidden rounded-2xl p-3" style={{ background: b.primary }}>
                {b.logo ? <img src={b.logo} alt={`${c.name} logo`} className="max-h-full max-w-full rounded bg-white p-2" /> : <span className="font-heading text-sm font-bold" style={{ color: b.accent }}>{c.name}</span>}
              </div>
              <h2 className="mt-2.5 font-semibold">{c.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><i className="inline-block size-3 rounded-full" style={{ background: b.primary }} />{b.primary.toUpperCase()}</span>
                <span className="flex items-center gap-1"><i className="inline-block size-3 rounded-full" style={{ background: b.accent }} />{b.accent.toUpperCase()}</span>
                {!c.brand ? <Badge variant="warn">Placeholder colours</Badge> : null}
              </div>
              <Button asChild size="sm" className="mt-3"><Link href={`/clients/${c.id}`}>Edit branding</Link></Button>
            </section>
          );
        })}
      </div>
    </>
  );
}

function SettingsPage() {
  const def = db.useStore(() => db.getDefaultTemplate());
  return (
    <>
      <PageHeader title="Settings" sub="Defaults, Claude, and backups of your reports." />
      <div className="grid grid-cols-2 items-start gap-5 max-[860px]:grid-cols-1">
        <Card>
          <CardTitle>Default template</CardTitle>
          <CardDescription>Used for new reports. Each report can still choose its own.</CardDescription>
          <select value={def} onChange={(e) => db.setDefaultTemplate(e.target.value as Template)} aria-label="Default template" className="h-9 rounded-xl border border-input bg-card px-2.5 text-sm text-foreground">
            <option value="premium">Premium</option><option value="minimal">Minimal</option><option value="dark">Dark</option>
          </select>
        </Card>
        <ClaudeKeyCard />
        <BackupCard />
      </div>
    </>
  );
}

function ClaudeKeyCard() {
  const [key, setKey] = useState(getApiKey());
  const [saved, setSaved] = useState(aiConfigured());
  return (
    <Card>
      <CardTitle>Claude (reading screenshots, writing text)</CardTitle>
      <CardDescription>Paste an Anthropic API key from console.anthropic.com. It is saved in this browser only and sent only to Anthropic. Usage is billed to that key.</CardDescription>
      <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); setApiKey(key); setSaved(aiConfigured()); }}>
        <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" aria-label="Anthropic API key" className="h-9 rounded-xl border border-input bg-card px-2.5 text-sm text-foreground" />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" size="sm">Save key</Button>
          {key ? <Button type="button" size="sm" variant="ghost" onClick={() => { setKey(""); setApiKey(""); setSaved(false); }}>Remove key</Button> : null}
          <span className={`text-xs ${saved ? "text-ok" : "text-muted-foreground"}`}>{saved ? "Claude is on." : "Claude is off. Figures can still be typed by hand."}</span>
        </div>
      </form>
    </Card>
  );
}

function BackupCard() {
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const counts = db.useStore((s) => `${s.clients.length} client${s.clients.length === 1 ? "" : "s"}, ${s.reports.length} report${s.reports.length === 1 ? "" : "s"}`);
  return (
    <Card>
      <CardTitle>Backup</CardTitle>
      <CardDescription>Your clients, reports, logos and screenshots are saved in this browser on this computer ({counts}). Download a backup regularly, and use it to move everything to another computer or browser.</CardDescription>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => { saveFile(db.exportBackup(), `GBS_Report_Studio_backup_${new Date().toISOString().slice(0, 10)}.json`); setMsg({ text: "Backup downloaded." }); }}>Download backup</Button>
        <label className="inline-flex h-7 cursor-pointer items-center rounded-full border border-border bg-card px-3 text-xs font-semibold hover:border-gbs-green">
          Restore from backup…
          <input type="file" accept="application/json,.json" className="sr-only" onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (!f || !window.confirm("Restoring replaces every client and report in this browser with the backup's. Continue?")) return;
            const err = await db.importBackup(f);
            setMsg(err ? { text: err, bad: true } : { text: "Backup restored." });
          }} />
        </label>
        {msg ? <span role="status" className={`text-xs ${msg.bad ? "text-bad" : "text-ok"}`}>{msg.text}</span> : null}
      </div>
    </Card>
  );
}

function EditReport({ id }: { id: string }) {
  const doc = db.getReportDoc(id);
  const clients = db.listClients();
  if (!doc) return <NotFound />;
  return (
    <>
      <PageHeader title={`Edit data: ${doc.client.name}, ${analyze(doc.data).month}`} sub="Saving rebuilds the report from these figures. Internal notes and your choice on data conflicts are kept." />
      <ReportForm action={act.saveReport} extractEnabled={aiConfigured()} clients={clients.map((c) => ({ id: c.id, name: c.name, instagram: c.instagram }))} initial={{ id: doc.id, clientId: doc.client.id, template: doc.template, sections: doc.sections, data: doc.data, uploads: doc.uploads }} />
    </>
  );
}

function Viewer({ id, duplicates }: { id: string; duplicates: number }) {
  const doc = db.useStore(() => db.getReportDoc(id));
  if (!doc) return <NotFound />;
  return (
    <ReportReview key={id} doc={doc} duplicates={duplicates} actions={{
      changeStatus: (f) => db.setReportStatus(String(f.get("reportId")), String(f.get("status")) as never),
      chooseResolution: (f) => { const c = f.get("choice"); db.setResolution(String(f.get("reportId")), String(f.get("metric")), c === "reported" || c === "calculated" ? c : null); },
      addNote: (f) => { const t = String(f.get("text") ?? "").trim().slice(0, 2000); if (t) db.addInternalNote(String(f.get("reportId")), t); },
    }} />
  );
}

function PrintView({ id, autoSave }: { id: string; autoSave: boolean }) {
  const doc = db.getReportDoc(id);
  const name = doc ? pdfFileName(doc.client.name, doc.data.period.start) : "";
  const pagesRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<{ busy?: boolean; text?: string; bad?: boolean }>({});
  const started = useRef(false);
  async function make() {
    if (!pagesRef.current || status.busy) return;
    setStatus({ busy: true, text: "Preparing the PDF…" });
    try {
      const pdf = await buildReportPdf(pagesRef.current, name.replace(/\.pdf$/, ""), (done, total) =>
        setStatus({ busy: true, text: done < total ? `Making the PDF: page ${done + 1} of ${total}…` : "Saving…" }));
      saveFile(pdf, name);
      setStatus({ text: `Downloaded ${name} (${(pdf.size / 1048576).toFixed(1)} MB).` });
    } catch (e) {
      setStatus({ bad: true, text: `The PDF could not be made: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  useEffect(() => {
    if (autoSave && doc && !started.current) { started.current = true; void make(); }
  });
  if (!doc) return <NotFound />;
  return (
    <div className="min-h-screen bg-[#6b6558] py-6">
      <div className="sticky top-0 z-10 mx-auto mb-4 flex max-w-[1122px] flex-wrap items-center justify-between gap-2 px-4">
        <Button asChild variant="ghost" className="bg-card"><Link href={`/reports/${id}`}>← Back to the report</Link></Button>
        <span className="flex flex-wrap items-center gap-2">
          {status.text ? <span role="status" className={`rounded-full px-3 py-1.5 text-xs ${status.bad ? "bg-bad text-white" : "bg-gbs-ink text-gbs-cream"}`}>{status.text}</span> : null}
          <Button variant="primary" disabled={status.busy} onClick={() => void make()}>{status.busy ? "Making PDF…" : "Download PDF"}</Button>
        </span>
      </div>
      <div ref={pagesRef} className="overflow-x-auto px-4"><ReportPages doc={doc} mode="print" scale={1} /></div>
    </div>
  );
}

const NotFound = () => (<><PageHeader title="Not found" sub="That page does not exist or was deleted." /><Button asChild><Link href="/">Back to the dashboard</Link></Button></>);

function Login() {
  return (
    <main className="bg-hex hex-drift grid min-h-screen place-items-center p-7">
      <div className="page-enter grid w-full max-w-[420px] justify-items-center gap-[22px]">
        <img src="brand/logo-stacked-white.png" alt="Get Bee Seen" className="w-[170px]" />
        <SignInForm next="/" open action={act.signIn} />
        <p className="text-center text-xs text-gbs-cream/80">{GBS_TAGLINE}<br />Internal GBS tool. Reports are saved in this browser on this computer.</p>
      </div>
    </main>
  );
}

export function App() {
  const path = usePath();
  const signedIn = db.useStore((s) => !!s.session);
  if (!signedIn) return <Login />;
  let m: Record<string, string> | null;
  if ((m = match("/print/reports/:id", path))) return <PrintView key={path} id={m.id} autoSave={query(path).get("save") === "1"} />;
  let page: React.ReactNode;
  if (path.split("?")[0] === "/" || path === "/login") page = <Dashboard />;
  else if (match("/clients", path)) page = <Clients />;
  else if (match("/clients/new", path)) page = <><PageHeader title="Add client" sub="The profile, logo and colours are used on every report for this client." /><ClientForm action={act.saveClient} /></>;
  else if ((m = match("/clients/:id/edit", path))) { const c = db.getClient(m.id); page = c ? <><PageHeader title={`Edit ${c.name}`} /><ClientForm client={c} action={act.saveClient} /></> : <NotFound />; }
  else if ((m = match("/clients/:id", path))) page = <ClientPage id={m.id} />;
  else if (match("/reports", path)) page = <ReportsPage />;
  else if ((m = match("/reports/:id/edit", path))) page = <EditReport key={m.id} id={m.id} />;
  else if ((m = match("/reports/:id", path))) page = <Viewer id={m.id} duplicates={Number(query(path).get("duplicates")) || 0} />;
  else if (match("/create", path)) page = <CreateReport key={path} client={query(path).get("client")} from={query(path).get("from")} duplicate={query(path).get("duplicate")} />;
  else if ((m = match("/reports/:id/text", path))) page = <ReportText key={m.id} id={m.id} />;
  else if (match("/templates", path)) page = <TemplatesPage />;
  else if (match("/brand", path)) page = <BrandPage />;
  else if (match("/analytics", path)) page = <ComingInStep title="Analytics" step={4}>Portfolio view across clients, built from confirmed figures only.</ComingInStep>;
  else if (match("/settings", path)) page = <SettingsPage />;
  else page = <NotFound />;
  return <Shell path={path}>{page}</Shell>;
}
