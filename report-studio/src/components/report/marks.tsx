import type { Brand, ContentItem } from "@/lib/report/types";
import { mix } from "@/lib/format";

export const GBS_BEE = "/brand/bee.png";

/** The GBS bee. Always used small, never stretched. */
export function GbsMark({ brand, size = 22 }: { brand: Brand; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={brand.gbs || GBS_BEE} alt="Get Bee Seen" style={{ height: size, width: "auto", display: "block" }} />;
}

/** Client logo, or a door mark plus the client's name when no logo was supplied. */
function ClientMark({ name, brand, size }: { name: string; brand: Brand; size: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (brand.logo) return <img src={brand.logo} alt={name} style={{ height: size }} />;
  const [first, ...rest] = name.split(" ");
  return (
    <>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <rect x="6" y="2.5" width="12" height="19" />
        <path d="M6 12h12M12 2.5v19" opacity=".6" />
        <circle cx="15" cy="12" r=".9" fill="currentColor" />
      </svg>
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

export function ClientWord({ name, brand, size }: { name: string; brand: Brand; size?: number }) {
  return (
    <span className="cw" style={size ? { fontSize: size } : undefined}>
      <ClientMark name={name} brand={brand} size={Math.round((size || 22) * 1.4)} />
    </span>
  );
}

/**
 * Placeholder cover until a real cover image is uploaded, derived from the
 * client palette. The demo keeps the prototype's door drawing; other clients
 * get a neutral frame so no product is implied.
 */
export function CoverArt({ item, index, brand, motif = "plain" }: { item: ContentItem; index: number; brand: Brand; motif?: "door" | "plain" }) {
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
