import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { GBS_CONTACT, hasBrandedProposals, rupee, totals, type ProposalDoc } from "@/lib/gbs-proposal";
import { PrintBar } from "./print-bar";

/**
 * The proposal in the Get Bee Seen format, laid out as A4 pages: cover, growth opportunity, one page
 * per phase, scope, investment, commitment and closing. "Download PDF" prints it to PDF (pages,
 * colours and fonts are set for print).
 */

const GREEN = "#196144", GOLD = "#FFB933", CREAM = "#FFF2DC", INK = "#262626", GRAY = "#8A8A8A", PEACH = "#FDE6B5";
const HEAD = "'Baloo 2', var(--font-figtree), sans-serif";
const BODY = "Poppins, var(--font-figtree), sans-serif";

const hex = (stroke: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='42' height='72.75' viewBox='0 0 42 72.75'><path d='M21 0l21 12.12v24.25L21 48.5 0 36.37V12.12zM21 48.5v24.25M0 12.12L-21 0M42 12.12L63 0' fill='none' stroke='${stroke}' stroke-width='1.1'/></svg>`)}")`;

const ICONS: Record<string, string> = {
  people: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3",
  phone: "M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2Z",
  chat: "M4 5h16v11H9l-5 4V5ZM8 9h8M8 12h5",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 12h0",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3ZM9 12l2 2 4-4",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  building: "M4 21V4h10v17M14 9h6v12M7 8h4M7 12h4M7 16h4M2 21h20",
  pin: "M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12ZM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  layers: "M12 3 2 8l10 5 10-5-10-5ZM2 13l10 5 10-5M2 17.5 12 22l10-4.5",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  check: "M5 12l5 5 9-10",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v6M12 7.5v.5",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
};
function Icon({ name, size, color }: { name: string; size: number; color: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICONS[name] ?? ICONS.target} /></svg>;
}
const Circle = ({ name, bg = GOLD, fg = GREEN, size = 34 }: { name: string; bg?: string; fg?: string; size?: number }) => (
  <span style={{ width: size, height: size, borderRadius: "50%", background: bg, display: "inline-grid", placeItems: "center", flexShrink: 0 }}><Icon name={name} size={size * 0.52} color={fg} /></span>
);

function Inner({ no, name, subtitle, children }: { no: number; name: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="gbs-page" style={{ background: "#fff", padding: "14mm 16mm 18mm" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #E7E2D6", paddingBottom: "3mm", marginBottom: "7mm" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/gbs/badge_circle.png" alt="" width={30} height={30} />
          <b style={{ fontFamily: BODY, fontSize: 12, color: INK, textTransform: "uppercase", letterSpacing: ".02em" }}>{name}</b>
        </span>
        <span style={{ fontFamily: BODY, fontSize: 10.5, color: GRAY }}>{subtitle}</span>
      </header>
      {children}
      <footer style={{ position: "absolute", left: "16mm", right: "16mm", bottom: "8mm", display: "flex", justifyContent: "space-between", fontFamily: BODY, fontSize: 9.5, color: GRAY }}>
        <span>Confidential · Get Bee Seen</span><b style={{ color: INK }}>{no}</b>
      </footer>
    </section>
  );
}
const pad = (x: number) => String(x).padStart(2, "0");
const Banner = ({ no, title }: { no: number; title: string }) => (
  <div style={{ background: `${hex("rgba(255,185,51,.28)")} right / 34px auto, ${GREEN}`, borderRadius: 14, padding: "3.2mm 4mm", display: "flex", alignItems: "center", gap: 12, marginBottom: "8mm" }}>
    <span style={{ width: 30, height: 30, borderRadius: "50%", background: GOLD, color: GREEN, display: "grid", placeItems: "center", fontFamily: HEAD, fontWeight: 800, fontSize: 13 }}>{pad(no)}</span>
    <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15, color: "#fff" }}>{title}</span>
  </div>
);
const Eyebrow = ({ children }: { children: ReactNode }) => <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 9.5, color: "#E9A21C", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: "2mm" }}>{children}</div>;
const H1 = ({ children }: { children: ReactNode }) => <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 25, lineHeight: 1.15, color: GREEN, margin: "0 0 3mm" }}>{children}</h2>;
const Body = ({ children }: { children: ReactNode }) => <p style={{ fontFamily: BODY, fontSize: 11.5, lineHeight: 1.6, color: INK, margin: "0 0 2mm" }}>{children}</p>;
const Gap = ({ mm = 7 }: { mm?: number }) => <div style={{ height: `${mm}mm` }} />;
const Callout = ({ text, glyph, dark }: { text: string; glyph: string; dark?: boolean }) => (
  <div style={{ display: "flex", gap: 14, alignItems: "center", background: dark ? GREEN : PEACH, borderLeft: `5px solid ${GOLD}`, borderRadius: 6, padding: "5mm 6mm" }}>
    <Circle name={glyph} bg={dark ? GOLD : GREEN} fg={dark ? GREEN : "#fff"} size={30} />
    <span style={{ fontFamily: BODY, fontSize: 11.5, lineHeight: 1.55, color: dark ? "#fff" : INK, fontWeight: dark ? 600 : 500 }}>{text}</span>
  </div>
);
const Cards = ({ cards }: { cards: ProposalDoc["why_us"] }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "5mm" }}>
    {cards.map((c) => (
      <div key={c.title} style={{ padding: "2mm 1mm" }}>
        <Circle name={c.glyph} />
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 12, color: INK, margin: "3mm 0 1.5mm" }}>{c.title}</div>
        <div style={{ fontFamily: BODY, fontSize: 10.5, lineHeight: 1.55, color: GRAY }}>{c.body}</div>
      </div>
    ))}
  </div>
);
const Stages = ({ items, highlight }: { items: { title: string; subtitle: string }[]; highlight?: boolean }) => (
  <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length},1fr)`, gap: "2.5mm" }}>
    {items.map((s, i) => {
      const gold = highlight && i % 2 === 1;
      return (
        <div key={s.title} style={{ background: gold ? GOLD : GREEN, borderRadius: 8, padding: "4mm 3.5mm", minHeight: highlight ? "20mm" : "30mm" }}>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 18, color: gold ? GREEN : GOLD }}>{String(i + 1).padStart(2, "0")}</div>
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 10.5, color: gold ? GREEN : "#fff", marginTop: "2mm" }}>{s.title}</div>
          {s.subtitle && <div style={{ fontFamily: BODY, fontSize: 9.5, color: gold ? GREEN : "rgba(255,255,255,.8)", marginTop: "1.5mm", lineHeight: 1.45 }}>{s.subtitle}</div>}
        </div>
      );
    })}
  </div>
);
const BarList = ({ items }: { items: string[] }) => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3mm" }}>
    {items.map((it) => {
      const [head, ...rest] = it.split(":");
      return (
        <div key={it} style={{ borderLeft: `4px solid ${GOLD}`, background: "#FBF8F1", borderRadius: 4, padding: "3mm 4mm", fontFamily: BODY, fontSize: 10.5, lineHeight: 1.5, color: INK }}>
          {rest.length ? <><b>{head}</b>{" "}<span style={{ color: "#555" }}>{rest.join(":").trim()}</span></> : it}
        </div>
      );
    })}
  </div>
);
const cell = { padding: "3mm 3.5mm", borderBottom: "1px solid #EFE7D6", fontFamily: BODY, fontSize: 10.5, color: INK, textAlign: "left" as const, verticalAlign: "top" as const };
const Summary = ({ title, rows, total, gold }: { title: string; rows: [string, string][]; total: string; gold?: boolean }) => (
  <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #EFE7D6" }}>
    <thead><tr><th colSpan={2} style={{ ...cell, background: gold ? GOLD : GREEN, color: gold ? GREEN : "#fff", fontWeight: 700 }}>{title}</th></tr></thead>
    <tbody>
      {rows.map(([a, b]) => <tr key={a}><td style={cell}>{a}</td><td style={{ ...cell, whiteSpace: "nowrap" }}>{b}</td></tr>)}
      <tr><td style={{ ...cell, background: CREAM, fontWeight: 700 }}>Total</td><td style={{ ...cell, background: CREAM, fontWeight: 700, whiteSpace: "nowrap" }}>{total}</td></tr>
    </tbody>
  </table>
);


export async function generateMetadata({ params }: PageProps<"/proposal-doc/[slug]/[id]">): Promise<Metadata> {
  const { slug, id } = await params;
  const ctx = await getCompanyContext(slug);
  const { data } = await ctx.supabase.from("proposals").select("client_name").eq("id", id).eq("organization_id", ctx.company.id).maybeSingle();
  return { title: { absolute: `GBS_Proposal_${(data?.client_name ?? "Client").replace(/[^A-Za-z0-9]+/g, "_")}` } };
}

export default async function ProposalDocument({ params }: PageProps<"/proposal-doc/[slug]/[id]">) {
  const { slug, id } = await params;
  const ctx = await getCompanyContext(slug);
  if (!hasBrandedProposals(slug) || (!ctx.can("crm.write") && !ctx.can("crm.read_all"))) notFound();
  const { data: p } = await ctx.supabase.from("proposals").select("client_name, doc, created_at").eq("id", id).eq("organization_id", ctx.company.id).maybeSingle();
  if (!p?.doc) notFound();
  const doc = p.doc as ProposalDoc;
  const name = p.client_name as string;
  const year = String(p.created_at).slice(0, 4);
  const t = totals(doc.pricing.rows);
  const P = doc.phases.length;

  const once = doc.pricing.rows.filter((r) => r.billing === "One-Time");
  const monthly = doc.pricing.rows.filter((r) => r.billing === "Monthly");

  return (
    <div className="gbs-doc" style={{ background: "#E9E6DF", minHeight: "100vh", padding: "16px 0 40px" }}>
      <style>{`
        .gbs-page { position: relative; width: 210mm; min-height: 297mm; margin: 0 auto 16px; box-shadow: 0 6px 24px rgba(0,0,0,.12); box-sizing: border-box; break-after: page; overflow: hidden; }
        .gbs-wrap { overflow-x: auto; }
        .gbs-page:last-child { break-after: auto; }
        @page { size: A4; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .gbs-doc { background: #fff !important; padding: 0 !important; }
          .gbs-page { margin: 0; box-shadow: none; height: 297mm; min-height: 0; }
          .gbs-noprint { display: none !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <PrintBar back={`/c/${slug}/proposals/${id}`} />
      <div className="gbs-wrap">
        {/* Cover */}
        <section className="gbs-page" style={{ background: CREAM, display: "flex", flexDirection: "column" }}>
          <div style={{ background: `${hex("rgba(255,185,51,.22)")} 0 0 / 46px auto, ${GREEN}`, height: "118mm", padding: "14mm 16mm", position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: BODY, fontWeight: 700, fontSize: 11, color: "#fff", letterSpacing: ".04em" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: GOLD }} />GET BEE SEEN</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/gbs/badge_circle.png" alt="Get Bee Seen" width={120} height={118} style={{ position: "absolute", right: "14mm", top: "10mm" }} />
            <div style={{ display: "inline-block", marginTop: "16mm", background: GOLD, color: GREEN, fontFamily: BODY, fontWeight: 700, fontSize: 10.5, borderRadius: 999, padding: "2.4mm 6mm", letterSpacing: ".03em" }}>GROWTH PROPOSAL · {year}</div>
            <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 36, lineHeight: 1.05, color: "#fff", marginTop: "9mm" }}>Proposal for</div>
            <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: name.length > 26 ? 30 : 38, lineHeight: 1.05, color: GOLD }}>{name}</div>
            <div style={{ display: "flex", gap: 10, marginTop: "5mm" }}>{[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: GOLD }} />)}</div>
          </div>
          <div style={{ background: GOLD, padding: "3.4mm 16mm", fontFamily: BODY, fontWeight: 700, fontSize: 10, color: GREEN, letterSpacing: ".03em", display: "flex", gap: "7mm", flexWrap: "wrap", borderBottomLeftRadius: 22 }}>
            {doc.tags.map((t) => <span key={t}>{t}</span>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10mm", padding: "16mm 16mm 0", flex: 1 }}>
            <div>
              <Eyebrow>● Prepared for</Eyebrow>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 18, color: GREEN }}>{name}</div>
              {doc.prepared_for.map((l) => <div key={l} style={{ fontFamily: BODY, fontSize: 10.5, color: INK, lineHeight: 1.6 }}>{l}</div>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "10px 1fr", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingTop: 30 }}>{[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: GOLD }} />)}</div>
              <div>
                <Eyebrow>● Prepared by</Eyebrow>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 18, color: GREEN }}>Get Bee Seen</div>
                {["Creative · Marketing · Growth", GBS_CONTACT.email, GBS_CONTACT.phone, GBS_CONTACT.web].map((l) => <div key={l} style={{ fontFamily: BODY, fontSize: 10.5, color: INK, lineHeight: 1.6 }}>{l}</div>)}
              </div>
            </div>
          </div>
          <div style={{ background: "#191816", color: "rgba(255,255,255,.75)", fontFamily: BODY, fontSize: 9, padding: "4mm 16mm" }}>Confidential · {year} · {GBS_CONTACT.address}</div>
        </section>

        {/* 01 Growth opportunity */}
        <Inner no={1} name={name} subtitle={doc.subtitle}>
          <Banner no={1} title="The Growth Opportunity" />
          <Eyebrow>The growth opportunity</Eyebrow>
          <H1>{doc.opportunity.headline}</H1>
          <Body>{doc.opportunity.intro}</Body>
          <Gap mm={6} />
          <Cards cards={doc.opportunity.cards} />
          <Gap />
          <Callout text={doc.opportunity.callout} glyph="target" />
          <Gap />
          <Eyebrow>Our approach</Eyebrow>
          <Gap mm={2} />
          <Stages items={doc.opportunity.approach} />
        </Inner>

        {/* One page per phase */}
        {doc.phases.map((ph, i) => (
          <Inner key={ph.title + i} no={2 + i} name={name} subtitle={doc.subtitle}>
            <Banner no={2 + i} title={ph.title} />
            <Eyebrow>{ph.eyebrow}</Eyebrow>
            <H1>{ph.headline}</H1>
            <Body>{ph.body}</Body>
            <Gap mm={5} />
            <Eyebrow>What we will work on</Eyebrow>
            <div style={{ display: "grid", gridTemplateColumns: ph.groups.length > 1 ? "1fr 1fr" : "1fr", gap: "4mm 8mm", marginTop: "2mm" }}>
              {ph.groups.map((g) => (
                <div key={g.label}>
                  <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 14, color: GREEN, marginBottom: "1.5mm" }}>{g.label}</div>
                  {g.items.map((it) => <div key={it} style={{ display: "flex", gap: 8, fontFamily: BODY, fontSize: 10.5, color: INK, lineHeight: 1.7 }}><span style={{ color: GOLD }}>●</span>{it}</div>)}
                </div>
              ))}
            </div>
            <Gap />
            <Callout text={ph.outcome} glyph="flag" />
          </Inner>
        ))}

        {/* Scope */}
        <Inner no={2 + P} name={name} subtitle={doc.subtitle}>
          <Banner no={2 + P} title="Scope of Work" />
          <Eyebrow>Everything included</Eyebrow>
          <H1>What We Will Deliver</H1>
          <Gap mm={3} />
          <BarList items={doc.scope.items} />
          <Gap />
          <Eyebrow>How we keep lead quality high</Eyebrow>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: "2mm" }}>
            {doc.scope.chain.map((c, i) => (
              <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ background: GREEN, color: "#fff", borderRadius: 999, padding: "2.4mm 5mm", fontFamily: BODY, fontWeight: 600, fontSize: 10 }}>{c}</span>
                {i < doc.scope.chain.length - 1 && <span style={{ color: GOLD, fontWeight: 800 }}>→</span>}
              </span>
            ))}
          </div>
        </Inner>

        {/* Investment */}
        <Inner no={3 + P} name={name} subtitle={doc.subtitle}>
          <Banner no={3 + P} title="Investment" />
          <H1>Commercials &amp; Pricing</H1>
          <Body>{doc.pricing.intro}</Body>
          <Gap mm={5} />
          <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #EFE7D6" }}>
            <thead><tr>{["Service", "Scope", "Investment", "Billing"].map((h) => <th key={h} style={{ ...cell, background: GREEN, color: "#fff", fontWeight: 600 }}>{h}</th>)}</tr></thead>
            <tbody>{doc.pricing.rows.map((r, i) => (
              <tr key={r.service + i} style={{ background: i % 2 ? CREAM : "#fff" }}><td style={cell}>{r.service}</td><td style={cell}>{r.scope}</td><td style={{ ...cell, whiteSpace: "nowrap" }}>{rupee(r.amount)}</td><td style={cell}>{r.billing}</td></tr>
            ))}</tbody>
          </table>
          <Gap />
          <div style={{ display: "grid", gridTemplateColumns: once.length && monthly.length ? "1fr 1fr" : "1fr", gap: "6mm", alignItems: "start" }}>
            {once.length > 0 && <Summary title="One-Time Investment" rows={once.map((r) => [r.service, rupee(r.amount)])} total={rupee(t.once)} />}
            {monthly.length > 0 && <Summary title="Monthly Retainer" gold rows={monthly.map((r) => [r.service, rupee(r.amount)])} total={`${rupee(t.monthly)}/mo`} />}
          </div>
          <Gap mm={3} />
          <div style={{ fontFamily: BODY, fontSize: 9.5, color: GRAY }}>All amounts in Indian Rupees, before GST.</div>
          <Gap />
          <Eyebrow>Commercial terms</Eyebrow>
          <BarList items={doc.terms} />
        </Inner>

        {/* Commitment and why us */}
        <Inner no={4 + P} name={name} subtitle={doc.subtitle}>
          <Eyebrow>Our commitment</Eyebrow>
          <H1>We Believe In Taking Ownership</H1>
          <Gap mm={3} />
          <Callout text={doc.commitment} glyph="shield" dark />
          <Gap mm={10} />
          <Eyebrow>Why Get Bee Seen</Eyebrow>
          <H1>One Team For Growth</H1>
          <Gap mm={3} />
          <Cards cards={doc.why_us} />
        </Inner>

        {/* Closing */}
        <Inner no={5 + P} name={name} subtitle={doc.subtitle}>
          <Eyebrow>Closing note</Eyebrow>
          <H1>{doc.closing.headline}</H1>
          <Body>{doc.closing.body}</Body>
          <Gap mm={5} />
          <div style={{ display: "flex", flexDirection: "column", gap: "3mm" }}>
            {doc.closing.checklist.map((c) => <div key={c} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: BODY, fontSize: 11.5, color: INK }}><Circle name="check" bg={GREEN} fg="#fff" size={22} />{c}</div>)}
          </div>
          <Gap />
          <Stages highlight items={doc.opportunity.approach.map((s) => ({ title: s.title, subtitle: "" }))} />
          <Gap />
          <div style={{ background: GREEN, borderRadius: 12, padding: "7mm 8mm", display: "grid", gridTemplateColumns: "1fr auto", gap: "6mm", alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: BODY, fontSize: 11.5, color: "rgba(255,255,255,.9)", lineHeight: 1.6 }}>We look forward to partnering with {name}.</div>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 20, color: GOLD, marginTop: "3mm" }}>{GBS_CONTACT.signer}</div>
              <div style={{ fontFamily: BODY, fontSize: 10, color: "#fff" }}>Get Bee Seen</div>
              <div style={{ fontFamily: BODY, fontSize: 9.5, color: "rgba(255,255,255,.75)", marginTop: "2mm" }}>{GBS_CONTACT.email} · {GBS_CONTACT.phone} · {GBS_CONTACT.web}</div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/gbs/badge_circle.png" alt="" width={90} height={88} />
          </div>
        </Inner>
      </div>
    </div>
  );
}
