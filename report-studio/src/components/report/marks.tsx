import type { CSSProperties } from "react";
import type { Brand, ContentItem } from "@/lib/report/types";
import { mix } from "@/lib/format";
import { ArtShapes, type ArtKey } from "./industry-art";

/** Where a logo sits: the cover's brand colour, or a light or dark page. */
export type Surface = "cover" | "page" | "page-dark";

const isDark = (hex: string) => {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 150;
};

/**
 * The backing colour behind a logo on a surface, or null for none. Light logos
 * get a dark backing on light pages, dark logos a white one on dark grounds,
 * and logos with their own background ("boxed") never need one. Logos saved
 * before tones were measured keep the original rule: white on the cover only.
 */
export function logoPlate(brand: Brand, on: Surface): string | null {
  if (!brand.logo) return null;
  const mode = brand.logoPlate ?? "auto";
  if (mode === "none") return null;
  if (mode === "white") return "#fff";
  const ground = on === "cover" ? isDark(brand.primary) : on === "page-dark";
  switch (brand.logoTone) {
    case "boxed": return null;
    case "light": return ground ? null : isDark(brand.primary) ? brand.primary : "#191816";
    case "dark": return ground ? "#fff" : null;
    default: return on === "cover" ? "#fff" : null;
  }
}

export const GBS_BEE = "/brand/bee.png";

/** The GBS bee. Always used small, never stretched. */
export function GbsMark({ brand, size = 22 }: { brand: Brand; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={brand.gbs || GBS_BEE} alt="Get Bee Seen" style={{ height: size, width: "auto", display: "block" }} />;
}

/** Client logo, or the industry mark plus the client's name when no logo was supplied. */
function ClientMark({ name, brand, size, art = "door" }: { name: string; brand: Brand; size: number; art?: ArtKey }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (brand.logo) return <img src={brand.logo} alt={name} style={{ height: size }} />;
  const [first, ...rest] = name.split(" ");
  return (
    <>
      {art === "door" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <rect x="6" y="2.5" width="12" height="19" />
          <path d="M6 12h12M12 2.5v19" opacity=".6" />
          <circle cx="15" cy="12" r=".9" fill="currentColor" />
        </svg>
      ) : art === "none" ? null : (
        <svg viewBox="0 0 300 420" fill="none" stroke="currentColor" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <ArtShapes art={art} color="currentColor" />
        </svg>
      )}
      <span>
        {first}
        {rest.length ? (
          <>
            {" "}
            <i style={{ fontSize: ".5em", opacity: 0.7, fontStyle: "normal", fontFamily: "var(--sans)", letterSpacing: ".14em", textTransform: "uppercase" }}>
              {rest.join(" ")}
            </i>
          </>
        ) : null}
      </span>
    </>
  );
}

export function ClientWord({ name, brand, size, art, on = "page" }: { name: string; brand: Brand; size?: number; art?: ArtKey; on?: Surface }) {
  const plate = logoPlate(brand, on);
  const px = size || 22;
  const style: CSSProperties = { ...(size ? { fontSize: size } : {}), ...(plate ? { background: plate, padding: `${Math.round(px * 0.28)}px ${Math.round(px * 0.4)}px`, borderRadius: 4 } : {}) };
  return (
    <span className="cw" style={size || plate ? style : undefined}>
      <ClientMark name={name} brand={brand} size={Math.round(px * 1.4)} art={art} />
    </span>
  );
}

/**
 * Placeholder cover until a real cover image is uploaded, derived from the
 * client palette. The demo keeps the prototype's door drawing; other clients
 * get a neutral frame so no product is implied.
 */
export function CoverArt({ item, index, brand, motif = "plain" }: { item: ContentItem; index: number; brand: Brand; motif?: "door" | "plain" | ArtKey }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (item.img) return <img src={item.img} alt="" />;
  const i = Math.max(0, index), b = brand.primary, a = brand.accent;
  const bg = [mix(b, "#000", 0.15), mix(b, "#fff", 0.14), mix(b, a, 0.25), mix(b, "#000", 0.35), mix(b, "#fff", 0.26), mix(b, a, 0.42), mix(b, "#000", 0.05)][i % 7];
  const dx = ((i * 13) % 22) - 11;
  return (
    <svg viewBox="0 0 100 125" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="100" height="125" fill={bg} />
      {motif === "door" ? (
        <g transform={`translate(${dx} 0)`} fill="none" stroke={a} strokeWidth=".9">
          <rect x="26" y="22" width="48" height="86" />
          <rect x="31" y="28" width="38" height="34" />
          <rect x="31" y="68" width="38" height="34" />
          <circle cx="66" cy="66" r="1.6" fill={a} />
        </g>
      ) : motif !== "plain" && motif !== "none" ? (
        // The client's industry drawing, small, on the placeholder tile.
        <g transform={`translate(${23 + dx / 4} 19) scale(.18)`} fill="none" stroke={a} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
          <ArtShapes art={motif} color={a} />
        </g>
      ) : (
        <g fill="none" stroke={a} strokeWidth=".9">
          <rect x="14" y="16" width="72" height="93" />
          {item.type === "Carousel" ? <><rect x="20" y="22" width="60" height="81" opacity=".6" /><rect x="26" y="28" width="48" height="69" opacity=".35" /></> : null}
          <path d={`M14 ${70 + (dx % 9)}h72`} opacity=".45" />
        </g>
      )}
      {item.type === "Reel" ? (
        <g transform="translate(82 14)">
          <circle r="7" fill="rgba(0,0,0,.45)" />
          <path d="M-2.4-3.6L3.6 0-2.4 3.6z" fill="#fff" />
        </g>
      ) : null}
    </svg>
  );
}
