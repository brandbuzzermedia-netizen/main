"use client";
// Client logo, cover image and report colours. Choosing a logo suggests a
// palette from it (ported from the prototype's derivePalette); the colours
// can then be adjusted before saving.
import { useActionState, useRef, useState } from "react";
import type { BrandFormState, FormAction } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { mix, toHex } from "@/lib/format";
import type { ClientBrand } from "@/lib/data/repo";

/** Most common saturated colour in the image, ignoring transparency, white and greys. */
function derivePalette(img: HTMLImageElement): string | null {
  const c = document.createElement("canvas"), x = c.getContext("2d");
  if (!x) return null;
  c.width = c.height = 48;
  x.drawImage(img, 0, 0, 48, 48);
  const d = x.getImageData(0, 0, 48, 48).data, b: Record<string, number> = {};
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    const r = d[i], g = d[i + 1], bl = d[i + 2], mx = Math.max(r, g, bl), mn = Math.min(r, g, bl);
    if ((mx > 235 && mn > 225) || mx - mn < 22) continue;
    const k = [r, g, bl].map((v) => Math.round(v / 32) * 32).join(",");
    b[k] = (b[k] || 0) + 1;
  }
  const top = Object.entries(b).sort((a, z) => z[1] - a[1])[0];
  return top ? toHex(top[0].split(",").map((v) => Math.min(255, Number(v)))) : null;
}

export function BrandForm({ clientId, brand, action: save }: { clientId: string; brand: ClientBrand; action: FormAction<BrandFormState> }) {
  const [state, action, pending] = useActionState<BrandFormState, FormData>(save, {});
  const [primary, setPrimary] = useState(brand.primary);
  const [accent, setAccent] = useState(brand.accent);
  const [logo, setLogo] = useState<string | null>(brand.logo);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onLogo = (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setLogo(url);
    const img = new Image();
    img.onload = () => {
      const c = derivePalette(img);
      if (c) {
        setPrimary(c);
        setAccent(mix(c, "#C08A3E", 0.6));
        setNote("Colours suggested from the logo. Adjust them if needed, then save.");
      } else setNote("No strong colour found in the logo. Choose the colours below.");
    };
    img.src = url;
  };

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="clientId" value={clientId} />
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-24 w-56 place-items-center overflow-hidden rounded-2xl p-3" style={{ background: primary }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="Client logo preview" className="max-h-full max-w-full" />
          ) : (
            <span className="font-heading text-sm font-bold" style={{ color: accent }}>No logo yet</span>
          )}
        </div>
        <div className="grid gap-1 text-[12.5px] text-muted-foreground">
          <span>Preview of the report cover colours.</span>
          <span className="flex items-center gap-2"><i className="inline-block size-3 rounded-full" style={{ background: primary }} /> Main {primary.toUpperCase()}</span>
          <span className="flex items-center gap-2"><i className="inline-block size-3 rounded-full" style={{ background: accent }} /> Accent {accent.toUpperCase()}</span>
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5">
        <Label>
          Logo (PNG with transparent background works best)
          <input ref={fileRef} type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="text-xs" onChange={(e) => onLogo(e.target.files?.[0])} />
          {brand.logo ? <span className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="removeLogo" /> Remove current logo</span> : null}
        </Label>
        <Label>
          Cover image (optional)
          <input type="file" name="cover" accept="image/png,image/jpeg,image/webp" className="text-xs" />
          {brand.cover ? <span className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="removeCover" /> Remove current cover</span> : null}
        </Label>
        <Label>
          Main colour
          <input type="color" name="primary" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-9 w-16 rounded-lg border border-border bg-card p-0.5" />
        </Label>
        <Label>
          Accent colour
          <input type="color" name="accent" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-9 w-16 rounded-lg border border-border bg-card p-0.5" />
        </Label>
      </div>
      {note ? <p className="text-[12.5px] text-muted-foreground">{note}</p> : null}
      {state.error ? <p role="alert" className="text-sm text-bad">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm text-ok">Saved. Every report for this client now uses this branding.</p> : null}
      <div><Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save branding"}</Button></div>
    </form>
  );
}
