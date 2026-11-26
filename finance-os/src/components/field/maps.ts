"use client";

/**
 * Browser helpers for Field Sales: the phone's location and the Google Maps JavaScript API.
 * The Maps key is read from NEXT_PUBLIC_GOOGLE_MAPS_KEY (set in Vercel). Without it, nothing loads
 * and the screens fall back to lists and plain Google Maps links.
 */

export const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
export const hasMapsKey = () => MAPS_KEY.length > 0;

export type Fix = { lat: number; lng: number; accuracy: number };

/** One location reading. High accuracy, 15 seconds, a reading up to 30 seconds old is fine. */
export function getPosition(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return reject(new Error("This phone or browser cannot share location."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1 ? "Location is blocked. Allow location for this site in the browser settings." : "Could not get your location. Try again in the open.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  });
}

// The Maps JavaScript API has no bundled types here; the few calls used are typed loosely on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GoogleNS = any;
let loading: Promise<GoogleNS> | null = null;

/** Loads the Maps JavaScript API once (with Places). Rejects when there is no key or the script fails. */
export function loadMaps(): Promise<GoogleNS> {
  if (!hasMapsKey()) return Promise.reject(new Error("No Maps key"));
  const w = window as unknown as { google?: GoogleNS; __dpMapsReady?: () => void };
  if (w.google?.maps?.Map) return Promise.resolve(w.google);
  loading ??= new Promise((resolve, reject) => {
    w.__dpMapsReady = () => resolve(w.google);
    const s = document.createElement("script");
    const q = new URLSearchParams({ key: MAPS_KEY, libraries: "places", v: "weekly", loading: "async", callback: "__dpMapsReady", region: "IN", language: "en" });
    s.src = `https://maps.googleapis.com/maps/api/js?${q}`;
    s.async = true;
    s.onerror = () => { loading = null; reject(new Error("Google Maps did not load")); };
    document.head.appendChild(s);
  });
  return loading;
}

export const BENGALURU = { lat: 12.9716, lng: 77.5946 };
