"use client";
// Client logo, cover image and report colours. Choosing a logo suggests a
// palette from it (ported from the prototype's derivePalette); the colours
// can then be adjusted before saving.
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import type { BrandFormState, FormAction } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { mix, toHex } from "@/lib/format";
import type { ClientBrand } from "@/lib/data/repo";
import type { LogoTone } from "@/lib/report/types";
import { logoPlate } from "@/components/report/marks";
import { ART_OPTIONS, IndustryArt, artFor } from "@/components/report/industry-art";
import { measureLogo, removeBackground } from "@/lib/logo-tools";

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

export function BrandForm({ clientId, brand, industry, action: save }: { clientId: string; brand: ClientBrand; industry?: string | null; action: FormAction<BrandFormState> }) {
  const [state, action, saving] = useActionState<BrandFormState, FormData>(save, {});
  const [starting, start] = useTransition();
  const pending = saving || starting;
  const [primary, setPrimary] = useState(brand.primary);
  const [accent, setAccent] = useState(brand.accent);
  const [logo, setLogo] = useState<string | null>(brand.logo);
  const [note, setNote] = useState<string | null>(null);
  const [size, setSize] = useState<{ text: string; warn: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const [pickedLogo, setPickedLogo] = useState<string | null>(null);
  const [pickedCover, setPickedCover] = useState<string | null>(null);
  const [tone, setTone] = useState<LogoTone | null>(brand.logoTone ?? null);
  const [plate, setPlate] = useState<string>(brand.logoPlate ?? "auto");
  const [art, setArt] = useState<string>(brand.art ?? "auto");
  const [cleaning, setCleaning] = useState(false);
  // An older saved logo has no measured tone yet: measure it now.
  useEffect(() => { if (brand.logo && !brand.logoTone) void measureLogo(brand.logo).then(setTone).catch(() => {}); }, [brand.logo, brand.logoTone]);
  const preview = { primary, accent, logo, cover: null, gbs: null, logoTone: tone, logoPlate: plate as "auto" | "white" | "none" };
  const autoArt = artFor(industry, "auto");
  const artLabel = (k: string) => ART_OPTIONS.find(([v]) => v === k)?.[1] ?? k;

  /** Removes the plain background around the current logo; the result is saved with Save branding. */
  async function cleanBackground() {
    if (!logo || cleaning) return;
    setCleaning(true);
    try {
      const blob = await removeBackground(logo);
      const file = new File([blob], "logo-no-background.png", { type: "image/png" });
      const dt = new DataTransfer();
      dt.items.add(file);
      if (fileRef.current) fileRef.current.files = dt.files;
      const url = URL.createObjectURL(blob);
      setLogo(url); setPickedLogo(file.name);
      setTone(await measureLogo(url));
      setPlate("auto");
      setNote("Background removed. Check the previews, then press Save new branding. Not right? Pick the original file again.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "The background could not be removed.");
    } finally {
      setCleaning(false);
    }
  }
  // Once saved, the picked files are the current branding.
  useEffect(() => { if (state.saved) { setPickedLogo(null); setPickedCover(null); } }, [state]);

  const onLogo = (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setLogo(url);
    void measureLogo(url).then(setTone).catch(() => setTone(null));
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
    <form
      className="grid gap-4"
      // Through a transition, so a chosen file is not cleared if saving fails. The clicked button
      // (Delete logo / Delete cover image) is passed along as the submitter.
      onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter); start(() => action(fd)); }}
    >
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="logoTone" value={tone ?? ""} />
      <div className="flex flex-wrap items-center gap-4">
        {/* The logo as the cover shows it (on the client colour) and as page headers show it (on a light page). */}
        <div className="grid gap-1 text-center text-[11px] text-muted-foreground">
          <div className="relative grid h-24 w-56 place-items-center overflow-hidden rounded-2xl p-3" style={{ background: primary }}>
            {logo ? (
              <span className="grid h-full max-w-full place-items-center rounded-lg px-3 py-2" style={{ background: logoPlate(preview, "cover") ?? "transparent" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt="Client logo preview" className="max-h-full max-w-full object-contain" />
              </span>
            ) : (
              <span className="font-heading text-sm font-bold" style={{ color: accent }}>No logo yet</span>
            )}
          </div>
          Cover
        </div>
        {logo ? (
          <div className="grid gap-1 text-center text-[11px] text-muted-foreground">
            <div className="grid h-24 w-40 place-items-center rounded-2xl border border-border p-3" style={{ background: "#EBECE7" }}>
              <span className="grid h-10 max-w-full place-items-center rounded px-2 py-1" style={{ background: logoPlate(preview, "page") ?? "transparent" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt="" className="max-h-full max-w-full object-contain" />
              </span>
            </div>
            Page header
          </div>
        ) : null}
        {artFor(industry, art) !== "none" && !brand.cover ? (
          <div className="grid gap-1 text-center text-[11px] text-muted-foreground">
            <div className="grid h-24 w-[70px] place-items-center rounded-2xl p-2" style={{ background: primary }}><IndustryArt art={artFor(industry, art)} color={accent} /></div>
            Artwork
          </div>
        ) : null}
        <div className="grid gap-1 text-[12.5px] text-muted-foreground">
          <span>Preview of the report cover colours.</span>
          <span className="flex items-center gap-2"><i className="inline-block size-3 rounded-full" style={{ background: primary }} /> Main {primary.toUpperCase()}</span>
          <span className="flex items-center gap-2"><i className="inline-block size-3 rounded-full" style={{ background: accent }} /> Accent {accent.toUpperCase()}</span>
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5 [&>*]:min-w-0">
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
        <div className="grid content-start gap-1.5 text-sm font-medium">
          Logo background
          {logo ? (
            <Button type="button" size="sm" className="w-fit" disabled={cleaning} onClick={() => void cleanBackground()}>
              {cleaning ? "Removing…" : "Remove background"}
            </Button>
          ) : <span className="text-[11.5px] font-normal text-muted-foreground">Upload a logo first.</span>}
          <span className="text-[11.5px] font-normal text-muted-foreground">Removes the plain colour around the logo (for example a white or coloured box) and trims the edges.</span>
          <label className="mt-1 grid gap-1 text-[12.5px]">
            Backing behind the logo in reports
            <select name="logoPlate" value={plate} onChange={(e) => setPlate(e.target.value)} className="h-9 w-full min-w-0 rounded-xl border border-input bg-card px-2.5 text-sm font-normal text-foreground">
              <option value="auto">Automatic (only where it is needed)</option>
              <option value="none">None: the logo sits on the page</option>
              <option value="white">Always a white box</option>
            </select>
          </label>
        </div>
        <label className="grid content-start gap-1.5 text-sm font-medium">
          Report artwork
          <select name="art" value={art} onChange={(e) => setArt(e.target.value)} className="h-9 w-full min-w-0 rounded-xl border border-input bg-card px-2.5 text-sm font-normal text-foreground">
            <option value="auto">Automatic: {artLabel(autoArt)}</option>
            {ART_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          {industry ? <span className="text-[11.5px] font-normal text-muted-foreground">Automatic follows the industry: &ldquo;{industry}&rdquo;.</span> : null}
          <span className="text-[11.5px] font-normal text-muted-foreground">A line drawing of the client&apos;s kind of product, used on the cover (when there is no cover image) and on posts without a cover. It is a general illustration, not the client&apos;s actual product.</span>
        </label>
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
