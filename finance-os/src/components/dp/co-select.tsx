"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { C } from "./theme";

/** Picks which business a group screen shows (kept in the address as ?co=slug). */
export function CoSelect({ options, value, label = "Business" }: { options: { slug: string; name: string }[]; value: string; label?: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted }}>
      {label}
      <select value={value} onChange={(e) => { const q = new URLSearchParams(sp.toString()); q.set("co", e.target.value); router.push(`${path}?${q.toString()}`); }}
        style={{ border: `1px solid ${C.btnLine}`, borderRadius: 8, padding: "6px 10px", fontSize: 13.5, background: "#fff", color: C.ink }}>
        {options.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
      </select>
    </label>
  );
}
