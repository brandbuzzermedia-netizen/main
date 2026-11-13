import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { BUSINESS_MODELS, CONSOLIDATION, GROUP_BRAND, LIFECYCLE, OWNERSHIP_TYPES } from "@/domain/registry";
import { formatDateTime } from "@/domain/dates";
import { Card, Dl, PageHeader } from "@/components/ui";
import { AiSettingsForm, SettingsForm, StopForm } from "../forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: PageProps<"/c/[slug]/settings">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("company.settings") && !ctx.can("company.emergency_stop")) notFound();
  const c = ctx.company;
  const { data: app } = ctx.can("finance.approve")
    ? await ctx.supabase.from("app_settings").select("ai_enabled, ai_monthly_token_limit, self_approval_limit_minor").eq("organization_id", c.id).maybeSingle()
    : { data: null };
  return (
    <>
      <PageHeader title="Settings" description={c.name} />
      <div className="flex flex-col gap-5">
        <Card title="Registry">
          <Dl items={[
            ["Ownership", OWNERSHIP_TYPES[c.ownership_type]],
            ["Owner (as described)", c.owner_label],
            ["Group totals", CONSOLIDATION[c.consolidation]],
            ["Business model", BUSINESS_MODELS[c.business_model]],
            ["Status", LIFECYCLE[c.lifecycle_status]],
            ["Financial year starts", new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, c.fy_start_month - 1, 1)))],
          ]} />
          <p className="mt-3 text-xs text-muted">Ownership and consolidation decide what the group totals include, so only a group owner can change them (Businesses page).</p>
        </Card>
        {ctx.can("company.settings") && (
          <Card title="Modules and branding">
            <SettingsForm slug={slug} enabled={c.enabled_modules} sidebar={c.sidebar_color ?? GROUP_BRAND.sidebar} accent={c.accent_color ?? GROUP_BRAND.accent} />
          </Card>
        )}
        {app && (
          <Card title="AI and approvals">
            <AiSettingsForm slug={slug} enabled={Boolean(app.ai_enabled)} limit={Number(app.ai_monthly_token_limit)} selfLimit={(Number(app.self_approval_limit_minor) / 100).toFixed(2)} />
          </Card>
        )}
        {ctx.can("company.emergency_stop") && (
          <section id="emergency-stop" className="scroll-mt-24">
            <Card title="Emergency stop">
              <p className="mb-3 text-sm text-muted">
                {c.emergency_stop
                  ? `Stopped ${c.emergency_stop_at ? formatDateTime(c.emergency_stop_at) : ""}. Reason: ${c.emergency_stop_reason}.`
                  : "Pauses outbound messages and workflow runs for this company only. Automations (phase 8) check this flag before every run."}
              </p>
              <StopForm slug={slug} stopped={c.emergency_stop} />
            </Card>
          </section>
        )}
      </div>
    </>
  );
}
