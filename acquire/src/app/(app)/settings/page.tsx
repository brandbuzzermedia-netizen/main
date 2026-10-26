import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import type { OrgSettings } from "@/lib/db-types";
import { MARKET_RULES } from "@/domain/eligibility";
import { Card } from "@/components/ui";
import { WorkspaceForm } from "./forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await getContext();
  const { data } = await ctx.supabase.from("organization_settings").select("*").eq("organization_id", ctx.org.id).single();
  const s = data as OrgSettings;
  return (
    <div className="flex flex-col gap-6">
      <Card title="Workspace and contact policy">
        {!ctx.can.manageSettings && <p className="mb-4 text-sm text-muted">Only an agency admin can change these.</p>}
        <WorkspaceForm
          name={ctx.org.name}
          timezone={ctx.org.timezone}
          windowStart={s.contact_window_start.slice(0, 5)}
          windowEnd={s.contact_window_end.slice(0, 5)}
          inquiryDays={s.implied_inquiry_days}
          disabled={!ctx.can.manageSettings}
        />
      </Card>
      <Card title="Market">
        <p className="text-sm">
          Primary market: <strong>{MARKET_RULES[ctx.org.primary_market]?.name ?? ctx.org.primary_market}</strong> · default currency {ctx.org.default_currency}.
        </p>
        <p className="mt-1 text-sm text-muted">
          The market sets defaults for phone parsing and currency. Contact rules always follow each lead&apos;s own country.
          Contact support to change the primary market.
        </p>
      </Card>
    </div>
  );
}
