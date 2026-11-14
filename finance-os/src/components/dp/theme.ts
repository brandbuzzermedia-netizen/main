import { COMPANY_DESIGN, FONT_VAR, GROUP_DESIGN, designFor, type CompanyDesign } from "@/domain/design";
import type { Company } from "@/lib/workspace";

/** Exact colour values from the Company OS design. */
export const C = {
  bg: "#F5F1E8", ink: "#171817", line: "#e2dcc9", line2: "#efe9d9", muted: "#6d7a70", faint: "#829487", body: "#55605a",
  soft: "#E3E8DF", warnBg: "#F3E7C4", warnFg: "#5a4300", warnFg2: "#7a5b00", red: "#8C2F39", redBg: "#F5DADA", dashed: "#cfc8b5",
  btnLine: "#d9d3c0", colBg: "#EBE5D3", headBg: "#F8F5EC", sideInk: "#E9E4D6", navInk: "#D5DCD1",
};

export type Theme = {
  side: string; hi: string; acc: string; font: string; name: string; own: string; treat: string;
  logo: { src: string; bg: string; size: string; dark: boolean } | null; isGroup: boolean; design: CompanyDesign | null;
};

const DARK_LOGO_BG = new Set(["#3E5E49", "#3E5D48"]);

export function companyTheme(c: Pick<Company, "slug" | "name" | "sidebar_color" | "accent_color">): Theme {
  const known = Boolean(COMPANY_DESIGN[c.slug.replace(/^demo-/, "")]);
  const d = designFor(c.slug);
  return {
    side: known ? d.side : c.sidebar_color ?? d.side, hi: known ? d.hi : c.accent_color ?? d.hi, acc: d.acc, font: FONT_VAR[d.font],
    name: c.name, own: d.own, treat: d.treat, isGroup: false, design: d,
    logo: d.logo ? { src: `/logos/${d.logo.key}.png`, bg: d.logo.bg, size: d.logo.size, dark: DARK_LOGO_BG.has(d.logo.bg) } : null,
  };
}

export function groupTheme(name: string): Theme {
  const g = GROUP_DESIGN;
  return { side: g.side, hi: g.hi, acc: g.hi, font: FONT_VAR.newsreader, name, own: g.own, treat: g.treat, isGroup: true, design: null,
    logo: { src: "/logos/diwani.png", bg: g.logo.bg, size: g.logo.size, dark: false } };
}
