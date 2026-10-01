// One client report as a list of A4-landscape pages. Ported from the
// prototype's buildPages(): same page order, same markup, same rules for
// skipping empty modules. Text comes from the copy generators unless a
// reviewer edited it. Nothing here reads internal notes or admin warnings.
import type { CSSProperties, ReactNode } from "react";
import { analyze, delta, engagementRate, hasPrevious, type Analysis } from "@/lib/analysis";
import { CONF, NA, cdesc, gen } from "@/lib/copy/generators";
import { INR, K, MONTHS, PCT, daysInMonth, f0, f1, f2, fDay, fLong, parseDay, sgn } from "@/lib/format";
import { clientReady } from "@/lib/report/conflicts";
import { PLATFORM_LABELS, type ContentItem, type Platform, type ReportDoc, type SourceShot } from "@/lib/report/types";
import { BarsV, Donut, HBars } from "./charts";
import { Caption, ContentMatrix, type MatrixRow } from "./interactive";
import { ClientWord, CoverArt, GbsMark } from "./marks";
import "./report.css";

export interface PageDef {
  key: string;
  title: string;
  body: ReactNode;
  /** Full-bleed page with no header or footer (cover, thank you). */
  bare?: boolean;
  /** Platform whose source screenshots back this page. */
  src?: Platform;
}

type Mock = "ig" | "ig2" | "meta";
type Shot = (SourceShot & { mock?: undefined }) | { mock: Mock; name?: undefined; url?: undefined };

const css = (s: Record<string, string | number>) => s as CSSProperties;

export function reportTitle(doc: ReportDoc) {
  return `${doc.client.name} – Monthly Performance Report – ${analyze(doc.data).month} – Get Bee Seen`;
}

/** Text for a copy block: the reviewer's edit if any, else the generated variant. */
export function blockText(doc: ReportDoc, A: Analysis, id: string) {
  return doc.texts[id] ?? gen(id, A, doc.variant[id] || 0);
}

/** Confidence of a block, for the admin panel only. */
export const blockConfidence = (id: string) => CONF[id.split(".")[0]] ?? "low";

export function actionRows(doc: ReportDoc, A: Analysis): string[][] {
  if (doc.rows) return doc.rows;
  const r: string[][] = [];
  if (A.lead) r.push([`Create 6 ${A.lead.name} built on the structure of the top ${A.topViews ? A.topViews.type : "piece"}`, A.ratio && A.other ? `${A.lead.name} averaged ${f1(A.ratio)}× the views of ${A.other.name}` : "Strongest discovery format", "High", "GBS", "Next month"]);
  if (A.vpf) r.push(["Test 3 follow or enquiry call-to-action variations", `About 1 follower per ${f0(A.vpf)} views`, "High", "GBS", "Weeks 1 to 2"]);
  if (A.hasMeta) r.push(["Test 2 to 3 new creative angles on the messaging campaign", `Baseline cost per conversation: ${INR(A.cpr)}`, "Medium", "GBS", "Next month"]);
  r.push(["Share which conversations became qualified enquiries", "Sales attribution not available in current reporting data", "High", "Client", "By the 7th"]);
  r.push(["Publish 2 carousels", A.counts.car ? "Compare with posts" : "No carousels this month: insufficient data", "Medium", "GBS", "Next month"]);
  if (!hasPrevious(doc.data)) r.push(["Provide last month’s Insights and Ads screenshots", "Unlocks month-over-month comparison", "Low", "Client", "With next upload"]);
  return r;
}

function focusItems(A: Analysis): [string, string][] {
  return [
    ["Scale what reached new people", A.lead ? `Make ${A.lead.name} the backbone of the content calendar.` : "Double down on the best-reaching format."],
    ["Turn viewers into followers", A.vpf ? `Raise on-screen and caption prompts. Baseline: 1 follower per ${f0(A.vpf)} views.` : "Add follow prompts to high-reach content."],
    ["Measure enquiry quality", "Agree how qualified enquiries, bookings and sales get reported back."],
    ["Test new formats", "Carousels and call-to-action variants, with results compared fairly."],
  ];
}

/**
 * Screenshots for the source pages. Placeholder renders of the figures are
 * used only for the demo fixture; a real report without uploads gets no page.
 */
function shotsFor(doc: ReportDoc, p: Platform): Shot[] {
  const up = (doc.uploads[p] || []).filter((f) => f.url);
  if (up.length) return up;
  if (!doc.isDemo) return [];
  return p === "instagram" ? [{ mock: "ig" }, { mock: "ig2" }] : p === "meta" ? [{ mock: "meta" }] : [];
}

export function buildPages(doc: ReportDoc, A: Analysis = analyze(doc.data)): PageDef[] {
  const d = doc.data, sec = doc.sections, ig = d.ig, m = d.meta, brand = doc.brand, P: PageDef[] = [];
  const add = (key: string, title: string, body: ReactNode, extra: Partial<PageDef> = {}) => P.push({ key, title, body, ...extra });
  const per = `${fLong(d.period.start)} – ${fLong(d.period.end)}`;
  const T = (id: string) => blockText(doc, A, id);
  const idx = (x: ContentItem) => d.content.indexOf(x);
  const motif = doc.isDemo ? "door" : "plain";
  const art = (x: ContentItem) => <CoverArt item={x} index={idx(x)} brand={brand} motif={motif} />;

  const Ai = ({ id, lab }: { id: string; lab?: string }) => (
    <div className="ai" data-id={id}>
      {lab ? <div className="lab">{lab}</div> : null}
      <p className="aitext" data-id={id}>{T(id)}</p>
    </div>
  );
  const Ttl = ({ k, def, sub }: { k: string; def: string; sub?: string }) => (
    <h2 className="ttl">
      <span data-title={k}>{doc.titles[k] ?? def}</span>
      {sub ? <small>{sub}</small> : null}
    </h2>
  );
  const Kpi = ({ v, l, e, cls = "", dl }: { v: string; l: string; e: string; cls?: string; dl?: ReturnType<typeof delta> }) => (
    <div className={`k ${cls}`}>
      <b>{v}</b>
      <span>{l}{dl ? <i className={`delta ${dl.good}`}>{dl.txt}</i> : null}</span>
      <em>{e}</em>
    </div>
  );
  const growthLabel = (g: number) => (g > 0 ? "+" : "") + PCT(g);

  // Cover
  add("cover", "Cover", (
    <div className="cover">
      <div className="l">
        <div>
          {brand.logo ? (
            // The palette comes from the logo, so it sits on a light plate to stay visible on the cover colour.
            <span style={{ display: "inline-block", background: "#fff", padding: "10px 14px", borderRadius: 4 }}>
              <ClientWord name={doc.client.name} brand={brand} size={34} />
            </span>
          ) : (
            <ClientWord name={doc.client.name} brand={brand} size={34} />
          )}
        </div>
        <div>
          <div className="kick">Monthly performance report</div>
          <h1 data-title="cover">{doc.titles.cover || A.month}</h1>
          <div className="kick" style={{ margin: "18px 0 0", opacity: 0.7 }}>{per}</div>
        </div>
        <div className="prep">
          <GbsMark brand={brand} size={36} />
          <div><span>Prepared by</span><b>GET BEE SEEN</b></div>
        </div>
      </div>
      <div className="r">
        {brand.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="bg" src={brand.cover} alt="" />
        ) : doc.isDemo ? (
          <svg viewBox="0 0 300 420" fill="none" stroke="var(--accent)" strokeWidth="1.4" aria-hidden="true">
            <rect x="40" y="20" width="220" height="380" />
            <rect x="62" y="44" width="176" height="150" />
            <rect x="62" y="214" width="176" height="164" />
            <path d="M62 119h176M150 44v150M62 296h176M150 214v164" opacity=".35" />
            <circle cx="224" cy="206" r="5" fill="var(--accent)" />
          </svg>
        ) : (
          // No cover image: a framed panel with the client's logo or name.
          <div style={{ position: "absolute", inset: "64px 64px 64px 0", border: "1.4px solid var(--accent)", display: "grid", placeItems: "center", padding: 48 }}>
            {brand.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <span style={{ background: "#fff", padding: "28px 36px", borderRadius: 6, display: "grid", placeItems: "center", maxWidth: "80%" }}>
                <img src={brand.logo} alt="" style={{ maxWidth: "100%", maxHeight: 160, objectFit: "contain" }} />
              </span>
            ) : (
              <span style={{ font: "400 64px/1 var(--serif)", color: "var(--accent)", textAlign: "center" }}>{doc.client.name}</span>
            )}
          </div>
        )}
      </div>
    </div>
  ), { bare: true });

  // Executive summary
  if (sec.exec) {
    const k: ReactNode[] = [];
    if (A.hasIG) {
      k.push(<Kpi key="v" v={f0(ig.views)} l="Instagram views" e="Times your content was watched" cls="sm" />);
      if (ig.nonFol != null) k.push(<Kpi key="nf" v={PCT(ig.nonFol)} l="Views from non-followers" e="Share of views from new people" cls="sm" />);
      if (ig.growth != null) k.push(<Kpi key="g" v={growthLabel(ig.growth)} l="Follower growth" e="Change in followers this month" cls="sm" />);
    }
    if (A.hasMeta) {
      k.push(<Kpi key="s" v={INR(m.spend)} l="Ad spend" e="Total spent on Meta ads" cls="sm" />);
      if (m.conv != null) k.push(<Kpi key="c" v={f0(m.conv)} l="Messaging conversations" e="People who messaged after an ad" cls="sm" />);
      if (A.cpr) k.push(<Kpi key="cpr" v={INR(A.cpr)} l="Cost per conversation" e="Spend divided by conversations" cls="sm" />);
    }
    add("exec", "Executive summary", (
      <div className="cols" style={{ gridTemplateColumns: "1.05fr 1fr", gap: 44, flex: 1 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Ttl k="exec" def="What happened this month?" />
          <Ai id="exec" />
          <div>
            <div className="sec-h">Key takeaways</div>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "34px 1fr", gap: 6, padding: "7px 0", borderBottom: "1px solid var(--rule)" }}>
                <span style={{ font: "400 22px var(--serif)", color: "var(--num)" }}>0{i + 1}</span>
                <Ai id={`t.${i}`} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div className="kpis g2" style={{ rowGap: 34 }}>
            {k.length ? k : <div className="empty">No platform data was included in this report.</div>}
          </div>
        </div>
      </div>
    ));
  }

  // What we worked on
  if (sec.social) {
    const c = A.counts;
    add("social", "What we worked on", (
      <>
        <Ttl k="social" def="What we worked on this month" />
        <div className="cnt">
          <div><b>{c.reels + c.posts + c.car}</b><span>pieces published</span></div>
          <div><b>{c.reels}</b><span>Reels</span></div>
          <div><b>{c.posts}</b><span>posts</span></div>
          <div><b>{c.car}</b><span>carousels</span></div>
          <div><b>{A.hasMeta ? 1 : 0}</b><span>paid campaign{A.hasMeta ? "" : "s"}</span></div>
        </div>
        <div style={{ flex: 1 }}>
          {([["Content strategy", 0], ["Social media", 1], ["Reels", 2], ["Paid media", 3], ["Optimisation", 4]] as const).map(([h, i]) => (
            <div className="wrow" key={i}><h5>{h}</h5><Ai id={`w.${i}`} /></div>
          ))}
        </div>
      </>
    ));
  }

  // Content calendar, Monday first
  if (sec.calendar) {
    const s = parseDay(d.period.start), first = (parseDay(`${s.y}-${String(s.m + 1).padStart(2, "0")}-01`).weekday + 6) % 7;
    const days = daysInMonth(s.y, s.m), cells: ReactNode[] = [];
    for (let i = 0; i < first; i++) cells.push(<div className="d out" key={`o${i}`} />);
    for (let n = 1; n <= days; n++) {
      const ds = `${s.y}-${String(s.m + 1).padStart(2, "0")}-${String(n).padStart(2, "0")}`;
      const same = d.content.filter((x) => x.date === ds), c = same[0];
      cells.push(c ? (
        <div className="d has" key={n}>
          <b>{n}</b>
          <div className="art">{art(c)}</div>
          <div className="tg">{same.length > 1 ? `${same.length} POSTS` : c.type.toUpperCase()} · {fDay(ds).toUpperCase()}</div>
        </div>
      ) : (
        <div className="d" key={n}><b>{n}</b></div>
      ));
    }
    add("calendar", "Content calendar", (
      <>
        <Ttl k="calendar" def="Instagram content calendar" sub={`${A.month}. ${A.counts.reels} Reels, ${A.counts.posts} posts, ${A.counts.car} carousels. Stories: not available in uploaded data.`} />
        <div className="cal">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => <div className="dh" key={x}>{x}</div>)}
          {cells}
        </div>
      </>
    ));
  }

  // Instagram performance
  if (sec.ig) {
    if (!A.hasIG) {
      add("ig", "Instagram performance", (
        <>
          <Ttl k="ig" def="Instagram performance" />
          <div className="empty">Instagram Insights were not available. Upload Instagram Insights screenshots to include detailed performance analysis.</div>
        </>
      ));
    } else {
      const k: ReactNode[] = [<Kpi key="v" v={f0(ig.views)} l="Total views" e="Times content was watched or seen" cls="sm" />];
      if (ig.unique != null) k.push(<Kpi key="u" v={f0(ig.unique)} l="Unique viewers" e="Different people reached" cls="sm" />);
      if (ig.nonFol != null) k.push(<Kpi key="nf" v={PCT(ig.nonFol)} l="Views from non-followers" e="Views from people outside your audience" cls="sm" />);
      if (ig.net != null) k.push(<Kpi key="n" v={sgn(ig.net)} l="Net followers" e="Followers gained minus lost" cls="sm" />);
      if (ig.followers != null) k.push(<Kpi key="f" v={f0(ig.followers)} l="Total followers" e="Audience size at month end" cls="sm" />);
      if (ig.growth != null) k.push(<Kpi key="g" v={growthLabel(ig.growth)} l="Follower growth" e="Change in audience this month" cls="sm" />);
      const miss = ([["profileVisits", "profile visits"], ["websiteClicks", "website clicks"], ["messages", "organic messages"]] as const)
        .filter(([key]) => ig[key] == null).map(([, l]) => l);
      add("ig", "Instagram performance", (
        <>
          <Ttl k="ig" def="Instagram performance" sub={per} />
          <div className="kpis">{k}</div>
          <div className="cols" style={{ gridTemplateColumns: "1fr 1.2fr", gap: 36, flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div className="ct">Instagram views by content type</div>
                <BarsV items={A.fm.map((x) => ({ l: x.name, v: x.views, c: x.name === "Reels" ? "var(--num)" : "var(--rmute)" }))} w={420} h={170} />
              </div>
              {ig.nonFol != null ? (
                <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
                  <div><Donut p={ig.nonFol} size={140} /></div>
                  <div className="ct" style={{ fontWeight: 500 }}>Share of views from people who do not follow the account</div>
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Ai id="ig_what" lab="What happened" />
              <Ai id="ig_means" lab="What this means" />
              <Ai id="ig_next" lab="What we should do next" />
              {miss.length ? <div className="basis">Not in uploaded data: {miss.join(", ")}.</div> : null}
            </div>
          </div>
        </>
      ), { src: "instagram" });
    }
  }

  // Content performance, breakdown, top performers, insights
  if (sec.content) {
    const insight = (x: ContentItem) => {
      const t: string[] = [];
      if (x === A.topViews) t.push("Most views, reach" + (x === A.topShares ? " and shares" : ""));
      if (x === A.topShares && x !== A.topViews) t.push("Most shares");
      if (x === A.topSaves) t.push("Most saves");
      if (x === A.topPostE) t.push("Highest post engagement");
      if (x === A.topReelE) t.push("Highest Reel engagement");
      return t.join(". ") || f1((x.views || 0) / (A.avgV || 1)) + "× average views";
    };
    const rows: MatrixRow[] = d.content.map((x) => {
      const er = engagementRate(x);
      return {
        id: x.id, art: art(x), caption: x.caption.slice(0, 38) + "…", type: x.type, date: x.date, dateLabel: fDay(x.date),
        views: x.views, likes: f0(x.likes), comments: f0(x.comments), shares: x.shares, saves: x.saves, reach: x.reach, er,
        insight: insight(x), viewsLabel: f0(x.views), sharesLabel: f0(x.shares), savesLabel: f0(x.saves), reachLabel: f0(x.reach), erLabel: PCT(er, 2),
      };
    });
    // Eight rows fit a page; longer months continue on further pages, busiest first.
    const PER_MATRIX = 8;
    const byViews = rows.slice().sort((a, b) => (b.views ?? -1) - (a.views ?? -1));
    const matrixPages = Math.max(1, Math.ceil(byViews.length / PER_MATRIX));
    for (let pg = 0; pg < matrixPages; pg++) {
      const key = pg ? `matrix${pg}` : "matrix";
      add(key, "Content performance", (
        <>
          <Ttl k={key} def="Content performance" sub={`Every piece published in ${A.month}. Click a column to sort.${matrixPages > 1 ? ` ${pg + 1} of ${matrixPages}.` : ""}`} />
          <div id={pg ? undefined : "matrix"}><ContentMatrix rows={byViews.slice(pg * PER_MATRIX, (pg + 1) * PER_MATRIX)} max={Math.max(...rows.map((x) => x.views || 0), 1)} /></div>
          <div className="basis">Engagement rate = (likes + comments + shares + saves) ÷ reach. Bars under views show size relative to the largest piece.</div>
        </>
      ));
    }

    const card = (x: ContentItem) => {
      const [rl, rc] = A.rating(x);
      const fmt = A.fm.find((f) => f.name === x.type + "s");
      const why = x === A.topViews
        ? `Likely contributing factors based on available data: ${A.lead && x.type === "Reel" && A.ratio && A.other ? `Reels averaged ${f1(A.ratio)}× the views of ${A.other.name.toLowerCase()} this month` : "format"}, and a ${x.theme.toLowerCase()} theme. Visual hook: ${NA.toLowerCase()}`
        : rc === "low"
          ? `Likely contributing factors based on available data: ${x.type.toLowerCase()} format averaged ${K(fmt?.avg)} views this month. ${NA}`
          : `Likely contributing factors based on available data: ${x.type.toLowerCase()} format and ${x.theme.toLowerCase()} theme. ${NA}`;
      const replicate = rc === "top"
        ? `Repeat the ${x.type.toLowerCase()} structure and ${x.theme.toLowerCase()} theme, then test one change at a time.`
        : rc === "mid" ? "Keep the format and test a stronger opening and call-to-action."
          : x.type === "Reel" ? "Rework the opening seconds and the cover, then compare against this version."
          : "Rework the idea as a Reel or carousel and compare against this version.";
      return (
        <div className="cc" key={x.id}>
          <div className="cv">{art(x)}{x.img ? null : <span className="rb">Cover placeholder</span>}</div>
          <div>
            <div className="meta">{fLong(x.date)} · {x.type}</div>
            <h4>{x.theme}</h4>
            <Caption text={x.caption} />
            <div className="tgs">{x.tags}</div>
            <div className="mrow">
              {([["views", "Views"], ["reach", "Reach"], ["likes", "Likes"], ["comments", "Comments"], ["shares", "Shares"], ["saves", "Saves"]] as const).map(([key, l]) => (
                <div key={key}><b>{f0(x[key])}</b><span>{l}</span></div>
              ))}
            </div>
            <span className={`rate ${rc}`}>{rl} on views</span>{" "}
            <span style={{ fontSize: 11.5, color: "var(--rmute)", marginLeft: 6 }}>Engagement {PCT(engagementRate(x), 2)}</span>
          </div>
          <div>
            <div className="lab">Why it performed this way</div>
            <div className="aitext" style={{ fontSize: 12.5 }}><span data-why={x.id}>{doc.texts[`why.${x.id}`] ?? why}</span></div>
            <div className="lab" style={{ marginTop: 10 }}>What to replicate</div>
            <div className="aitext" style={{ fontSize: 12.5 }}>{replicate}</div>
          </div>
        </div>
      );
    };
    const cs = d.content.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const tot = Math.ceil(cs.length / 2);
    for (let i = 0; i < cs.length; i += 2) {
      add(`break${i}`, "Content breakdown", (
        <>
          <Ttl k={`break${i}`} def="Content breakdown" sub={`Piece-by-piece. ${i / 2 + 1} of ${tot}.`} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>{cs.slice(i, i + 2).map(card)}</div>
        </>
      ));
    }

    const tile = (label: string, c: ContentItem | undefined, val: string | null, note?: string) => c ? (
      <div className="tile" key={label}>
        <div className="ct">{label}</div>
        <div className="th2">
          <div className="cv">{art(c)}</div>
          <div><div className="v">{val}</div><div style={{ fontSize: 11, color: "var(--rmute)" }}>{cdesc(c)}</div></div>
        </div>
        <div className="c">{c.caption}</div>
        {note ? <div className="basis">{note}</div> : null}
      </div>
    ) : (
      <div className="tile na" key={label}>
        <div className="ct">{label}</div>
        <div className="v">{NA}</div>
        <div className="basis">{note || ""}</div>
      </div>
    );
    add("top", "Top performing content", (
      <>
        <Ttl k="top" def="Top performing content" sub="Different metrics crown different winners, so each is shown separately." />
        <div className="tiles">
          {tile("Top Reel by views", A.topReelV, A.topReelV ? K(A.topReelV.views) : null)}
          {tile("Top Reel by engagement", A.topReelE, A.topReelE ? PCT(engagementRate(A.topReelE), 2) : null, "Engagement rate")}
          {tile("Top post by engagement", A.topPostE, A.topPostE ? PCT(engagementRate(A.topPostE), 2) : null, "Engagement rate")}
          {tile("Top by shares", A.topShares, A.topShares ? f0(A.topShares.shares) : null)}
          {tile("Top by saves", A.topSaves, A.topSaves ? f0(A.topSaves.saves) : null)}
          {tile("Top by reach", A.topReach, A.topReach ? K(A.topReach.reach) : null)}
          {tile("Top by comments", A.topComm, A.topComm ? f0(A.topComm.comments) : null)}
          {tile("Top by follower conversion", undefined, "", "Per-post follower data is not in the uploaded screenshots.")}
        </div>
        <div className="lede" style={{ fontSize: 13, color: "var(--rmute)" }}>Reading across the tiles: the piece with the most views is not always the piece people engage with most, which is why no single ranking is used.</div>
      </>
    ));

    add("insights", "Content insights", (
      <>
        <Ttl k="insights" def="What worked, what did not, what to test" />
        <div className="cols" style={{ gridTemplateColumns: "1.1fr 1fr", gap: 34, flex: 1 }}>
          <div>
            <div className="sec-h">Content themes</div>
            <table className="ptbl">
              <tbody>
                <tr><th>Theme</th><th>Pieces</th><th>Avg views</th><th>Avg engagement</th><th>Best piece</th></tr>
                {A.themes.slice(0, 8).map((t) => (
                  <tr key={t.name}><td><b>{t.name}</b></td><td>{t.n}</td><td>{K(t.avg)}</td><td>{PCT(t.er, 2)}</td><td>{t.best ? fDay(t.best.date) : "—"}</td></tr>
                ))}
              </tbody>
            </table>
            {A.themes.length > 8 ? <div className="basis">{A.themes.length - 8} smaller themes not shown.</div> : null}
            <div className="basis" style={{ marginTop: 10 }}>Visual patterns such as human presence, close-ups or text hooks: {NA} Upload the creative files to enable cover-level analysis.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {([["What worked", "cw"], ["What did not work", "cn"], ["What to test next", "ct"]] as const).map(([h, b]) => (
              <div key={b}>
                <div className="sec-h">{h}</div>
                {[0, 1, 2].map((i) => <div key={i} style={{ marginBottom: 6 }}><Ai id={`${b}.${i}`} /></div>)}
              </div>
            ))}
          </div>
        </div>
      </>
    ));
  }

  // Paid media
  if (sec.meta || sec.google || sec.linkedin) {
    const notes: string[] = [];
    if (sec.google) notes.push("Google Ads data was not included in this report.");
    if (sec.linkedin) notes.push("LinkedIn Ads data was not included in this report.");
    if (sec.meta && !A.hasMeta) notes.push("Meta Ads data was not included in this report.");
    const note = notes.length ? (
      <div className="empty">{notes.map((n, i) => <span key={i}>{i ? <br /> : null}{n}</span>)}</div>
    ) : null;
    if (sec.meta && A.hasMeta) {
      const k: ReactNode[] = [<Kpi key="s" v={INR(m.spend)} l="Ad spend" e="Total spent in the period" />];
      if (m.conv != null) k.push(<Kpi key="c" v={f0(m.conv)} l="Messaging conversations" e="People who started a chat" />);
      if (A.cpr) k.push(<Kpi key="cpr" v={INR(A.cpr)} l="Cost per conversation" e="Spend ÷ conversations" />);
      if (m.impr != null) k.push(<Kpi key="i" v={f0(m.impr)} l="Impressions" e="Times ads were shown" />);
      if (m.reach != null) k.push(<Kpi key="r" v={f0(m.reach)} l="Reach" e="Different people who saw ads" />);
      if (A.freq) k.push(<Kpi key="f" v={f2(A.freq)} l="Frequency" e="Average views per person" />);
      add("paid", "Paid media overview", (
        <>
          <Ttl k="paid" def="Meta Ads" sub={per} />
          <div className="kpis g3" style={{ rowGap: 26 }}>{k}</div>
          <div className="cols" style={{ gridTemplateColumns: "1fr 1fr", gap: 40, flex: 1 }}>
            <div>
              <div className="ct">How many ad views reached new people (impressions split)</div>
              {m.impr && m.reach ? <HBars items={[{ l: "First-time viewers (reach)", v: m.reach }, { l: "Repeat views", v: m.impr - m.reach }]} /> : null}
              <div className="basis">Repeat views = impressions − reach.</div>
            </div>
            <div>
              <div className="ct">Cost to get attention and conversations</div>
              <HBars items={[{ l: "Cost per 1,000 impressions", v: A.cpm }, { l: "Cost per conversation", v: A.cpr }]} fmt={INR} />
              <div className="basis">Different units. Compare each figure with next month, not with each other.</div>
            </div>
          </div>
          {note}
        </>
      ), { src: "meta" });
      add("camp", "Campaign performance", (
        <>
          <Ttl k="camp" def="Campaign performance" />
          <table className="ptbl">
            <tbody>
              <tr><th>Campaign</th><th>Objective</th><th>Spend</th><th>Results</th><th>Cost / result</th><th>Reach</th><th>Impressions</th><th>Frequency</th><th>CTR</th><th>CPC</th><th>CPM</th></tr>
              <tr>
                <td><b>{m.campaign}</b></td><td>{m.objective}</td><td>{INR(m.spend)}</td><td>{f0(m.conv)}</td><td>{INR(A.cpr)}</td>
                <td>{f0(m.reach)}</td><td>{f0(m.impr)}</td><td>{f2(A.freq)}</td>
                <td className={A.ctr == null ? "na" : ""}>{A.ctr == null ? "Not in data" : PCT(A.ctr, 2)}</td>
                <td className={A.cpc == null ? "na" : ""}>{A.cpc == null ? "Not in data" : INR(A.cpc)}</td>
                <td>{INR(A.cpm)}</td>
              </tr>
            </tbody>
          </table>
          <div className="cols" style={{ gridTemplateColumns: "1fr 1fr", gap: 40, flex: 1, marginTop: 10 }}>
            <Ai id="camp_obs" lab="Campaign observation" />
            <Ai id="camp_int" lab="Client-friendly interpretation" />
          </div>
        </>
      ), { src: "meta" });
      add("paidins", "Paid media insights", (
        <>
          <Ttl k="paidins" def="Paid media insights" />
          <div className="doai" style={{ flex: 1 }}>
            {([["Data", "pd_data"], ["Observation", "pd_obs"], ["Interpretation", "pd_int"], ["Action", "pd_act"]] as const).map(([h, id]) => (
              <div key={id}><h5>{h}</h5><Ai id={id} /></div>
            ))}
          </div>
        </>
      ));
    } else {
      add("paid", "Paid media overview", (
        <>
          <Ttl k="paid" def="Paid media" />
          {note || <div className="empty">No paid media data was included in this report.</div>}
        </>
      ));
    }
  }

  // Organic and paid together, business impact
  if (sec.impact || sec.leads) {
    const st = (l: string, v: number | null) => v != null ? (
      <div className="st" key={l}><span>{l}</span><div className="b" style={{ width: `${Math.max(8, Math.min(100, (v / (ig.views || 1)) * 100))}%` }}>{f0(v)}</div></div>
    ) : (
      <div className="st" key={l}><span>{l}</span><div className="n">Not available in uploaded data</div></div>
    );
    add("combined", "Organic and paid together", (
      <>
        <Ttl k="combined" def="Organic and paid together" sub="Platform definitions differ, so figures are placed side by side, not added." />
        <div className="cols" style={{ gridTemplateColumns: "1fr 1fr", gap: 44, flex: 1 }}>
          <div>
            <div className="ct">Visibility by source</div>
            <HBars items={[{ l: "Organic: Instagram views", v: ig.views }, { l: "Paid: Meta impressions", v: m.impr }].filter((x) => x.v != null)} />
            <div className="ct" style={{ marginTop: 22 }}>Direct enquiries</div>
            <HBars items={[{ l: "Paid messaging conversations", v: m.conv }, { l: "Organic messages", v: ig.messages }].filter((x) => x.v != null)} />
            <div className="basis">{ig.messages == null ? "Organic messages: not available in uploaded data." : ""}</div>
          </div>
          <div>
            <div className="ct">Organic audience journey</div>
            <div className="fun">
              {st("Content views", ig.views)}{st("Profile visits", ig.profileVisits)}{st("New followers", ig.net)}
              {st("Messages", ig.messages)}{st("Leads", d.outcomes.qualified)}{st("Sales", d.outcomes.sales)}
            </div>
            <div className="basis" style={{ marginTop: 8 }}>Missing stages are shown as unavailable rather than estimated. Bars are scaled against views.</div>
          </div>
        </div>
      </>
    ));

    const o = d.outcomes, have = o.qualified != null || o.bookings != null || o.sales != null || o.revenue != null;
    const tier = (h: string, n: string, u: string, p: string, na = false) => (
      <div className={`tier ${na ? "na" : ""}`} key={h}>
        <div><div className="n">{n}</div><div className="u">{u}</div></div>
        <div><h5>{h}</h5><p>{p}</p></div>
      </div>
    );
    const provided = ([["Qualified leads", o.qualified], ["Bookings", o.bookings], ["Sales", o.sales], ["Revenue", o.revenue]] as const)
      .filter(([, v]) => v != null)
      .map(([l, v]) => tier(l, l === "Revenue" ? INR(v) : f0(v), "provided by the client", "Reported by the client, not estimated."));
    add("impact", "Business impact", (
      <>
        <Ttl k="impact" def="Business impact" sub="Reach, engagement, enquiries and sales are different things." />
        <div>
          {tier("Brand visibility", f0(m.impr), "ad impressions", `Paid ad views${ig.views != null ? `, plus ${f0(ig.views)} organic Instagram views` : ""}.`)}
          {tier("Audience discovery", PCT(ig.nonFol), "of views from non-followers", "How much attention came from people who did not already follow.")}
          {tier("Direct enquiries", f0(m.conv), "messaging conversations", "People who started a message conversation after seeing an ad.")}
          {have ? provided : tier("Sales and revenue", "Not available", "", "Sales attribution not available in current reporting data.", true)}
        </div>
        <Ai id="imp" />
      </>
    ));
  }

  // Month over month, only when previous-month data exists
  if (sec.mom && hasPrevious(d)) {
    const pv = d.prev;
    const cur: Record<string, number | null> = { views: ig.views, unique: ig.unique, followers: ig.followers, net: ig.net, posts: A.counts.posts, reels: A.counts.reels, spend: m.spend, conv: m.conv, cpr: A.cpr, impr: m.impr, reach: m.reach };
    const prv: Record<string, number | null> = { ...pv, cpr: pv.spend != null && pv.conv ? pv.spend / pv.conv : null };
    const rows: [string, string, (n: number | null) => string, boolean][] = [
      ["views", "Instagram views", f0, false], ["unique", "Unique viewers", f0, false], ["followers", "Total followers", f0, false],
      ["net", "Net followers", sgn, false], ["posts", "Posts", f0, false], ["reels", "Reels", f0, false], ["spend", "Ad spend", INR, false],
      ["conv", "Messaging conversations", f0, false], ["cpr", "Cost per conversation", INR, true], ["impr", "Impressions", f0, false], ["reach", "Ad reach", f0, false],
    ];
    const prevMonth = MONTHS[(parseDay(d.period.start).m + 11) % 12];
    add("mom", "Month over month", (
      <>
        <Ttl k="mom" def={`${A.monthName} versus ${prevMonth}`} />
        <table className="ptbl">
          <tbody>
            <tr><th>Metric</th><th>Previous</th><th>Current</th><th>Change</th></tr>
            {rows.map(([k, l, f, inv]) => {
              const dl = delta(cur[k], prv[k], inv);
              return (
                <tr key={k}>
                  <td>{l}</td>
                  <td>{prv[k] != null ? f(prv[k]) : <span className="na">Not provided</span>}</td>
                  <td><b>{cur[k] != null ? f(cur[k]) : "—"}</b></td>
                  <td>{dl ? <span className={`delta ${dl.good}`} style={{ margin: 0 }}>{dl.txt}</span> : <span className="na">Not comparable</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Ai id="mom" />
      </>
    ));
  }

  // Source screenshots, two per page
  if (sec.sources) {
    const mk = (p: Platform, title: string) => {
      const s = shotsFor(doc, p);
      const label = p === "instagram" ? "Instagram Insights" : p === "meta" ? "Meta Ads Manager" : PLATFORM_LABELS[p];
      for (let i = 0; i < s.length; i += 2) {
        const pair = s.slice(i, i + 2);
        add(`src-${p}${i}`, title, (
          <>
            <Ttl k={`src-${p}${i}`} def={title} sub="Original platform screenshots. These are the source of truth for every figure in this report." />
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(2, pair.length)},1fr)`, gap: 22, flex: 1, minHeight: 0 }}>
              {pair.map((f, j) => (
                <ShotCard key={j} doc={doc} A={A} shot={f} caption={label + (f.name ? " · " + f.name : "") + (s.length > 1 ? ` (${i + j + 1})` : "")} />
              ))}
            </div>
          </>
        ));
      }
    };
    if (A.hasIG) mk("instagram", "Platform snapshots: Instagram");
    if (A.hasMeta) mk("meta", "Platform snapshots: Meta Ads");
    (["google", "linkedin", "ga", "gbp", "yt", "other"] as const).forEach((p) => {
      if ((doc.uploads[p] || []).some((f) => f.url)) mk(p, "Platform snapshots: " + PLATFORM_LABELS[p]);
    });
  }

  if (sec.recs) {
    add("recs", "Strategic recommendations", (
      <>
        <Ttl k="recs" def="Next month strategy" />
        <div className="recs" style={{ flex: 1 }}>
          {([["Content", 0], ["Paid media", 1], ["Audience", 2], ["Creatives", 3], ["Conversion", 4]] as const).map(([h, i]) => (
            <div key={i}><h5>{h}</h5><Ai id={`rc.${i}`} /></div>
          ))}
        </div>
      </>
    ));
  }

  if (sec.plan) {
    const rows = actionRows(doc, A);
    add("plan", "Action plan", (
      <>
        <Ttl k="plan" def="Action plan" />
        <table className="ptbl">
          <tbody>
            <tr><th style={{ width: "30%" }}>Action</th><th>Why</th><th>Priority</th><th>Owner</th><th>Timeline</th></tr>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => <td key={j} className={j === 2 ? `pri ${c}` : undefined}><span data-cell={`${i}.${j}`}>{c}</span></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </>
    ));
    add("focus", "Next month focus", (
      <>
        <Ttl k="focus" def="Next month focus" />
        <div className="focus" style={{ flex: 1, alignContent: "start", marginTop: 10 }}>
          {focusItems(A).map(([h, p]) => <div key={h}><h5>{h}</h5><p>{p}</p></div>)}
        </div>
      </>
    ));
  }

  add("thanks", "Thank you", (
    <div className="thanks" style={{ position: "absolute", inset: 0 }}>
      <div style={{ fontSize: 34 }}><ClientWord name={doc.client.name} brand={brand} size={40} /></div>
      <h2>Thank you</h2>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <GbsMark brand={brand} size={30} />
        <div style={{ textAlign: "left" }}>
          <b style={{ letterSpacing: ".06em" }}>GET BEE SEEN</b>
          <div style={{ fontSize: 12, color: "var(--rmute)" }}>Making brands impossible to ignore.</div>
        </div>
      </div>
    </div>
  ), { bare: true });

  return P;
}

/** Placeholder render of the figures, used only for the demo fixture. */
function MockShot({ doc, A, p }: { doc: ReportDoc; A: Analysis; p: Mock }) {
  const d = doc.data;
  const per = `${fDay(d.period.start)} – ${fLong(d.period.end)}`;
  const rows: [string, string][] = p === "meta"
    ? [["Amount spent", INR(d.meta.spend)], ["Messaging conversations started", f0(d.meta.conv)], ["Cost per messaging conversation", INR(A.cpr)], ["Impressions", f0(d.meta.impr)], ["Reach", f0(d.meta.reach)], ["Frequency", f2(A.freq)]]
    : p === "ig2"
      ? [["Followers", f0(d.ig.followers)], ["Net follows", sgn(d.ig.net)], ["Follower growth", PCT(d.ig.growth)], ["Content published", f0(A.c.length)]]
      : [["Views", f0(d.ig.views)], ["Accounts reached (unique viewers)", f0(d.ig.unique)], ["Views from non-followers", PCT(d.ig.nonFol)]];
  return (
    <div className="mock">
      <h6>{p === "meta" ? "Meta Ads Manager" : p === "ig2" ? "Instagram Insights · Followers" : "Instagram Insights · Overview"}</h6>
      <div style={{ color: "#777", marginBottom: 6 }}>{per}</div>
      {rows.map((r) => <div className="mr" key={r[0]}><span>{r[0]}</span><b>{r[1]}</b></div>)}
      <span className="wm">Sample render. Replace with the uploaded screenshot.</span>
    </div>
  );
}

function ShotCard({ doc, A, shot, caption }: { doc: ReportDoc; A: Analysis; shot: Shot; caption: string }) {
  return (
    <figure className="shot" style={{ margin: 0 }}>
      {shot.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shot.url} alt={caption} />
      ) : (
        <MockShot doc={doc} A={A} p={shot.mock as Mock} />
      )}
      <cite>
        {caption}
        <br />
        <span style={{ fontWeight: 500 }}>{fDay(doc.data.period.start)} – {fLong(doc.data.period.end)}</span>
      </cite>
    </figure>
  );
}

/** Client-safe page frame: client brand leads, GBS co-brands every page. */
export function ReportPage({ doc, A, page, i, total, mode, srcIndex = -1 }: { doc: ReportDoc; A: Analysis; page: PageDef; i: number; total: number; mode: "screen" | "print"; srcIndex?: number }) {
  const brandStyle = css({ "--brand": doc.brand.primary, "--accent": doc.brand.accent });
  return (
    <div className="pbox" data-i={i}>
      <section className={`page t-${doc.template}`} id={`pg-${i}`} style={brandStyle}>
        {page.bare ? null : (
          <div className="ph">
            <ClientWord name={doc.client.name} brand={doc.brand} size={15} />
            <span className="phr">
              <span>{page.title}</span>
              {mode === "screen" && srcIndex >= 0 ? <a className="srcbtn" href={`#pg-${srcIndex}`}>View source screenshot</a> : null}
              <span className="gbsl"><GbsMark brand={doc.brand} size={18} /><b>Get Bee Seen</b></span>
            </span>
          </div>
        )}
        {page.bare ? page.body : <div className="pc">{page.body}</div>}
        {page.bare ? null : (
          <div className="pf">
            <span className="gbsf"><GbsMark brand={doc.brand} size={16} /> Prepared by Get Bee Seen · Making brands impossible to ignore.</span>
            <span>{doc.client.name} · {A.month} · {i + 1} / {total}</span>
          </div>
        )}
      </section>
    </div>
  );
}

/** All pages, unscaled. `scale` sets `--s` on `.pages` for preview scaling. */
export function ReportPages({ doc: draft, mode, scale }: { doc: ReportDoc; mode: "screen" | "print"; scale?: number | string }) {
  // Conflicts are applied first: an unresolved figure is left out, never guessed.
  const doc = clientReady(draft);
  const A = analyze(doc.data);
  const pages = buildPages(doc, A);
  // "View source screenshot" jumps to the first snapshot page of that platform.
  const srcPage = (p?: Platform) => (p ? pages.findIndex((x) => x.key.startsWith(`src-${p}`)) : -1);
  return (
    <div className="pages report-root" style={scale != null ? css({ "--s": scale }) : undefined}>
      {pages.map((p, i) => (
        <ReportPage key={p.key} doc={doc} A={A} page={p} i={i} total={pages.length} mode={mode} srcIndex={srcPage(p.src)} />
      ))}
    </div>
  );
}

/** The cover alone, for thumbnails in the studio. */
export function ReportCover({ doc: draft, scale }: { doc: ReportDoc; scale: number }) {
  const doc = clientReady(draft);
  const A = analyze(doc.data);
  const pages = buildPages(doc, A);
  return (
    <div className="pages report-root" style={css({ "--s": scale, pointerEvents: "none" })} aria-hidden="true">
      <ReportPage doc={doc} A={A} page={pages[0]} i={0} total={pages.length} mode="screen" />
    </div>
  );
}
