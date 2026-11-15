import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { designFor } from "@/domain/design";
import { BUSINESS_MODELS, CONSOLIDATION, LIFECYCLE, OWNERSHIP_TYPES, moduleInfo, type ModuleKey } from "@/domain/registry";
import { PageHead } from "@/components/dp/shell";
import { Card, Toggle } from "@/components/dp/ui";
import { C } from "@/components/dp/theme";
import { AiSettingsForm } from "../forms";
import { outreachRulesAction, requireMfaAction, savePaymentRulesAction, toggleModuleAction } from "../actions";
import { AccountsCard, type SenderAccount } from "@/components/dp/accounts-card";
import { loadMembers } from "@/lib/people";
import { todayInBusinessTz } from "@/domain/dates";
import { GrowthCard } from "./growth";

export const metadata: Metadata = { title: "Settings" };
const LIST: ModuleKey[] = ["leads", "pipeline", "outreach", "meetings", "customers", "operations", "automation", "marketing", "finance", "rental", "expenses", "tax", "team", "reports", "vault"];

export default async function SettingsPage({ params, searchParams }: PageProps<"/c/[slug]/settings">) {
  const { slug } = await params;
  const spx = await searchParams;
  const mfaError = spx.mfa_error;
  const rulesNote = typeof spx.rules === "string" ? spx.rules : undefined;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("company.settings") && !ctx.can("company.emergency_stop")) notFound();
  const c = ctx.company;
  const d = designFor(slug);
  const edit = ctx.can("company.settings");
  const canOutreach = ctx.can("crm.write");
  const [accRes, logRes, members, orules] = canOutreach ? await Promise.all([
    ctx.supabase.from("sender_accounts").select("id, channel, kind, label, address, account_key, daily_limit, status, organization_id, operator_id").order("channel"),
    ctx.supabase.from("outreach_send_log").select("sender_account_id").eq("organization_id", c.id).eq("sent_on", todayInBusinessTz()),
    loadMembers(ctx.supabase, c.id),
    ctx.supabase.from("outreach_rules").select("max_touches_per_week").eq("organization_id", c.id).maybeSingle(),
  ]) : [{ data: [] }, { data: [] }, [], { data: null }];
  const sentBy = new Map<string, number>();
  for (const l of (logRes.data ?? []) as { sender_account_id: string | null }[]) if (l.sender_account_id) sentBy.set(l.sender_account_id, (sentBy.get(l.sender_account_id) ?? 0) + 1);
  const nameOf = new Map(members.map((m) => [m.user_id, m.name]));
  const accounts: SenderAccount[] = ((accRes.data ?? []) as (SenderAccount & { organization_id: string | null; operator_id: string | null })[])
    .map((a) => ({ ...a, shared: a.organization_id === null, operator: a.operator_id ? nameOf.get(a.operator_id) ?? "Team member" : null, sentToday: sentBy.get(a.id) ?? 0 }));
  const { data: rules } = await ctx.supabase.from("payment_rules").select("enabled, warn_after_days, hold_after_days").eq("organization_id", c.id).maybeSingle();
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
        {canOutreach && (
          <AccountsCard slug={slug} title="Sending accounts" accounts={accounts} canEdit={ctx.can("crm.manage")} operators={members.map((m) => ({ id: m.user_id, name: m.name }))}
            note={typeof spx.accounts === "string" ? spx.accounts : undefined}
            extra={ctx.can("crm.manage") ? (
              <form action={outreachRulesAction.bind(null, slug)} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderTop: `1px solid ${C.line2}`, marginTop: 12, paddingTop: 12, fontSize: 14 }}>
                Contact one person at most
                <input type="number" name="max_touches_per_week" min={1} max={14} defaultValue={orules.data?.max_touches_per_week ?? 3} style={{ width: 64, border: `1px solid ${C.btnLine}`, borderRadius: 8, padding: "6px 8px" }} />
                times a week, across all channels
                <button style={{ border: `1px solid ${C.btnLine}`, background: "#fff", borderRadius: 8, padding: "6px 12px", fontWeight: 600, cursor: "pointer" }}>Save</button>
              </form>
            ) : undefined} />
        )}
        {canOutreach && <GrowthCard ctx={ctx} slug={slug} members={members} note={typeof spx.growth === "string" ? spx.growth : undefined} />}
        {edit && (
          <Card title="Payment rules" aside={<span style={{ fontSize: 12.5, color: C.muted }}>Applies to every client</span>}>
            <form action={savePaymentRulesAction.bind(null, slug)} style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: `1px solid ${C.line2}`, marginTop: 10, paddingTop: 12, fontSize: 14 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="enabled" defaultChecked={rules?.enabled ?? true} /> Stop work automatically when a client pays late</label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>Warn the team when an invoice is
                <input type="number" name="warn_after_days" min={0} max={90} defaultValue={rules?.warn_after_days ?? 3} style={{ width: 70, border: `1px solid ${C.btnLine}`, borderRadius: 8, padding: "6px 8px" }} /> days overdue</label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>Stop work for the client at
                <input type="number" name="hold_after_days" min={1} max={180} defaultValue={rules?.hold_after_days ?? 15} style={{ width: 70, border: `1px solid ${C.btnLine}`, borderRadius: 8, padding: "6px 8px" }} /> days overdue</label>
              <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>On hold: the team sees a red banner, gets STOP WORK tasks and an email (Automation → payment hold alerts), and no new tasks can be added for that client. It lifts by itself when they pay. Owners can release early or give time.</div>
              {rulesNote && <div role="status" style={{ background: C.soft, color: "var(--co-side)", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>{rulesNote}</div>}
              <div><button style={{ background: "var(--co-side)", color: "#fff", border: 0, borderRadius: 9, padding: "9px 16px", fontWeight: 600, cursor: "pointer" }}>Save rules</button></div>
            </form>
          </Card>
        )}
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
