import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { designFor } from "@/domain/design";
import { BUSINESS_MODELS, CONSOLIDATION, LIFECYCLE, OWNERSHIP_TYPES, moduleInfo, type ModuleKey } from "@/domain/registry";
import { PageHead } from "@/components/dp/shell";
import { Card, Toggle } from "@/components/dp/ui";
import { C } from "@/components/dp/theme";
import { AiSettingsForm } from "../forms";
import { requireMfaAction, toggleModuleAction } from "../actions";

export const metadata: Metadata = { title: "Settings" };
const LIST: ModuleKey[] = ["leads", "pipeline", "outreach", "meetings", "customers", "operations", "automation", "marketing", "finance", "rental", "expenses", "tax", "team", "reports", "vault"];

export default async function SettingsPage({ params, searchParams }: PageProps<"/c/[slug]/settings">) {
  const { slug } = await params;
  const mfaError = (await searchParams).mfa_error;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("company.settings") && !ctx.can("company.emergency_stop")) notFound();
  const c = ctx.company;
  const d = designFor(slug);
  const edit = ctx.can("company.settings");
  const { data: app } = ctx.can("finance.approve")
    ? await ctx.supabase.from("app_settings").select("ai_enabled, ai_monthly_token_limit, self_approval_limit_minor").eq("organization_id", c.id).maybeSingle() : { data: null };
  return (
    <>
      <PageHead own={d.own} treat={d.treat} title="Settings" intro={`Enable, hide or extend modules for ${c.name}. Roles and record scope are set per module.`} />
      <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "6px 26px", maxWidth: 620 }}>
        {LIST.filter((k) => k !== "operations" || d.ext.length).map((k) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderTop: `1px solid ${C.line2}` }}>
            <div style={{ flex: 1, fontWeight: 500 }}>{d.ren[k] ?? moduleInfo(k).label}</div>
            {edit ? (
              <form action={toggleModuleAction.bind(null, slug)}>
                <input type="hidden" name="module" value={k} /><input type="hidden" name="on" value={String(!c.enabled_modules.includes(k))} />
                <button aria-label={`${c.enabled_modules.includes(k) ? "Hide" : "Show"} ${d.ren[k] ?? moduleInfo(k).label}`} aria-pressed={c.enabled_modules.includes(k)} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer", display: "flex" }}><Toggle on={c.enabled_modules.includes(k)} /></button>
              </form>
            ) : <Toggle on={c.enabled_modules.includes(k)} />}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 620, marginTop: 20 }}>
        {app && <Card title="AI and approvals"><div style={{ marginTop: 10 }}><AiSettingsForm slug={slug} enabled={Boolean(app.ai_enabled)} limit={Number(app.ai_monthly_token_limit)} selfLimit={(Number(app.self_approval_limit_minor) / 100).toFixed(2)} /></div></Card>}
        {edit && (
          <Card title="Two-step sign-in" aside={<span style={{ fontSize: 12.5, color: C.muted }}>Owner, admin and finance roles</span>}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: `1px solid ${C.line2}`, marginTop: 10 }}>
              <div style={{ flex: 1, fontSize: 14, lineHeight: 1.5 }}>{c.require_mfa ? "Required. Without a code from an authenticator app these roles can only see the workspace name." : "Not required. Turn on once you have set it up yourself."}</div>
              <form action={requireMfaAction.bind(null, slug)}><input type="hidden" name="on" value={String(!c.require_mfa)} />
                <button aria-label={c.require_mfa ? "Stop requiring two-step sign-in" : "Require two-step sign-in"} aria-pressed={c.require_mfa} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer", display: "flex" }}><Toggle on={c.require_mfa} /></button></form>
            </div>
            {typeof mfaError === "string" && <div role="alert" style={{ background: "#F5DADA", color: C.red, borderRadius: 8, padding: "9px 12px", fontSize: 13 }}>{mfaError} <a href="/mfa" style={{ color: C.red, fontWeight: 600 }}>Set up two-step sign-in</a></div>}
          </Card>
        )}
        <Card title="Registry">
          {([["Ownership", OWNERSHIP_TYPES[c.ownership_type]], ["Owner (as described)", c.owner_label ?? "—"], ["Group totals", CONSOLIDATION[c.consolidation]], ["Business model", BUSINESS_MODELS[c.business_model]], ["Status", LIFECYCLE[c.lifecycle_status]]] as [string, string][]).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 0", borderTop: `1px solid ${C.line2}`, fontSize: 14 }}><span style={{ color: C.muted }}>{k}</span><span>{v}</span></div>
          ))}
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 10 }}>Ownership and consolidation decide what group totals include, so only a group owner changes them. The emergency stop is at the bottom of the sidebar.</div>
        </Card>
      </div>
    </>
  );
}
