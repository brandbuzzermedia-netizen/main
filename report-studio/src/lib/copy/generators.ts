// Rule-based report copy, grounded only in the analysed figures.
//
// These are the prototype's templates. They are the fallback when the model
// is unavailable and the grounding examples for Claude-written copy (build
// step 4). Each block returns variants; list blocks return one variant list
// per item. A figure that is missing yields NA rather than a guess.
import type { Analysis } from "../analysis.ts";
import type { Confidence, ContentItem, ReportDoc } from "../report/types.ts";
import { INR, K, PCT, f0, f1, f2, fDay, fLong, sgn } from "../format.ts";

export const NA = "Insufficient data to determine.";

const cdesc = (x: { date: string; type: string }) => `${fDay(x.date)} ${x.type.toLowerCase()}`;
export { cdesc };

type Block = (A: Analysis) => string[] | string[][];

/** What the paid campaign was for, in the "What we worked on" list. */
const GOAL: Record<Analysis["rw"]["focus"], (A: Analysis) => string> = {
  enquiry: () => "generating direct enquiries",
  traffic: () => "driving visits to the website",
  sales: () => "driving online purchases",
  other: (A) => (A.data.meta.objective ? `the ${A.data.meta.objective.toLowerCase()} objective` : "its campaign objective"),
};

/** Account-level engagement in one sentence, from Insights totals. */
function engagementLine(A: Analysis): string {
  const ig = A.data.ig;
  if (ig.engaged != null) return `${f0(ig.engaged)} accounts engaged with the content this month${A.interactions != null ? ` (${f0(A.interactions)} interactions)` : ""}.`;
  return `The content earned ${f0(A.interactions)} likes, comments, shares and saves this month.`;
}

export const G: Record<string, Block> = {
  exec: (A) => {
    const ig = A.data.ig, m = A.data.meta, p: string[] = [];
    if (A.lead && A.other) p.push(`${A.month} was driven mainly by Instagram ${A.lead.name}, which averaged ${K(A.lead.avg)} views per piece against ${K(A.other.avg)} for ${A.other.name}.`);
    else if (A.lead) p.push(`${A.month} visibility came mainly from Instagram ${A.lead.name}, averaging ${K(A.lead.avg)} views per piece.`);
    if (ig.nonFol != null) p.push(`${PCT(ig.nonFol)} of views came from people who do not yet follow the account, while net follower growth was ${sgn(ig.net)}.`);
    if (A.hasEngagement && A.focus === "engagement" && ig.engaged != null) p.push(`${f0(ig.engaged)} accounts engaged with the content${A.interactions != null ? `, with ${f0(A.interactions)} likes, comments, shares and saves in total` : ""}.`);
    if (A.hasMeta) p.push(m.conv ? `Paid media on Meta produced ${f0(m.conv)} ${A.rw.many} at ${INR(A.cpr)} each.` : `Meta paid media spend was ${INR(m.spend)}.`);
    return [p.join(" ") || NA, p.slice().reverse().join(" ") || NA];
  },
  t: (A) => [
    [!A.listed && A.data.ig.views != null ? `Content was seen ${f0(A.data.ig.views)} times${A.data.ig.unique != null ? ` by ${f0(A.data.ig.unique)} accounts` : ""}.` : A.lead && A.other ? `${A.lead.name} were the strongest discovery format, averaging ${f1(A.ratio)}× the views of ${A.other.name}.` : NA, A.lead ? `${A.lead.name} delivered the most visibility this month.` : NA],
    [A.data.ig.nonFol != null ? `Non-follower visibility was high: ${PCT(A.data.ig.nonFol)} of views came from new audiences.` : NA],
    [A.vpf ? `Follower conversion is an opportunity: ${f0(A.data.ig.views)} views produced ${sgn(A.data.ig.net)} net followers, about one for every ${f0(A.vpf)} views.` : NA],
    [A.hasMeta && A.data.meta.conv ? `Meta campaigns generated ${f0(A.data.meta.conv)} ${A.rw.key === "messaging" || A.rw.key === "calls" ? "direct " : ""}${A.rw.many} at ${INR(A.cpr)} each.` : A.hasEngagement ? engagementLine(A) : A.hasMeta ? `Meta paid media spend was ${INR(A.data.meta.spend)}.` : "Meta Ads data was not included in this report."],
    [A.topViews ? `Next month’s focus: repeat what worked in the ${cdesc(A.topViews)} and improve what happens after someone watches.` : !A.listed ? "Next month’s focus: record each post’s figures so the strongest pieces can be identified and repeated." : NA],
  ],
  w: (A) => {
    const c = A.counts, tot = c.reels + c.posts + c.car, fest = A.c.filter((x) => x.theme === "Festival");
    if (!A.listed) {
      const known = A.countsKnown;
      return [
        [known ? `Created and published ${tot} pieces of content (${c.reels} Reels, ${c.posts} posts${c.stories != null ? `, ${c.stories} stories` : ""}), as counted in Instagram Insights.` : "The number of pieces published is not available in the uploaded data."],
        ["Occasion and campaign content: not available in uploaded data."],
        [A.data.ig.reels != null ? `Published ${c.reels} Reels${A.data.ig.nonFol != null ? `; ${PCT(A.data.ig.nonFol)} of views came from non-followers` : ""}.` : "Reel count: not available in uploaded data."],
        [A.hasMeta ? `Managed 1 Meta campaign focused on ${GOAL[A.rw.focus](A)}, with ${INR(A.data.meta.spend)} in spend over the period.` : "No paid media data was included this month."],
        ["Per-post figures were not supplied, so individual pieces are not ranked in this report."],
      ];
    }
    return [
      [`Created and published ${tot} pieces of content (${c.reels} Reels, ${c.posts} posts${c.car ? `, ${c.car} carousels` : ""}) focused on product visibility, brand positioning and audience engagement.`],
      [fest.length ? `Marked ${fest.map((x) => fDay(x.date)).join(" and ")} with a festival post to stay present in the community’s conversation.` : "No festival or occasion content was published this month."],
      [c.reels ? `Published ${c.reels} Reels designed to reach new audiences${A.data.ig.nonFol != null ? `; ${PCT(A.data.ig.nonFol)} of views came from non-followers` : ""}.` : "No Reels were published this month."],
      [A.hasMeta ? `Managed 1 Meta campaign focused on ${GOAL[A.rw.focus](A)}, with ${INR(A.data.meta.spend)} in spend over the period.` : "No paid media data was included this month."],
      [A.topViews ? `Reviewed performance across all ${tot} pieces and identified the ${cdesc(A.topViews)} as the strongest for views (${K(A.topViews.views)}).` : NA],
    ];
  },
  ig_what: (A) => [
    A.data.ig.nonFol != null
      ? `${A.monthName} delivered strong discovery: ${PCT(A.data.ig.nonFol)} of ${f0(A.data.ig.views)} views came from non-followers. ${A.lead ? A.lead.name + " were" : "Content was"} the main reach driver, while follower growth (${sgn(A.data.ig.net)}) stayed far smaller than total content consumption.`
      : `The account recorded ${f0(A.data.ig.views)} views and ${sgn(A.data.ig.net)} net followers.`,
  ],
  ig_means: (A) => [`Most people watching are new to the brand. That is valuable for awareness, but it also means few of them are being turned into followers yet.${A.vpf ? ` At this rate it takes roughly ${f0(A.vpf)} views to earn one follower.` : ""}`],
  ig_next: (A) => [`Add a clear follow or enquire prompt to the highest-reach ${A.lead ? A.lead.name : "content"}, and keep publishing the formats that reached new audiences.`],
  ig_eng: (A) => {
    const ig = A.data.ig, p: string[] = [];
    if (ig.engaged != null) p.push(`${f0(ig.engaged)} accounts engaged with the content${ig.unique ? `, out of ${f0(ig.unique)} accounts reached` : ""}.`);
    if (A.interactions != null) p.push(`Interactions totalled ${f0(A.interactions)}: ${[["likes", ig.likes], ["comments", ig.comments], ["shares", ig.shares], ["saves", ig.saves]].filter(([, v]) => v != null).map(([l, v]) => `${f0(v as number)} ${l}`).join(", ")}.`);
    if (A.accountER != null) p.push(`That is an account engagement rate of ${PCT(A.accountER, 2)} of accounts reached.`);
    if (ig.followersStart != null && ig.followers != null) p.push(`Followers moved from ${f0(ig.followersStart)} to ${f0(ig.followers)} over the month.`);
    return [p.join(" ") || NA];
  },
  cw: (A) => [
    [A.lead && A.other ? `${A.lead.name} reached more people: ${K(A.lead.avg)} average views against ${K(A.other.avg)} for ${A.other.name}.` : NA],
    [A.topViews ? `The ${cdesc(A.topViews)} (${A.topViews.theme.toLowerCase()}) led on views, reach and shares.` : NA],
    [A.themes[0] ? `${A.themes[0].name} content had the highest average views (${K(A.themes[0].avg)}).` : NA],
  ],
  cn: (A) => {
    const last = A.themes[A.themes.length - 1];
    return [
      [A.other && A.lead ? `${A.other.name} earned fewer views per piece (${K(A.other.avg)}) than ${A.lead.name}.` : NA],
      [A.themes.length > 1 ? `${last.name} content had the lowest average views (${K(last.avg)}), from ${last.n} piece${last.n > 1 ? "s" : ""}.` : NA],
      [A.counts.car ? NA : "No carousels were published, so there is insufficient data to compare them."],
    ];
  },
  ct: (A) => [
    ["Test a follow or enquiry call-to-action on the top-reaching Reels and compare follower gain per 1,000 views."],
    [A.counts.car ? "Compare carousel engagement with single posts." : "Publish 2 carousels to learn whether multi-slide content improves saves and shares."],
    [A.other && A.lead && (A.other.er ?? 0) > (A.lead.er ?? 0) ? `Use ${A.other.name} for conversation and engagement (${PCT(A.other.er, 2)} average engagement rate against ${PCT(A.lead.er, 2)}), and ${A.lead.name} for reach.` : "Repeat the top-performing theme in two new creative treatments."],
  ],
  pd_data: (A) => [A.hasMeta ? `${INR(A.data.meta.spend)} in spend produced ${A.data.meta.conv != null ? `${f0(A.data.meta.conv)} ${A.rw.many} at ${INR(A.cpr)} each` : "no results reported in the uploaded data"}.${A.data.meta.impr != null && A.data.meta.reach != null ? ` Ads were shown ${f0(A.data.meta.impr)} times to ${f0(A.data.meta.reach)} people.` : ""}` : "Meta Ads data was not included in this report."],
  pd_obs: (A) => [A.freq ? `On average each person saw the ads ${f2(A.freq)} times. The cost of reaching 1,000 views was ${INR(A.cpm)}.` : NA],
  pd_int: (A) => [!A.data.meta.conv ? NA : A.rw.key === "messaging"
    ? "The campaign is generating direct conversations at a steady cost. The uploaded data does not show how many of these became qualified enquiries, so conversation quality cannot be judged yet."
    : {
        enquiry: `The campaign is generating ${A.rw.many} at a measurable cost. The uploaded data does not show how many of these became qualified enquiries, so ${A.rw.one} quality cannot be judged yet.`,
        traffic: `The campaign is sending people to the website. The uploaded data does not show what they did there, so the quality of this traffic cannot be judged yet.`,
        sales: `Meta recorded ${A.rw.many} from the campaign. These are Meta's own count, so they should be checked against the client's sales records before being treated as sales.`,
        other: `The uploaded data shows the results Meta recorded for the campaign objective. What these results led to cannot be judged from the uploaded data.`,
      }[A.rw.focus]],
  pd_act: (A) => [!A.hasMeta ? "Meta Ads data was not included in this report." : A.rw.key === "messaging"
    ? "Track which conversations turn into qualified enquiries and test two or three creative angles at a similar budget, so the cost per conversation can be compared fairly."
    : `${{
        enquiry: `Track which ${A.rw.few} turn into qualified enquiries`,
        traffic: "Track what visitors do on the website",
        sales: "Compare Meta's purchase count with the client's own sales records",
        other: "Agree which business outcome the campaign should be judged on",
      }[A.rw.focus]} and test two or three creative angles at a similar budget, so the cost per ${A.rw.one} can be compared fairly.`],
  camp_obs: (A) => [A.hasMeta && A.data.meta.conv != null ? `The campaign generated ${f0(A.data.meta.conv)} ${A.rw.many} at an average cost of ${INR(A.cpr)} per ${A.rw.one}.` : NA],
  camp_int: (A) => [A.rw.key === "messaging"
    ? "At the current spend level the campaign is successfully generating direct conversations. The next focus should be improving the share of conversations that become qualified enquiries. No sales claims are made without sales data."
    : `At the current spend level the campaign is producing ${A.rw.many}. ${{
        enquiry: `The next focus should be improving the share of ${A.rw.few} that become qualified enquiries.`,
        traffic: "The next focus should be turning more of these visits into enquiries or sales on the website.",
        sales: "The next focus should be confirming these purchases against the client's own records.",
        other: "The next focus should be linking these results to a business outcome the client can track.",
      }[A.rw.focus]} No sales claims are made without sales data.`],
  imp: (A) => [`Visibility, discovery and ${A.rw.focus === "traffic" ? "website visits" : "enquiries"} are different things. Views and impressions show how many people saw the brand. Non-follower share shows whether new people are finding it.${A.hasMeta && A.data.meta.conv != null ? ` ${A.rw.Title} show ${A.rw.meaning}.` : A.hasEngagement ? " Accounts engaged show how many people interacted with the content." : ""} Qualified leads, bookings and sales only appear when the client provides them.`],
  rc: (A) => [
    [!A.listed ? "Record views, reach and interactions for each post next month, so the content mix can be steered by what performs best." : A.lead && A.other ? `Increase the share of ${A.lead.name} in the content mix: they averaged ${f1(A.ratio)}× the views of ${A.other.name}. Keep ${A.other.name} for storytelling, where engagement rates ran ${(A.other.er ?? 0) > (A.lead.er ?? 0) ? "higher" : "lower"} (${PCT(A.other.er, 2)} against ${PCT(A.lead.er, 2)}).` : NA],
    [A.hasMeta ? (A.data.meta.conv != null ? `Keep the ${A.rw.kind} campaign running and test two or three creative and message angles, while tracking the quality of the ${f0(A.data.meta.conv)} ${A.rw.few}.` : "Report the campaign's results alongside spend next month, so cost per result can be judged.") : "Paid media data was not included this month. If wider reach is a goal, a small Meta test would show what paid distribution adds to organic content."],
    [A.data.ig.nonFol != null ? `Protect the strength in new-audience reach (${PCT(A.data.ig.nonFol)} non-followers) and give new viewers a reason to follow, such as a recognisable series format.` : NA],
    [!A.listed ? "Pick the month’s best-performing posts in Insights and rebuild their structure in new creatives, testing one change at a time." : A.topViews ? `Rebuild the structure of the ${cdesc(A.topViews)} (${K(A.topViews.views)} views). Visual traits need creative-file review, so treat them as hypotheses.` : NA],
    [A.vpf ? `Add stronger follow, profile and enquiry prompts to high-reach content. ${f0(A.data.ig.views)} views earned ${sgn(A.data.ig.net)} net followers.` : NA],
  ],
  mom: () => ["Compared with last month, the figures below use the previous-month data supplied. Percentage change is (current − previous) ÷ previous. Rows without data in both months are left blank rather than estimated."],
};

/** Sentences appended by "Expand". Never introduce new figures here. */
export const EXT: Record<string, (A: Analysis) => string> = {
  exec: (A) => `Every figure is taken from the uploaded platform screenshots for ${fLong(A.data.period.start)} to ${fLong(A.data.period.end)}.`,
  ig_what: (A) => `Calculated from ${f0(A.c.length)} published pieces and the account-level Insights screenshot.`,
  pd_int: () => "Interpretation is limited to what the uploaded Ads Manager data shows.",
};

/** Admin-only confidence per block. Never rendered for the client. */
export const CONF: Record<string, Confidence> = {
  exec: "high", t: "high", w: "high", ig_what: "high", ig_means: "medium", ig_next: "medium",
  cw: "medium", cn: "medium", ct: "medium", pd_data: "high", pd_obs: "high", pd_int: "medium",
  pd_act: "medium", ig_eng: "high", camp_obs: "high", camp_int: "medium", imp: "high", rc: "medium", why: "low",
};

/** "Why it performed this way" for one piece. Hedged: visual causes are never claimed. */
export function whyText(x: ContentItem, A: Analysis): string {
  const rc = A.rating(x)[1];
  const fmt = A.fm.find((f) => f.name === x.type + "s");
  if (x.id === A.topViews?.id) {
    return `Likely contributing factors based on available data: ${A.lead && x.type === "Reel" && A.ratio && A.other ? `Reels averaged ${f1(A.ratio)}× the views of ${A.other.name.toLowerCase()} this month` : "format"}, and a ${x.theme.toLowerCase()} theme. Visual hook: ${NA.toLowerCase()}`;
  }
  return rc === "low"
    ? `Likely contributing factors based on available data: ${x.type.toLowerCase()} format averaged ${K(fmt?.avg)} views this month. ${NA}`
    : `Likely contributing factors based on available data: ${x.type.toLowerCase()} format and ${x.theme.toLowerCase()} theme. ${NA}`;
}

/** How many wordings a block has (the "next wording" option cycles through them). */
export function variantCount(id: string, A: Analysis): number {
  const [b, i] = id.split(".");
  if (b === "why" || !G[b]) return 1;
  const r = G[b](A);
  const sub = (i != null ? r[+i] : r) as string[] | undefined;
  return sub?.length ?? 1;
}

/** Generated text for a block id such as "exec", "t.2" or "why.c1", at the given variant. */
export function gen(id: string, A: Analysis, variant = 0): string {
  const [b, i] = id.split(".");
  if (b === "why") {
    const item = A.data.content.find((x) => x.id === i);
    return item ? whyText(item, A) : "";
  }
  const f = G[b];
  if (!f) return "";
  const r = f(A);
  const sub = (i != null ? r[+i] : r) as string[] | undefined;
  if (!sub || !sub.length) return "";
  return sub[variant % sub.length];
}

/** Text for a copy block: the reviewer's edit if any, else the generated variant. */
export function blockText(doc: Pick<ReportDoc, "texts" | "variant">, A: Analysis, id: string): string {
  return doc.texts[id] ?? gen(id, A, doc.variant[id] || 0);
}
