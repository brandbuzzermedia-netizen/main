"use client";

import { useState, useTransition } from "react";
import { setAccessAction } from "./actions";

const LABEL: Record<string, string> = { owner: "Owner", company_admin: "Admin", finance: "Finance", viewer: "Viewer", sales_manager: "Sales manager", sales_rep: "Sales rep",
  account_manager: "Account manager", operations_manager: "Operations", marketing_manager: "Marketing", staff: "Staff", accountant: "Accountant", partner: "Partner" };

/** Role picker for one person in one company; "No access" removes them (with a record kept). */
export function RoleCell({ orgId, membershipId, email, role, company, person }: { orgId: string; membershipId: string | null; email: string; role: string | null; company: string; person: string }) {
  const [value, setValue] = useState(role ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      <select aria-label={`${person} in ${company}`} value={value} disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          if (next === "" && !confirm(`Remove ${person}'s access to ${company}? Their records stay.`)) return;
          const prev = value; setValue(next); setMsg(null);
          start(async () => {
            const r = await setAccessAction({ orgId, membershipId, email, role: next });
            if ("error" in r && r.error) { setValue(prev); setMsg(r.error); } else setMsg("Saved");
          });
        }}
        style={{ fontSize: 12.5, padding: "4px 6px", borderRadius: 3, border: "1px solid #CFCBC2", background: value ? (value === "owner" || value === "company_admin" ? "#141414" : "#fff") : "#F4F2EE", color: value === "owner" || value === "company_admin" ? "#fff" : "#141414", maxWidth: 130 }}>
        <option value="">— No access —</option>
        {Object.entries(LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {msg && <span style={{ fontSize: 10.5, color: msg === "Saved" ? "#2F5D4C" : "#B3261E", maxWidth: 130 }}>{pending ? "Saving…" : msg}</span>}
    </span>
  );
}
