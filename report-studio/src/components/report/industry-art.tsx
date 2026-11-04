// Line drawings of a client's kind of product, for covers and post
// placeholders when no photo was uploaded. They are generic illustrations of
// the industry, drawn in the client's accent colour, never a claim about the
// client's actual products. The door is the prototype's original drawing.
import type { ReactNode } from "react";

export const ART_OPTIONS = [
  ["door", "Door"], ["chair", "Office chair"], ["sofa", "Sofa and frame"], ["building", "Buildings"],
  ["health", "Healthcare / diagnostics"], ["fashion", "Fashion"], ["tech", "Laptop / technology"],
  ["education", "Education"], ["factory", "Manufacturing"], ["food", "Food and hospitality"],
  ["jewellery", "Jewellery"], ["briefcase", "Professional services"], ["travel", "Travel"], ["retail", "Retail"],
  ["none", "No drawing"],
] as const;
export type ArtKey = (typeof ART_OPTIONS)[number][0];

// First match wins, most specific first.
const RULES: [ArtKey, RegExp][] = [
  ["door", /\bdoors?\b|hardware|windows?\b|gates?\b/i],
  ["chair", /ergonom|chair|seating|office furni/i],
  ["jewellery", /jewel|\bgold\b|diamond|silver/i],
  ["health", /health|diagnos|clinic|hospital|medic|pharma|\blab\b|dental|wellness|patholog/i],
  ["education", /educat|school|college|academy|coaching|training|learning|universit/i],
  ["food", /hotel|hospitality|restaurant|cafe|café|food|catering|bakery|resort|kitchen/i],
  ["travel", /travel|tour|trail|trek|holiday|adventure/i],
  ["building", /real ?estate|realty|propert|construct|architect|builder|developer|infra/i],
  ["fashion", /fashion|apparel|cloth|boutique|garment|textile|wear\b/i],
  ["tech", /tech|software|\bit\b|saas|digital|\bapps?\b|electronic/i],
  ["factory", /manufactur|industr|engineer|factory|machin|plastic|steel/i],
  ["sofa", /furniture|interior|decor|home|sofa|living|wood/i],
  ["retail", /retail|store|shop|commerce|mart/i],
  ["briefcase", /consult|legal|\blaw\b|account|financ|professional|insurance|bank|agency|services/i],
];

/** The drawing for a client: their chosen one, or one matched from the industry. */
export function artFor(industry: string | null | undefined, chosen?: string | null): ArtKey {
  if (chosen && chosen !== "auto" && ART_OPTIONS.some(([k]) => k === chosen)) return chosen as ArtKey;
  const text = industry ?? "";
  return RULES.find(([, re]) => re.test(text))?.[0] ?? "none";
}

const grid = (x: number, y: number, cols: number, rows: number, w: number, h: number, gx: number, gy: number) => {
  const out: ReactNode[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(<rect key={`${x}-${r}-${c}`} x={x + c * gx} y={y + r * gy} width={w} height={h} />);
  return out;
};
const teeth = (cx: number, cy: number, r: number, n: number) =>
  Array.from({ length: n }, (_, i) => <rect key={i} x={cx - 7} y={cy - r - 16} width="14" height="18" transform={`rotate(${(360 / n) * i} ${cx} ${cy})`} />);

/** The drawing itself, in a 300 x 420 box. Strokes only; the caller sets stroke and stroke-width. */
export function ArtShapes({ art, color }: { art: ArtKey; color: string }): ReactNode {
  switch (art) {
    case "door":
      return <>
        <rect x="40" y="20" width="220" height="380" />
        <rect x="62" y="44" width="176" height="150" />
        <rect x="62" y="214" width="176" height="164" />
        <path d="M62 119h176M150 44v150M62 296h176M150 214v164" opacity=".35" />
        <circle cx="224" cy="206" r="5" fill={color} />
      </>;
    case "chair":
      return <>
        <rect x="95" y="40" width="110" height="150" rx="30" />
        <path d="M112 150q38 18 76 0" opacity=".45" />
        <path d="M150 190v25" />
        <rect x="75" y="215" width="150" height="38" rx="16" />
        <path d="M70 185v45h20M230 185v45h-20" />
        <rect x="143" y="253" width="14" height="68" />
        <path d="M150 321L72 352M150 321L228 352M150 321L106 372M150 321L194 372M150 321v40" />
        {[[72, 360], [228, 360], [106, 380], [194, 380], [150, 369]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="7" />)}
      </>;
    case "sofa":
      return <>
        <rect x="105" y="60" width="90" height="70" />
        <rect x="115" y="70" width="70" height="50" opacity=".45" />
        <rect x="40" y="170" width="220" height="90" rx="18" />
        <rect x="25" y="200" width="40" height="100" rx="14" />
        <rect x="235" y="200" width="40" height="100" rx="14" />
        <rect x="65" y="255" width="85" height="45" rx="8" />
        <rect x="150" y="255" width="85" height="45" rx="8" />
        <path d="M55 300v25M245 300v25M20 345h260" />
      </>;
    case "building":
      return <>
        <rect x="70" y="40" width="110" height="360" />
        <rect x="180" y="150" width="70" height="250" />
        <g opacity=".55">{grid(86, 62, 4, 10, 14, 18, 22, 32)}{grid(196, 172, 2, 7, 14, 18, 26, 32)}</g>
        <path d="M30 400h240M110 400v-40h30v40" />
      </>;
    case "health":
      return <>
        <circle cx="150" cy="95" r="48" />
        <path d="M150 70v50M125 95h50" />
        {[95, 137, 179].map((x, i) => <g key={x}><rect x={x} y="175" width="26" height="150" rx="13" /><path d={`M${x} ${250 - i * 20}h26`} opacity=".55" /></g>)}
        <path d="M70 300h160M80 300v60M220 300v60M60 360h180" />
      </>;
    case "fashion":
      return <>
        <path d="M150 88v-14q0-10 9-16q12-8 6-20q-5-8-15-8q-12 0-15 12" />
        <path d="M150 88L58 148h184z" />
        <path d="M118 148l-14 62l-42 170h176l-42-170l-14-62" />
        <path d="M104 210h92" opacity=".5" />
        <path d="M150 210v170" opacity=".3" />
      </>;
    case "tech":
      return <>
        <rect x="60" y="110" width="180" height="125" rx="8" />
        <rect x="72" y="122" width="156" height="101" opacity=".45" />
        <path d="M90 150h60M90 170h100M90 190h40" opacity=".6" />
        <path d="M35 250h230l-15 22H50z" />
        <rect x="200" y="285" width="52" height="95" rx="9" />
        <path d="M218 368h16" />
      </>;
    case "education":
      return <>
        <path d="M150 75L60 110l90 35l90-35z" />
        <path d="M100 128v34q50 26 100 0v-34M240 110v48" />
        <circle cx="240" cy="162" r="5" fill={color} />
        <path d="M150 340q-50-30-110-15V195q60-15 110 15z" />
        <path d="M150 340q50-30 110-15V195q-60-15-110 15z" />
        <path d="M70 230q35-6 62 8M70 260q35-6 62 8M168 238q27-14 62-8M168 268q27-14 62-8" opacity=".45" />
      </>;
    case "factory":
      return <>
        <g>{teeth(125, 190, 60, 10)}</g>
        <circle cx="125" cy="190" r="60" />
        <circle cx="125" cy="190" r="20" />
        <g>{teeth(205, 290, 40, 8)}</g>
        <circle cx="205" cy="290" r="40" />
        <circle cx="205" cy="290" r="13" />
        <path d="M40 380h220" opacity=".5" />
      </>;
    case "food":
      return <>
        <path d="M120 120q-10-20 0-40M150 112q-10-20 0-40M180 120q-10-20 0-40" opacity=".5" />
        <circle cx="150" cy="168" r="9" />
        <path d="M70 262a80 80 0 0 1 160 0" />
        <path d="M45 262h210M75 282h150" />
        <path d="M95 345h110l-10 30h-90z" />
        <path d="M205 352q22 0 22 12t-22 12" />
      </>;
    case "jewellery":
      return <>
        <path d="M100 110h100l42 52l-92 118l-92-118z" />
        <path d="M58 162h184M100 110l22 52l28 118M200 110l-22 52l-28 118M122 162l28-52l28 52" opacity=".55" />
        <circle cx="150" cy="335" r="38" />
        <path d="M138 290l12-14l12 14" />
      </>;
    case "briefcase":
      return <>
        <path d="M115 150v-25q0-12 12-12h46q12 0 12 12v25" />
        <rect x="50" y="150" width="200" height="170" rx="14" />
        <path d="M50 215h200" />
        <rect x="138" y="204" width="24" height="24" rx="3" />
        <path d="M80 360h140M100 385h100" opacity=".45" />
      </>;
    case "travel":
      return <>
        <circle cx="222" cy="110" r="28" />
        <path d="M30 350L120 180l50 80l40-50l60 140z" />
        <path d="M120 180l-18 34l18-8l14 12" opacity=".55" />
        <path d="M150 350q34-34 4-62q-24-22 10-44" opacity=".5" strokeDasharray="6 8" />
      </>;
    case "retail":
      return <>
        <path d="M80 150h140l16 222H64z" />
        <path d="M115 150v-25a35 35 0 0 1 70 0v25" />
        <path d="M64 330h172" opacity=".45" />
      </>;
    default:
      return <>
        <rect x="40" y="20" width="220" height="380" />
        <rect x="70" y="60" width="160" height="300" opacity=".45" />
      </>;
  }
}

/** The drawing as a standalone cover illustration. */
export function IndustryArt({ art, color }: { art: ArtKey; color: string }) {
  return (
    <svg viewBox="0 0 300 420" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ArtShapes art={art} color={color} />
    </svg>
  );
}
