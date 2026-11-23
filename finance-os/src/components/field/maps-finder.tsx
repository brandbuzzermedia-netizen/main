"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { distanceKm, formatKm, navigateUrl, SEGMENT_LABEL, SEGMENTS, type Point, type Segment } from "@/lib/field-sales";
import { BENGALURU, getPosition, hasMapsKey, loadMaps, type GoogleNS } from "./maps";
import { big, bigPrimary } from "./field-client";

type Result = {
  name: string; address: string | null; lat: number; lng: number; place_id: string | null; phone: string | null;
  rating: number | null; reviews: number | null; website: string | null; type: string | null; mapsUrl: string | null; open: boolean;
};
type AddFn = (rows: unknown, segment: string, area: string, toField: boolean) => Promise<{ added: number; skipped: number; error?: string }>;

const CHIPS: [string, Segment][] = [["Car detailing", "car_detailing"], ["Ceramic coating", "car_detailing"], ["Car wash", "car_detailing"], ["Car service garage", "garage"],
  ["Tyre and alignment", "garage"], ["Used car dealer", "used_car_dealer"]];
const FIELDS = ["id", "displayName", "formattedAddress", "location", "nationalPhoneNumber", "rating", "userRatingCount", "websiteURI", "primaryTypeDisplayName", "businessStatus", "googleMapsURI"];
const line = "#E4E0D6", muted = "#6B6B6B";
const field: CSSProperties = { width: "100%", minHeight: 48, border: `1px solid ${line}`, borderRadius: 24, padding: "10px 18px", fontSize: 16, background: "#fff", boxSizing: "border-box", boxShadow: "0 1px 4px rgba(0,0,0,.08)" };

/**
 * Google-Maps-style finder: search a place or a kind of business, search the area on screen or near you,
 * see results on the map with rating and reviews, then add the ones you want as leads (and optionally to
 * the field visit list). Results are only shown; only the businesses you add are saved.
 */
export function MapsFinder({ known, add, defaultToField = true }: { known: string[]; add: AddFn; defaultToField?: boolean }) {
  const knownSet = useMemo(() => new Set(known), [known]);
  const [q, setQ] = useState("");
  const [seg, setSeg] = useState<Segment>("car_detailing");
  const [results, setResults] = useState<Result[]>([]);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [minReviews, setMinReviews] = useState(0);
  const [toField, setToField] = useState(defaultToField);
  const [here, setHere] = useState<Point | null>(null);
  const [msg, setMsg] = useState(hasMapsKey() ? "" : "Google Maps is not switched on yet: add NEXT_PUBLIC_GOOGLE_MAPS_KEY in Vercel and redeploy.");
  const [busy, setBusy] = useState(false);
  const [moved, setMoved] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const div = useRef<HTMLDivElement>(null);
  const map = useRef<GoogleNS>(null);
  const pins = useRef<GoogleNS[]>([]);
  const me = useRef<GoogleNS>(null);
  const [ready, setReady] = useState(false);
  const key = (r: Result) => r.place_id ?? `${r.lat},${r.lng}`;
  const isKnown = (r: Result) => Boolean(r.place_id && (knownSet.has(r.place_id) || added.has(r.place_id)));

  useEffect(() => {
    if (!hasMapsKey() || !div.current) return;
    loadMaps().then((google: GoogleNS) => {
      map.current = new google.maps.Map(div.current, { center: BENGALURU, zoom: 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, gestureHandling: "greedy", clickableIcons: false });
      map.current.addListener("dragend", () => setMoved(true));
      map.current.addListener("zoom_changed", () => setMoved(true));
      setReady(true);
    }).catch(() => setMsg("Google Maps did not load. Check the key and that Maps JavaScript API and Places API (New) are enabled."));
  }, []);

  const shown = results.filter((r) => (r.reviews ?? 0) >= minReviews);
  useEffect(() => {
    if (!ready) return;
    const google = (window as unknown as { google: GoogleNS }).google;
    pins.current.forEach((p) => p.setMap(null));
    pins.current = shown.map((r, i) => {
      const m = new google.maps.Marker({ position: { lat: r.lat, lng: r.lng }, map: map.current, title: r.name, zIndex: active === key(r) ? 999 : i,
        label: { text: String(i + 1), color: "#fff", fontSize: "11px", fontWeight: "700" },
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: active === key(r) ? 14 : 11, fillColor: isKnown(r) ? "#6B7280" : "#EA4335", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 } });
      m.addListener("click", () => { setActive(key(r)); document.getElementById(`res-${i}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }); });
      return m;
    });
  }, [ready, shown, active]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (text: string, area: "screen" | "near" | "city") => {
    if (!hasMapsKey()) return;
    setBusy(true); setMsg(""); setPick(new Set()); setActive(null);
    try {
      const google = await loadMaps();
      const { Place } = await google.maps.importLibrary("places");
      const req: Record<string, unknown> = { textQuery: text, fields: FIELDS, maxResultCount: 20, region: "in", language: "en" };
      let center = here;
      if (area === "near") {
        const f = await getPosition(); center = f; setHere(f);
        req.locationBias = { center: f, radius: 3000 };
        if (ready) {
          me.current?.setMap(null);
          me.current = new google.maps.Marker({ position: f, map: map.current, title: "You", icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#1A73E8", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 } });
        }
      } else if (area === "screen" && ready && map.current.getBounds()) {
        req.locationRestriction = map.current.getBounds();
      } else {
        req.locationBias = { center: BENGALURU, radius: 30000 };
      }
      const { places } = await Place.searchByText(req);
      const found: Result[] = (places ?? []).filter((p: GoogleNS) => p.location && p.businessStatus !== "CLOSED_PERMANENTLY").map((p: GoogleNS) => ({
        name: String(p.displayName ?? "").slice(0, 200), address: p.formattedAddress ?? null, lat: p.location.lat(), lng: p.location.lng(), place_id: p.id ?? null,
        phone: p.nationalPhoneNumber ?? null, rating: typeof p.rating === "number" ? p.rating : null, reviews: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
        website: p.websiteURI ?? null, type: p.primaryTypeDisplayName ?? null, mapsUrl: p.googleMapsURI ?? null, open: p.businessStatus === "OPERATIONAL",
      }));
      if (center) found.sort((a, b) => distanceKm(center!, a) - distanceKm(center!, b));
      setResults(found);
      setMoved(false);
      if (ready && found.length) {
        const b = new google.maps.LatLngBounds();
        found.forEach((r) => b.extend({ lat: r.lat, lng: r.lng }));
        if (center) b.extend(center);
        map.current.fitBounds(b, 40);
      }
      setMsg(found.length ? `${found.length} places for "${text}"${area === "near" ? " near you" : area === "screen" ? " in this area" : ""}.` : `Nothing found for "${text}". Try another word or zoom out.`);
    } catch (e) {
      setMsg(e instanceof Error && /location/i.test(e.message) ? e.message : "Search failed. Check the Maps key has Places API (New) enabled.");
    } finally { setBusy(false); }
  };
  const save = (rows: Result[]) => {
    setBusy(true);
    add(rows.map((r) => ({ name: r.name, address: r.address, lat: r.lat, lng: r.lng, place_id: r.place_id, phone: r.phone, rating: r.rating, reviews: r.reviews, website: r.website })), seg, "", toField)
      .then((res) => {
        setMsg(res.error ? `Not saved: ${res.error}` : `Added ${res.added} lead(s)${res.skipped ? `; ${res.skipped} were already in the OS` : ""}.${toField && res.added ? " They are on your field visit list." : ""}`);
        if (!res.error) { setAdded((cur) => new Set([...cur, ...rows.map((r) => r.place_id).filter(Boolean) as string[]])); setPick(new Set()); }
      }).finally(() => setBusy(false));
  };
  const text = q.trim();
  const chosen = shown.filter((r) => pick.has(key(r)));

  return (
    <div style={{ display: "grid", gap: 10, paddingBottom: chosen.length ? 90 : 0 }}>
      <form onSubmit={(e) => { e.preventDefault(); if (text) void run(text, moved ? "screen" : here ? "near" : "city"); }} style={{ position: "relative" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Google Maps" aria-label="Search Google Maps" enterKeyHint="search" style={field} />
        <button disabled={!text || busy || !hasMapsKey()} style={{ position: "absolute", right: 6, top: 5, height: 38, borderRadius: 19, border: 0, background: "#1A73E8", color: "#fff", fontWeight: 700, padding: "0 16px" }}>{busy ? "…" : "Search"}</button>
      </form>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
        {CHIPS.map(([label, s]) => (
          <button key={label} type="button" disabled={busy || !hasMapsKey()} onClick={() => { setQ(label); setSeg(s); void run(`${label} in Bengaluru`, moved ? "screen" : here ? "near" : "city"); }}
            style={{ flex: "none", minHeight: 40, borderRadius: 20, border: `1px solid ${line}`, background: "#fff", padding: "0 14px", fontSize: 14, fontWeight: 600, boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>{label}</button>
        ))}
      </div>
      <div style={{ position: "relative" }}>
        <div ref={div} role="region" aria-label="Google map" style={{ height: hasMapsKey() ? "45vh" : 0, minHeight: hasMapsKey() ? 260 : 0, borderRadius: 14, border: hasMapsKey() ? `1px solid ${line}` : 0, background: "#EAE6DA" }} />
        {ready && moved && text && <button type="button" onClick={() => void run(text, "screen")} style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", ...big, minHeight: 40, borderRadius: 20, boxShadow: "0 2px 8px rgba(0,0,0,.2)" }}>Search this area</button>}
        {ready && <button type="button" onClick={() => void run(text || `${SEGMENT_LABEL[seg]}`, "near")} aria-label="Near me" style={{ position: "absolute", right: 10, bottom: 10, ...big, minHeight: 44, borderRadius: 22, boxShadow: "0 2px 8px rgba(0,0,0,.2)" }}>Near me</button>}
      </div>
      {msg && <div role="status" style={{ fontSize: 13.5, color: msg.startsWith("Not saved") || msg.startsWith("Google Maps is not") ? "#B42318" : muted }}>{msg}</div>}
      {results.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13.5 }}>
          <label>Reviews <select value={minReviews} onChange={(e) => setMinReviews(Number(e.target.value))} style={{ minHeight: 36, borderRadius: 8, border: `1px solid ${line}` }}>
            {[0, 20, 50, 100, 250].map((n) => <option key={n} value={n}>{n ? `${n}+` : "Any"}</option>)}</select></label>
          <button type="button" onClick={() => setPick(new Set(shown.filter((r) => !isKnown(r)).map(key)))} style={{ ...big, minHeight: 36, fontSize: 13.5, padding: "0 12px" }}>Select all new</button>
          <span style={{ color: muted }}>{shown.length} shown</span>
        </div>
      )}
      <div>
        {shown.map((r, i) => {
          const k = key(r), known = isKnown(r);
          return (
            <div key={k} id={`res-${i}`} onClick={() => { setActive(k); if (ready) map.current.panTo({ lat: r.lat, lng: r.lng }); }}
              style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, padding: "12px 4px", borderTop: `1px solid ${line}`, background: active === k ? "#F3F7FE" : "transparent", borderRadius: 8 }}>
              <input type="checkbox" aria-label={`Select ${r.name}`} disabled={known} checked={pick.has(k)} onClick={(e) => e.stopPropagation()}
                onChange={(e) => setPick((cur) => { const n = new Set(cur); if (e.target.checked) n.add(k); else n.delete(k); return n; })} style={{ width: 24, height: 24, marginTop: 2 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15.5 }}>{i + 1}. {r.name}</div>
                <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>
                  {r.rating !== null && <span style={{ color: "#B06000", fontWeight: 700 }}>{r.rating.toFixed(1)} ★ </span>}
                  {r.reviews !== null && <span>({r.reviews}) </span>}{r.type && <span>· {r.type} </span>}{here && <span>· {formatKm(distanceKm(here, r))}</span>}
                  {!r.open && <span style={{ color: "#B42318" }}> · may be closed</span>}
                </div>
                {r.address && <div style={{ fontSize: 13, color: muted }}>{r.address}</div>}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                  {known ? <span style={{ ...big, minHeight: 38, fontSize: 13, color: muted }}>Added</span>
                    : <button type="button" disabled={busy} onClick={() => save([r])} style={{ ...bigPrimary, minHeight: 38, fontSize: 13.5, padding: "0 12px" }}>Add lead</button>}
                  <a href={navigateUrl(r)} target="_blank" rel="noopener noreferrer" style={{ ...big, minHeight: 38, fontSize: 13.5, padding: "0 12px" }}>Directions</a>
                  {r.phone && <a href={`tel:${r.phone.replace(/\s/g, "")}`} style={{ ...big, minHeight: 38, fontSize: 13.5, padding: "0 12px" }}>Call</a>}
                  {r.mapsUrl && <a href={r.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ ...big, minHeight: 38, fontSize: 13.5, padding: "0 12px" }}>Reviews</a>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {results.length > 0 && <div style={{ fontSize: 12.5, color: muted }}>Results are shown live from Google and are not saved. Only the businesses you add become leads.</div>}
      {chosen.length > 0 && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: "calc(64px + env(safe-area-inset-bottom, 0px))", zIndex: 30, background: "#fff", borderTop: `1px solid ${line}`, padding: "10px 16px", display: "grid", gap: 8, boxShadow: "0 -4px 16px rgba(0,0,0,.08)" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13.5 }}>
            <select value={seg} onChange={(e) => setSeg(e.target.value as Segment)} aria-label="Segment" style={{ minHeight: 38, borderRadius: 8, border: `1px solid ${line}` }}>{SEGMENTS.map((s) => <option key={s} value={s}>{SEGMENT_LABEL[s]}</option>)}</select>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={toField} onChange={(e) => setToField(e.target.checked)} style={{ width: 20, height: 20 }} />Also add to field visits</label>
          </div>
          <button type="button" disabled={busy} onClick={() => save(chosen)} style={{ ...bigPrimary, minHeight: 50 }}>Add {chosen.length} as leads</button>
        </div>
      )}
    </div>
  );
}
