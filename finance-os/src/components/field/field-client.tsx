"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import {
  autoPick, distanceKm, formatKm, hasPoint, MAX_ROUTE_STOPS, navigateUrl, nearestNext, OUTCOME_LABEL, OUTCOMES, routeUrl, SEGMENT_LABEL, SEGMENTS,
  STATUS_COLOUR, STATUS_LABEL, toPoint, type FieldStatus, type Point, type Segment,
} from "@/lib/field-sales";
import { BENGALURU, getPosition, hasMapsKey, loadMaps, type Fix, type GoogleNS } from "./maps";

export type FieldLead = {
  id: string; company_name: string | null; full_name: string; phone_e164: string | null; whatsapp_e164: string | null; area: string | null; address: string | null;
  field_status: FieldStatus; field_segment: Segment | null; lat: number | null; lng: number | null; place_id: string | null; next_follow_up_on: string | null; owner_back_at: string | null;
};

const ink = "#141414", muted = "#6B6B6B", line = "#E4E0D6";
/** Big, thumb-friendly controls. */
export const big: CSSProperties = { minHeight: 48, borderRadius: 10, fontSize: 15.5, fontWeight: 700, padding: "12px 16px", border: `1px solid ${line}`, background: "#fff", color: ink, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", fontFamily: "inherit", boxSizing: "border-box" };
export const bigPrimary: CSSProperties = { ...big, background: "var(--co-btn)", color: "#fff", border: 0 };
const field: CSSProperties = { width: "100%", minHeight: 46, border: `1px solid ${line}`, borderRadius: 10, padding: "10px 12px", fontSize: 16, background: "#fff", boxSizing: "border-box", fontFamily: "inherit" };

export function StatusChip({ s }: { s: FieldStatus }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: STATUS_COLOUR[s] }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: STATUS_COLOUR[s] }} />{STATUS_LABEL[s]}</span>;
}
const name = (l: FieldLead) => l.company_name || l.full_name;

// ---- Check-in ----

/** Tap "Check in": the phone's location is read, then one tap on what happened logs the visit. */
export function CheckIn({ action, startOpen = false }: { action: (fd: FormData) => Promise<void>; startOpen?: boolean }) {
  const [state, setState] = useState<"idle" | "locating" | "ready">(startOpen ? "ready" : "idle");
  const [fix, setFix] = useState<Fix | null>(null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const locate = () => {
    setState("locating"); setErr("");
    getPosition().then((f) => { setFix(f); setState("ready"); }).catch((e: Error) => { setErr(e.message); setState("ready"); });
  };
  if (state === "idle") return <button type="button" onClick={locate} style={{ ...bigPrimary, width: "100%", minHeight: 56, fontSize: 17 }}>Check in here</button>;
  return (
    <form action={(fd) => start(() => action(fd))} style={{ display: "flex", flexDirection: "column", gap: 10, border: `2px solid var(--co-btn)`, borderRadius: 12, padding: 14, background: "#fff" }}>
      <div style={{ fontSize: 13.5, color: err ? "#B42318" : muted }} role="status">
        {state === "locating" ? "Getting your location…" : fix ? `Location captured (±${Math.round(fix.accuracy)} m), ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : err ? `${err} You can still log the visit without it.` : <button type="button" onClick={locate} style={{ ...big, minHeight: 40 }}>Add my location</button>}
      </div>
      <input type="hidden" name="lat" value={fix?.lat ?? ""} /><input type="hidden" name="lng" value={fix?.lng ?? ""} /><input type="hidden" name="accuracy" value={fix?.accuracy ?? ""} />
      <details>
        <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600, padding: "6px 0" }}>Owner back at, amount, note (optional)</summary>
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <label style={{ fontSize: 13, color: muted }}>Owner back at<input type="datetime-local" name="owner_back_at" style={field} /></label>
          <label style={{ fontSize: 13, color: muted }}>Amount collected (₹)<input name="amount" inputMode="decimal" placeholder="e.g. 7500" style={field} /></label>
          <label style={{ fontSize: 13, color: muted }}>Note<input name="note" maxLength={2000} placeholder="What they said" style={field} /></label>
        </div>
      </details>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {OUTCOMES.map((o) => (
          <button key={o} name="outcome" value={o} disabled={pending || state === "locating"}
            style={{ ...big, minHeight: 54, gridColumn: o === "not_interested" ? "1 / -1" : undefined, background: o === "paid_advance" ? "#059669" : o === "not_interested" ? "#fff" : "#F6F3EA", color: o === "paid_advance" ? "#fff" : ink, opacity: pending ? 0.6 : 1 }}>
            {OUTCOME_LABEL[o]}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setState("idle")} style={{ ...big, minHeight: 40, fontSize: 13.5, border: 0, background: "transparent", color: muted }}>Cancel</button>
    </form>
  );
}

// ---- Lead list with Near me ----

export function LeadRow({ l, slug, km }: { l: FieldLead; slug: string; km?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderTop: `1px solid ${line}` }}>
      <a href={`/c/${slug}/field/leads/${l.id}`} style={{ flex: 1, minWidth: 0, color: ink, textDecoration: "none", minHeight: 44 }}>
        <div style={{ fontWeight: 700, fontSize: 15.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name(l)}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 3, fontSize: 13, color: muted }}>
          <StatusChip s={l.field_status} />{l.area && <span>{l.area}</span>}{km !== undefined && <b style={{ color: ink }}>{formatKm(km)}</b>}
          {l.next_follow_up_on && <span>Follow up {l.next_follow_up_on.slice(8, 10)}/{l.next_follow_up_on.slice(5, 7)}</span>}
        </div>
      </a>
      <a href={navigateUrl(l)} target="_blank" rel="noopener noreferrer" aria-label={`Navigate to ${name(l)}`} style={{ ...big, minWidth: 48, padding: "0 12px" }}>Go</a>
    </div>
  );
}

export function NearMeList({ leads, slug, empty }: { leads: FieldLead[]; slug: string; empty?: ReactNode }) {
  const [here, setHere] = useState<Point | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const sorted = useMemo(() => {
    if (!here) return leads.map((l) => ({ l, km: undefined as number | undefined }));
    const withKm = leads.map((l) => ({ l, km: hasPoint(l) ? distanceKm(here, toPoint(l)!) : undefined }));
    return withKm.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
  }, [leads, here]);
  return (
    <div>
      <button type="button" disabled={busy} onClick={() => { setBusy(true); setMsg(""); getPosition().then((f) => setHere(f)).catch((e: Error) => setMsg(e.message)).finally(() => setBusy(false)); }}
        style={{ ...bigPrimary, width: "100%", marginBottom: 8 }}>{busy ? "Finding you…" : here ? "Near me: refresh" : "Near me"}</button>
      {msg && <div role="status" style={{ color: "#B42318", fontSize: 13.5, marginBottom: 8 }}>{msg}</div>}
      {here && <div style={{ fontSize: 13, color: muted, marginBottom: 4 }}>Sorted by distance from you. Leads without a pin are at the end.</div>}
      {sorted.length === 0 ? empty : sorted.map(({ l, km }) => <LeadRow key={l.id} l={l} slug={slug} km={km} />)}
    </div>
  );
}

// ---- Address with Google Places autocomplete ----

/** Address, area and the map pin. With a Maps key, a Google search box fills them; without one, type the address and tap "Use my location" at the shop. */
export function AddressField({ address, area, lat, lng, placeId, readLink }: { address: string; area: string; lat: number | null; lng: number | null; placeId: string;
  readLink?: (url: string) => Promise<{ name: string | null; lat: number | null; lng: number | null; query: string | null } | { error: string }> }) {
  const [link, setLink] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [addr, setAddr] = useState(address);
  const [ar, setAr] = useState(area);
  const [pt, setPt] = useState<Point | null>(lat !== null && lng !== null ? { lat, lng } : null);
  const [pid, setPid] = useState(placeId);
  const [msg, setMsg] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMapsKey() || !box.current) return;
    let el: HTMLElement | null = null;
    loadMaps().then(async (google: GoogleNS) => {
      const places = google.maps.places ?? (await google.maps.importLibrary("places"));
      if (!places?.PlaceAutocompleteElement || !box.current) throw new Error("Places is not enabled for this key");
      el = new places.PlaceAutocompleteElement({ includedRegionCodes: ["in"], locationBias: { center: BENGALURU, radius: 40000 } });
      el!.setAttribute("placeholder", "Search the business on Google Maps");
      el!.style.width = "100%";
      box.current.appendChild(el!);
      const pick = async (place: GoogleNS) => {
        await place.fetchFields({ fields: ["formattedAddress", "location", "id", "addressComponents", "displayName"] });
        setAddr(place.formattedAddress ?? "");
        setPt({ lat: place.location.lat(), lng: place.location.lng() });
        setPid(place.id ?? "");
        const comp = (place.addressComponents ?? []) as { types: string[]; longText: string }[];
        const sub = comp.find((c) => c.types.includes("sublocality_level_1")) ?? comp.find((c) => c.types.includes("sublocality")) ?? comp.find((c) => c.types.includes("neighborhood"));
        if (sub) setAr(sub.longText);
        const company = document.querySelector<HTMLInputElement>("input[name=company_name]");
        if (company && !company.value && place.displayName) company.value = place.displayName;
      };
      el!.addEventListener("gmp-select", (e: Event) => { void pick((e as unknown as { placePrediction: GoogleNS }).placePrediction.toPlace()); });
      el!.addEventListener("gmp-placeselect", (e: Event) => { void pick((e as unknown as { place: GoogleNS }).place); });
    }).catch(() => setMsg("Google search is not available right now. Type the address, and tap Use my location at the shop."));
    return () => { el?.remove(); };
  }, []);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {readLink && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a Google Maps link" aria-label="Google Maps link" inputMode="url" style={field} />
          <button type="button" disabled={!link.trim() || linkBusy} style={{ ...big, minHeight: 46 }} onClick={() => {
            setLinkBusy(true); setMsg("");
            readLink(link).then((r) => {
              if ("error" in r) { setMsg(r.error); return; }
              if (r.lat !== null && r.lng !== null) { setPt({ lat: r.lat, lng: r.lng }); setPid(""); }
              if (r.query && /,/.test(r.query) && !addr) setAddr(r.query);
              const company = document.querySelector<HTMLInputElement>("input[name=company_name]");
              if (company && !company.value && r.name) company.value = r.name;
              setMsg(r.lat !== null ? `Filled from the link${r.name ? `: ${r.name}` : ""}.` : "Name filled. The link had no pin: tap Use my location at the shop.");
              setLink("");
            }).catch(() => setMsg("Could not read that link.")).finally(() => setLinkBusy(false));
          }}>{linkBusy ? "Reading…" : "Fill"}</button>
        </div>
      )}
      {hasMapsKey() && <div ref={box} aria-label="Search Google Maps" />}
      {msg && <div style={{ fontSize: 13, color: muted }}>{msg}</div>}
      <label style={{ fontSize: 13, color: muted }}>Address<textarea name="address" rows={2} maxLength={500} value={addr} onChange={(e) => setAddr(e.target.value)} style={{ ...field, minHeight: 64 }} /></label>
      <label style={{ fontSize: 13, color: muted }}>Area / locality<input name="area" maxLength={120} value={ar} onChange={(e) => setAr(e.target.value)} placeholder="e.g. HSR Layout" style={field} /></label>
      <input type="hidden" name="lat" value={pt?.lat ?? ""} /><input type="hidden" name="lng" value={pt?.lng ?? ""} /><input type="hidden" name="place_id" value={pt ? pid : ""} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 13.5 }}>
        <button type="button" onClick={() => { setMsg(""); getPosition().then((f) => { setPt({ lat: f.lat, lng: f.lng }); setPid(""); }).catch((e: Error) => setMsg(e.message)); }} style={{ ...big, minHeight: 44 }}>Use my location</button>
        {pt ? <span>Pin set: {pt.lat.toFixed(5)}, {pt.lng.toFixed(5)} · <button type="button" onClick={() => { setPt(null); setPid(""); }} style={{ border: 0, background: "none", color: "#B42318", cursor: "pointer", padding: 0, fontSize: 13.5 }}>Remove</button></span> : <span style={{ color: muted }}>No pin yet</span>}
      </div>
    </div>
  );
}

// ---- Today's route ----

export function RouteBuilder({ slug, leads, initial, today, save }: { slug: string; leads: FieldLead[]; initial: string[]; today: string; save: (ids: string[]) => Promise<void> }) {
  const byId = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const [ids, setIds] = useState<string[]>(initial.filter((x) => byId.has(x)));
  const [here, setHere] = useState<Point | null>(null);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const [picking, setPicking] = useState(false);
  const stops = ids.map((x) => byId.get(x)!).filter(Boolean);
  const link = routeUrl(here, stops.filter(hasPoint).map((s) => toPoint(s)!));
  const persist = (next: string[]) => { setIds(next); start(() => save(next)); };
  const withLocation = (then: (p: Point) => void) => { setMsg("Getting your location…"); getPosition().then((f) => { setHere(f); setMsg(""); then(f); }).catch((e: Error) => setMsg(e.message)); };
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button type="button" onClick={() => withLocation((p) => persist(nearestNext(p, autoPick(leads, today, p)).map((l) => l.id)))} style={bigPrimary}>Auto-pick</button>
        <button type="button" disabled={!stops.length} onClick={() => withLocation((p) => persist(nearestNext(p, stops).map((l) => l.id)))} style={big}>Sort nearest</button>
      </div>
      {msg && <div role="status" style={{ fontSize: 13.5, color: msg.startsWith("Getting") ? muted : "#B42318", marginTop: 8 }}>{msg}</div>}
      {stops.length === 0 ? <div style={{ fontSize: 14, color: muted, padding: "14px 0" }}>No stops yet. Auto-pick takes follow-ups due and the nearest leads to visit, or add them by hand.</div> : (
        <ol style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          {stops.map((l, i) => (
            <li key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid ${line}` }}>
              <span style={{ width: 28, height: 28, borderRadius: "50%", background: STATUS_COLOUR[l.field_status], color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13, flex: "none" }}>{i + 1}</span>
              <a href={`/c/${slug}/field/leads/${l.id}`} style={{ flex: 1, minWidth: 0, color: ink, textDecoration: "none" }}>
                <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name(l)}</div>
                <div style={{ fontSize: 12.5, color: muted }}>{[l.area, here && hasPoint(l) ? formatKm(distanceKm(here, toPoint(l)!)) : null, !hasPoint(l) ? "no pin" : null].filter(Boolean).join(" · ")}</div>
              </a>
              <a href={navigateUrl(l)} target="_blank" rel="noopener noreferrer" aria-label={`Navigate to ${name(l)}`} style={{ ...big, minWidth: 48, padding: "0 12px" }}>Go</a>
              <button type="button" aria-label={`Remove ${name(l)}`} onClick={() => persist(ids.filter((x) => x !== l.id))} style={{ ...big, minWidth: 44, padding: 0, color: muted }}>×</button>
            </li>
          ))}
        </ol>
      )}
      {link && <a href={link} target="_blank" rel="noopener noreferrer" style={{ ...bigPrimary, width: "100%", marginTop: 10, minHeight: 56, fontSize: 17 }}>Open route in Google Maps ({stops.filter(hasPoint).length} stops)</a>}
      {link && <div style={{ fontSize: 12.5, color: muted, marginTop: 6 }}>Opens the Google Maps app with all stops in this order{here ? " from where you are" : ""}. Phone browsers without the app show only the first 3 stops.</div>}
      <div style={{ marginTop: 12 }}>
        {ids.length < MAX_ROUTE_STOPS && (picking ? (
          <select autoFocus defaultValue="" onChange={(e) => { if (e.target.value) persist([...ids, e.target.value]); setPicking(false); }} style={field} aria-label="Add a stop">
            <option value="">Choose a lead…</option>
            {leads.filter((l) => !ids.includes(l.id) && l.field_status !== "lost").map((l) => <option key={l.id} value={l.id}>{name(l)}{l.area ? ` · ${l.area}` : ""}</option>)}
          </select>
        ) : <button type="button" onClick={() => setPicking(true)} style={{ ...big, width: "100%" }}>+ Add a stop ({ids.length}/{MAX_ROUTE_STOPS})</button>)}
      </div>
      {pending && <div style={{ fontSize: 12.5, color: muted, marginTop: 6 }}>Saving…</div>}
    </div>
  );
}

// ---- Map ----

export function FieldMap({ slug, leads, today, areas }: { slug: string; leads: FieldLead[]; today: string; areas: string[] }) {
  const [seg, setSeg] = useState("");
  const [st, setSt] = useState("");
  const [area, setArea] = useState("");
  const [due, setDue] = useState(false);
  const [failed, setFailed] = useState(!hasMapsKey());
  const shown = leads.filter((l) => (!seg || l.field_segment === seg) && (!st || l.field_status === st) && (!area || l.area === area) && (!due || (l.next_follow_up_on !== null && l.next_follow_up_on <= today)));
  const div = useRef<HTMLDivElement>(null);
  const map = useRef<GoogleNS>(null);
  const markers = useRef<GoogleNS[]>([]);
  const info = useRef<GoogleNS>(null);
  const me = useRef<GoogleNS>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (failed || !div.current) return;
    loadMaps().then((google: GoogleNS) => {
      map.current = new google.maps.Map(div.current, { center: BENGALURU, zoom: 11, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, gestureHandling: "greedy", clickableIcons: false });
      info.current = new google.maps.InfoWindow();
      setReady(true);
    }).catch(() => setFailed(true));
  }, [failed]);
  useEffect(() => {
    if (!ready) return;
    const google = (window as unknown as { google: GoogleNS }).google;
    markers.current.forEach((m) => m.setMap(null));
    const bounds = new google.maps.LatLngBounds();
    markers.current = shown.filter(hasPoint).map((l) => {
      const m = new google.maps.Marker({ position: toPoint(l), map: map.current, title: name(l),
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: STATUS_COLOUR[l.field_status], fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 } });
      m.addListener("click", () => {
        const box = document.createElement("div");
        box.style.cssText = "font:14px system-ui,sans-serif;min-width:180px";
        const t = document.createElement("div"); t.textContent = name(l); t.style.cssText = "font-weight:700;margin-bottom:4px";
        const s = document.createElement("div"); s.textContent = `${STATUS_LABEL[l.field_status]}${l.area ? ` · ${l.area}` : ""}`; s.style.color = "#555";
        const row = document.createElement("div"); row.style.cssText = "display:flex;gap:12px;margin-top:8px";
        const open = document.createElement("a"); open.href = `/c/${slug}/field/leads/${l.id}`; open.textContent = "Open"; open.style.fontWeight = "700";
        const nav = document.createElement("a"); nav.href = navigateUrl(l); nav.target = "_blank"; nav.rel = "noopener noreferrer"; nav.textContent = "Navigate"; nav.style.fontWeight = "700";
        row.append(open, nav); box.append(t, s, row);
        info.current.setContent(box); info.current.open({ anchor: m, map: map.current });
      });
      bounds.extend(toPoint(l));
      return m;
    });
    if (markers.current.length > 1) map.current.fitBounds(bounds, 40);
    else if (markers.current.length === 1) { map.current.setCenter(bounds.getCenter()); map.current.setZoom(15); }
  }, [ready, shown, slug]);
  const locate = () => getPosition().then((f) => {
    const google = (window as unknown as { google?: GoogleNS }).google;
    if (!ready || !google) return;
    me.current?.setMap(null);
    me.current = new google.maps.Marker({ position: f, map: map.current, title: "You", icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: "#1A73E8", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 } });
    map.current.setCenter(f); map.current.setZoom(14);
  }).catch(() => undefined);
  const sel: CSSProperties = { ...field, minHeight: 44, fontSize: 14.5 };
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8, marginBottom: 10 }}>
        <select aria-label="Segment" value={seg} onChange={(e) => setSeg(e.target.value)} style={sel}><option value="">All segments</option>{SEGMENTS.map((s) => <option key={s} value={s}>{SEGMENT_LABEL[s]}</option>)}</select>
        <select aria-label="Status" value={st} onChange={(e) => setSt(e.target.value)} style={sel}><option value="">All statuses</option>{(Object.keys(STATUS_LABEL) as FieldStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
        <select aria-label="Area" value={area} onChange={(e) => setArea(e.target.value)} style={sel}><option value="">All areas</option>{areas.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        <label style={{ ...sel, display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={due} onChange={(e) => setDue(e.target.checked)} style={{ width: 20, height: 20 }} />Follow-ups due</label>
      </div>
      {!failed ? (
        <>
          <div ref={div} role="region" aria-label="Map of leads" style={{ height: "62vh", minHeight: 320, borderRadius: 12, border: `1px solid ${line}`, background: "#EAE6DA" }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "10px 0" }}>
            <button type="button" onClick={locate} style={big}>Show me</button>
            <span style={{ fontSize: 13, color: muted }}>{shown.filter(hasPoint).length} of {shown.length} shown have a pin.</span>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>{(Object.keys(STATUS_LABEL) as FieldStatus[]).map((s) => <StatusChip key={s} s={s} />)}</div>
        </>
      ) : (
        <div role="note" style={{ fontSize: 13.5, color: muted, background: "#F6F3EA", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
          {hasMapsKey() ? "Google Maps did not load. Showing the list instead; Navigate still opens Google Maps." : "Map view needs a Google Maps key (NEXT_PUBLIC_GOOGLE_MAPS_KEY). Showing the list instead; Navigate still opens Google Maps."}
        </div>
      )}
      <NearMeList leads={shown} slug={slug} empty={<div style={{ padding: "16px 0", color: muted }}>No leads match these filters.</div>} />
    </div>
  );
}

// ---- Quick add ----

/** Name, phone, segment: one tap saves it with the pin where you are standing. Details can be added later. */
export function QuickAdd({ action }: { action: (fd: FormData) => Promise<void> }) {
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [seg, setSeg] = useState<Segment>("car_detailing");
  const [msg, setMsg] = useState("");
  const submit = () => {
    if (!form.current?.reportValidity()) return;
    setBusy(true); setMsg("Getting your location…");
    const f = form.current;
    getPosition().then((p) => { f.lat.value = String(p.lat); f.lng.value = String(p.lng); })
      .catch(() => { f.lat.value = ""; f.lng.value = ""; })
      .finally(() => { setMsg("Saving…"); f.requestSubmit(); });
  };
  return (
    <form ref={form} action={action} style={{ display: "grid", gap: 10 }}>
      <input name="company_name" required maxLength={200} placeholder="Business name" aria-label="Business name" style={{ ...field, fontSize: 17 }} />
      <input name="phone" type="tel" inputMode="tel" placeholder="Phone (98xxxxxxxx)" aria-label="Phone" style={{ ...field, fontSize: 17 }} />
      <div role="radiogroup" aria-label="Segment" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {SEGMENTS.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={seg === s} onClick={() => setSeg(s)}
            style={{ ...big, minHeight: 46, background: seg === s ? "var(--co-btn)" : "#fff", color: seg === s ? "#fff" : ink }}>{SEGMENT_LABEL[s]}</button>
        ))}
      </div>
      <input type="hidden" name="segment" value={seg} /><input type="hidden" name="source" value="Walk-in" />
      <input type="hidden" name="lat" /><input type="hidden" name="lng" />
      <button type="button" onClick={submit} disabled={busy} style={{ ...bigPrimary, minHeight: 58, fontSize: 17 }}>{busy ? msg : "Save here"}</button>
      <div style={{ fontSize: 12.5, color: muted }}>Saves the pin where you are standing. Add the owner, address and notes later from the lead.</div>
    </form>
  );
}

// ---- Area search on Google Maps ----

type Found = { name: string; address: string | null; lat: number; lng: number; place_id: string | null; phone: string | null; known: boolean };

/** Searches Google Maps (e.g. "car detailing in HSR Layout"); only the shops you tick are saved. */
export function AreaSearch({ known, add }: { known: string[]; add: (rows: unknown, segment: string, area: string) => Promise<{ added: number; skipped: number; error?: string }> }) {
  const knownSet = useMemo(() => new Set(known), [known]);
  const [seg, setSeg] = useState<Segment>("car_detailing");
  const [area, setArea] = useState("");
  const [text, setText] = useState("");
  const [here, setHere] = useState<Point | null>(null);
  const [rows, setRows] = useState<Found[]>([]);
  const [pick, setPick] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState(hasMapsKey() ? "" : "Area search needs the Google Maps key (NEXT_PUBLIC_GOOGLE_MAPS_KEY). Use Paste a Google Maps link instead.");
  const [busy, setBusy] = useState(false);
  const words: Record<Segment, string> = { car_detailing: "car detailing", used_car_dealer: "used car dealer", garage: "car service garage", other: "" };
  const search = () => {
    const q = text.trim() || `${words[seg]} in ${area.trim() || "Bengaluru"}${area && !/bengaluru|bangalore/i.test(area) ? ", Bengaluru" : ""}`;
    setBusy(true); setMsg(""); setRows([]); setPick(new Set());
    loadMaps().then(async (google: GoogleNS) => {
      const { Place } = await google.maps.importLibrary("places");
      const { places } = await Place.searchByText({ textQuery: q, fields: ["id", "displayName", "formattedAddress", "location", "nationalPhoneNumber"],
        locationBias: { center: here ?? BENGALURU, radius: here ? 5000 : 30000 }, maxResultCount: 20, region: "in", language: "en" });
      const found: Found[] = (places ?? []).filter((p: GoogleNS) => p.location).map((p: GoogleNS) => ({
        name: String(p.displayName ?? "").slice(0, 200), address: p.formattedAddress ?? null, lat: p.location.lat(), lng: p.location.lng(),
        place_id: p.id ?? null, phone: p.nationalPhoneNumber ?? null, known: Boolean(p.id && knownSet.has(p.id)),
      }));
      setRows(found);
      setMsg(found.length ? `${found.length} found for "${q}". Tick the ones to visit.` : `Nothing found for "${q}".`);
    }).catch(() => setMsg("Google Maps search is not available right now.")).finally(() => setBusy(false));
  };
  const save = () => {
    const chosen = rows.filter((_, i) => pick.has(i)).map(({ known: _k, ...r }) => r); // eslint-disable-line @typescript-eslint/no-unused-vars
    setBusy(true);
    add(chosen, seg, area).then((r) => {
      setMsg(r.error ? `Not saved: ${r.error}` : `Added ${r.added} lead(s)${r.skipped ? `; ${r.skipped} were already in the OS` : ""}.`);
      if (!r.error) { setRows((cur) => cur.map((x, i) => (pick.has(i) ? { ...x, known: true } : x))); setPick(new Set()); }
    }).finally(() => setBusy(false));
  };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div role="radiogroup" aria-label="Segment" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {SEGMENTS.map((s) => <button key={s} type="button" role="radio" aria-checked={seg === s} onClick={() => setSeg(s)} style={{ ...big, minHeight: 44, background: seg === s ? "var(--co-btn)" : "#fff", color: seg === s ? "#fff" : ink }}>{SEGMENT_LABEL[s]}</button>)}
      </div>
      <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area, e.g. HSR Layout" aria-label="Area" style={field} />
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Or type your own search (optional)" aria-label="Search text" style={field} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button type="button" disabled={busy || !hasMapsKey()} onClick={search} style={bigPrimary}>{busy ? "Searching…" : "Search"}</button>
        <button type="button" disabled={busy} onClick={() => getPosition().then((f) => { setHere(f); setMsg("Searching near you."); }).catch((e: Error) => setMsg(e.message))} style={big}>{here ? "Near me: on" : "Near me"}</button>
      </div>
      {msg && <div role="status" style={{ fontSize: 13.5, color: msg.startsWith("Not saved") ? "#B42318" : muted }}>{msg}</div>}
      {rows.map((r, i) => (
        <label key={`${r.place_id}-${i}`} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0", borderTop: `1px solid ${line}`, opacity: r.known ? 0.55 : 1 }}>
          <input type="checkbox" disabled={r.known} checked={pick.has(i)} onChange={(e) => setPick((cur) => { const n = new Set(cur); if (e.target.checked) n.add(i); else n.delete(i); return n; })} style={{ width: 24, height: 24, marginTop: 2 }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: "block" }}>{r.name}</b>
            <span style={{ fontSize: 13, color: muted }}>{[r.phone, r.address].filter(Boolean).join(" · ")}{here ? ` · ${formatKm(distanceKm(here, r))}` : ""}{r.known ? " · already added" : ""}</span>
          </span>
        </label>
      ))}
      {rows.length > 0 && <button type="button" disabled={busy || pick.size === 0} onClick={save} style={{ ...bigPrimary, minHeight: 56 }}>Add {pick.size} selected</button>}
      <div style={{ fontSize: 12.5, color: muted }}>Results are only shown, not saved. Only the shops you tick are added as leads, with their pin and Google place ID.</div>
    </div>
  );
}
