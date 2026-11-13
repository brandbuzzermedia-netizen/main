import type { Metadata } from "next";
import { getGroupContext } from "@/lib/workspace";
import { GroupHead } from "@/lib/group-head";
import { GROUP_DESIGN } from "@/domain/design";
import { BUSINESS_MODELS, COMPANY_TEMPLATES, CONSOLIDATION, LIFECYCLE, OWNERSHIP_TYPES, moduleInfo, type ModuleKey } from "@/domain/registry";
import { Card, Toggle } from "@/components/dp/ui";
import { C } from "@/components/dp/theme";
import { AddCompanyForm, AttachForm, TemplatesForm } from "../forms";
import { setRegistryAction, toggleGroupModuleAction } from "../actions";

export const metadata: Metadata = { title: "Settings" };
const LIST: ModuleKey[] = ["pipeline", "meetings", "automation", "finance", "rental", "expenses", "tax", "team", "reports", "vault"];
const sel = { border: `1px solid ${C.line}`, borderRadius: 7, padding: "4px 6px", fontSize: 12.5, background: "#fff" } as const;

export default async function GroupSettings() {
  const g = await getGroupContext();
  const owner = g.group.role === "group_owner";
  const { data } = await g.supabase.from("family_groups").select("disabled_modules").eq("id", g.group.id).maybeSingle();
  const off = (data?.disabled_modules as string[] | undefined) ?? [];
  const slugs = new Set(g.registry.map((c) => c.slug));
  const legacy = g.memberships.filter((m) => m.company.family_group_id === null && m.role === "owner");
  return (
    <>
      <GroupHead title="Settings" intro="Enable, hide or extend modules for the Command Centre. Roles and record scope are set per module." />
      <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "6px 26px", maxWidth: 620 }}>
        {LIST.map((k) => {
          const on = !off.includes(k);
          const label = GROUP_DESIGN.ren[k] ?? moduleInfo(k).label;
          return (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderTop: `1px solid ${C.line2}` }}>
              <div style={{ flex: 1, fontWeight: 500 }}>{label}</div>
              {owner ? (
                <form action={toggleGroupModuleAction}><input type="hidden" name="module" value={k} /><input type="hidden" name="on" value={String(!on)} />
                  <button aria-label={`${on ? "Hide" : "Show"} ${label}`} aria-pressed={on} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer", display: "flex" }}><Toggle on={on} /></button></form>
              ) : <Toggle on={on} />}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900, marginTop: 20 }}>
        <Card title="Businesses" aside={<span style={{ fontSize: 12.5, color: C.muted }}>Ownership and consolidation decide group totals</span>}>
          {g.registry.length === 0 && <div style={{ fontSize: 14, color: C.muted, paddingTop: 8 }}>No businesses yet.</div>}
          {g.registry.map((c) => (
            <div key={c.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "12px 0", borderTop: `1px solid ${C.line2}`, marginTop: 4 }}>
              <div style={{ flex: "1 1 220px" }}><div style={{ fontWeight: 600, fontSize: 14.5 }}>{c.name}</div><div style={{ fontSize: 12.5, color: C.muted }}>{BUSINESS_MODELS[c.business_model]} · {LIFECYCLE[c.lifecycle_status]}{c.owner_label ? ` · ${c.owner_label}` : ""} · {g.access.get(c.id)?.role ?? "No access"}</div></div>
              {owner ? (
                <form action={setRegistryAction} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <input type="hidden" name="org_id" value={c.id} /><input type="hidden" name="owner_label" value={c.owner_label ?? ""} />
                  <select name="ownership_type" defaultValue={c.ownership_type} aria-label={`Ownership of ${c.name}`} style={sel}>{Object.entries(OWNERSHIP_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  <select name="consolidation" defaultValue={c.consolidation} aria-label={`Consolidation of ${c.name}`} style={sel}>{Object.entries(CONSOLIDATION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  <button style={{ ...sel, cursor: "pointer", fontWeight: 600 }}>Save</button>
                </form>
              ) : <span style={{ fontSize: 13, color: C.muted }}>{OWNERSHIP_TYPES[c.ownership_type]} · {CONSOLIDATION[c.consolidation]}</span>}
            </div>
          ))}
        </Card>
        {owner && legacy.length > 0 && (
          <Card title="Bring in an existing workspace">
            <p style={{ fontSize: 13.5, color: C.muted }}>These workspaces existed before the group. Attaching keeps every invoice, payment and client as it is.</p>
            <AttachForm orgs={legacy.map((m) => ({ id: m.company.id, name: m.company.name }))} templates={COMPANY_TEMPLATES.filter((t) => !slugs.has(t.slug)).map((t) => ({ slug: t.slug, name: t.name }))} />
          </Card>
        )}
        {owner && (
          <Card title="Set up the family businesses">
            <p style={{ fontSize: 13.5, color: C.muted }}>Creates empty workspaces with ownership, pipeline stages and brand colours. No figures, people or commission rates are created.</p>
            <TemplatesForm templates={COMPANY_TEMPLATES.map((t) => ({ slug: t.slug, name: t.name, ownership: OWNERSHIP_TYPES[t.ownership_type], consolidation: CONSOLIDATION[t.consolidation], exists: slugs.has(t.slug) }))} />
          </Card>
        )}
        {owner && <section id="add" style={{ scrollMarginTop: 96 }}><Card title="Add a business"><div style={{ marginTop: 10 }}><AddCompanyForm /></div></Card></section>}
      </div>
    </>
  );
}
