import { COMPANY_DESIGN, FONT_VAR, GROUP_DESIGN, designFor, type CompanyDesign } from "@/domain/design";
import type { Company } from "@/lib/workspace";

/** Exact colour values from the Company OS design. */
export const C = {
  bg: "#ECEAE5", ink: "#141414", line: "#DCD8D0", line2: "#E7E4DD", muted: "#6B6A66", faint: "#8E8C86", body: "#4E4D49",
  soft: "#E4E1DA", warnBg: "#F3E7C4", warnFg: "#5a4300", warnFg2: "#7a5b00", red: "#B3261E", redBg: "#F6DAD7", dashed: "#C9C5BC",
  btnLine: "#CFCBC2", colBg: "#E4E1DA", headBg: "#F4F2EE", sideInk: "#E9E7E2", navInk: "#BDBBB5", card: "#F7F6F3",
};

export type Theme = {
  side: string; hi: string; acc: string; font: string; name: string; own: string; treat: string;
  /** Main button colour (More of Us: red; others: the brand's sidebar colour). */ btn: string; short: string;
  logo: { src: string; bg: string; size: string; dark: boolean } | null; isGroup: boolean; design: CompanyDesign | null;
};

const DARK_LOGO_BG = new Set(["#3E5E49", "#3E5D48"]);

export function companyTheme(c: Pick<Company, "slug" | "name" | "sidebar_color" | "accent_color" | "short_name">): Theme {
  const known = Boolean(COMPANY_DESIGN[c.slug.replace(/^demo-/, "")]);
  const d = designFor(c.slug);
  return {
    side: known ? d.side : c.sidebar_color ?? d.side, hi: known ? d.hi : c.accent_color ?? d.hi, acc: d.acc, font: FONT_VAR[d.font],
    btn: /more-of-us/.test(c.slug) ? d.acc : known ? d.side : c.sidebar_color ?? d.side, short: c.short_name ?? c.name,
    name: c.name, own: d.own, treat: d.treat, isGroup: false, design: d,
    logo: d.logo ? { src: `/logos/${d.logo.key}.png`, bg: d.logo.bg, size: d.logo.size, dark: DARK_LOGO_BG.has(d.logo.bg) } : null,
  };
}

export function groupTheme(name: string): Theme {
  const g = GROUP_DESIGN;
  return { side: g.side, hi: g.hi, acc: g.hi, font: FONT_VAR.newsreader, name, own: g.own, treat: g.treat, isGroup: true, design: null, btn: g.side, short: name.replace(/ group$/i, ""),
    logo: { src: "/logos/diwani.png", bg: g.logo.bg, size: g.logo.size, dark: false } };
}
