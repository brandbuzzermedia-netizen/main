import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { BUSINESS_MODELS, CONSOLIDATION, GROUP_BRAND, LIFECYCLE, OWNERSHIP_TYPES } from "@/domain/registry";
import { formatDateTime } from "@/domain/dates";
import { Card, Dl, PageHeader } from "@/components/ui";
import { SettingsForm, StopForm } from "../forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: PageProps<"/c/[slug]/settings">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("company.settings") && !ctx.can("company.emergency_stop")) notFound();
  const c = ctx.company;
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
