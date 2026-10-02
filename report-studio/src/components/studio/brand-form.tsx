"use client";
// Client logo, cover image and report colours. Choosing a logo suggests a
// palette from it (ported from the prototype's derivePalette); the colours
// can then be adjusted before saving.
import { useActionState, useEffect, useRef, useState } from "react";
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
  const [size, setSize] = useState<{ text: string; warn: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const [pickedLogo, setPickedLogo] = useState<string | null>(null);
  const [pickedCover, setPickedCover] = useState<string | null>(null);
  // Once saved, the picked files are the current branding.
  useEffect(() => { if (state.saved) { setPickedLogo(null); setPickedCover(null); } }, [state]);

  const onLogo = (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setLogo(url);
    const img = new Image();
    img.onload = () => {
      // Reports draw the logo up to 160 px tall, and PDFs at twice that.
      const w = img.naturalWidth, h = img.naturalHeight, small = h < 320 && w < 600;
      setSize({ text: `This logo is ${w} × ${h} px.${small ? " It may look soft in the PDF: use one at least 320 px tall (or 600 px wide)." : ""}${file.size > 1024 * 1024 ? " It is over 1 MB; a smaller file keeps backups light." : ""}`, warn: small || file.size > 1024 * 1024 });
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
            // On a white plate, as the report shows it.
            <span className="grid h-full max-w-full place-items-center rounded-lg bg-white px-3 py-2"><img src={logo} alt="Client logo preview" className="max-h-full max-w-full object-contain" /></span>
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
          Logo
          <span className="flex flex-wrap items-center gap-2">
            {/* The label opens the file picker; the input itself stays hidden. */}
            <span className="inline-flex h-9 cursor-pointer items-center rounded-full border border-primary bg-primary px-4 text-[13px] font-bold text-gbs-ink hover:border-gbs-ink">
              {logo ? "Replace logo" : "Upload logo"}
            </span>
            {pickedLogo ? <span className="max-w-[160px] truncate text-xs font-normal">{pickedLogo}</span> : null}
          </span>
          <input ref={fileRef} type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { setPickedLogo(e.target.files?.[0]?.name ?? null); onLogo(e.target.files?.[0]); }} />
          <span className="text-[11.5px] font-normal text-muted-foreground">
            Best: PNG with a transparent background, trimmed close to the logo. A wide logo of about <b>1200 × 400 px</b> (at least 600 × 200 px), or a square one of about <b>600 × 600 px</b>. Under 1 MB.
          </span>
          {size ? <span role="status" className={`text-[11.5px] font-normal ${size.warn ? "text-warn" : "text-ok"}`}>{size.text}</span> : null}
        </Label>
        <Label>
          Cover image (optional)
          <span className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 cursor-pointer items-center rounded-full border border-border bg-card px-4 text-[13px] font-semibold hover:border-gbs-green">
              {brand.cover ? "Replace cover image" : "Upload cover image"}
            </span>
            {pickedCover ? <span className="max-w-[160px] truncate text-xs font-normal">{pickedCover}</span> : null}
          </span>
          <input ref={coverRef} type="file" name="cover" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => setPickedCover(e.target.files?.[0]?.name ?? null)} />
          <span className="text-[11.5px] font-normal text-muted-foreground">Fills the right half of the cover: a portrait photo of about <b>1200 × 1700 px</b> (JPG is fine). Under 2 MB.</span>
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
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : pickedLogo || pickedCover ? "Save new branding" : "Save branding"}</Button>
        {brand.logo ? (
          // The clicked button's name and value go with the form, so this saves with the logo removed.
          <Button type="submit" name="removeLogo" value="1" variant="destructive" disabled={pending} onClick={(e) => {
            if (!window.confirm("Delete this client's logo? Their reports will show the client name instead.")) { e.preventDefault(); return; }
            if (fileRef.current) fileRef.current.value = "";
            setLogo(null); setSize(null); setPickedLogo(null);
          }}>Delete logo</Button>
        ) : null}
        {brand.cover ? (
          <Button type="submit" name="removeCover" value="1" variant="destructive" disabled={pending} onClick={(e) => {
            if (!window.confirm("Delete this client's cover image?")) { e.preventDefault(); return; }
            if (coverRef.current) coverRef.current.value = "";
            setPickedCover(null);
          }}>Delete cover image</Button>
        ) : null}
      </div>
    </form>
  );
}
