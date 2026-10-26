import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import { formatDate } from "@/domain/dates";
import { Card, Dl, NotYetAvailable, PageHeader, Stat, Table, Td } from "@/components/ui";

export const metadata: Metadata = { title: "Billing" };

type Plan = { key: string; name: string; max_contacts: number; max_seats: number; max_workflows: number; monthly_messages: number; monthly_emails: number; monthly_ai_call_minutes: number; is_public: boolean };

export default async function BillingPage() {
  const ctx = await getContext();
  if (!ctx.can.viewBilling) notFound();
  const [{ data: sub }, { data: plans }, { count: contacts }, { count: seats }] = await Promise.all([
    ctx.supabase.from("subscriptions").select("plan_key, status, current_period_end").eq("organization_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("plans").select("*").order("max_contacts"),
    ctx.supabase.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", ctx.org.id),
    ctx.supabase.from("memberships").select("id", { count: "exact", head: true }).eq("organization_id", ctx.org.id),
  ]);
  const all = (plans ?? []) as Plan[];
  const plan = all.find((p) => p.key === sub?.plan_key);
  const usage = (n: number | null, max?: number) => `${(n ?? 0).toLocaleString()} / ${max?.toLocaleString() ?? "—"}`;

  return (
    <>
      <PageHeader title="Billing" description="Your plan and what it allows. Limits are enforced by the server, not just this page." />
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Plan" value={plan?.name ?? "None"} hint={sub ? `${sub.status}${sub.current_period_end ? ` until ${formatDate(sub.current_period_end, ctx.org.timezone)}` : ""}` : undefined} />
          <Stat label="Contacts" value={usage(contacts, plan?.max_contacts)} tone={plan && (contacts ?? 0) >= plan.max_contacts * 0.9 ? "warn" : "default"} />
          <Stat label="Seats" value={usage(seats, plan?.max_seats)} />
          <Stat label="Workflows" value={`0 / ${plan?.max_workflows ?? "—"}`} hint="Workflows arrive in phase 5" />
        </div>
        {plan && (
          <Card title="Monthly allowances">
            <Dl items={[
              ["SMS", plan.monthly_messages.toLocaleString()],
              ["Email", plan.monthly_emails.toLocaleString()],
              ["AI call minutes", plan.monthly_ai_call_minutes.toLocaleString()],
              ["Metered usage this period", "Not metered yet: nothing is sent until phase 4"],
            ]} />
          </Card>
        )}
        <Card title="Plans">
          <div className="-m-4">
            <Table head={["Plan", "Contacts", "Seats", "Workflows", "SMS / mo", "Email / mo", "AI minutes / mo"]}>
              {all.filter((p) => p.is_public || p.key === plan?.key).map((p) => (
                <tr key={p.key} className={p.key === plan?.key ? "bg-brand-soft/50" : undefined}>
                  <Td className="font-medium">{p.name}{p.key === plan?.key && " (current)"}</Td>
                  <Td numeric>{p.max_contacts.toLocaleString()}</Td>
                  <Td numeric>{p.max_seats}</Td>
                  <Td numeric>{p.max_workflows}</Td>
                  <Td numeric>{p.monthly_messages.toLocaleString()}</Td>
                  <Td numeric>{p.monthly_emails.toLocaleString()}</Td>
                  <Td numeric>{p.monthly_ai_call_minutes.toLocaleString()}</Td>
                </tr>
              ))}
            </Table>
          </div>
        </Card>
        <NotYetAvailable phase={7}>
          Self-serve upgrades, payment methods and invoices come with the Stripe integration. Prices are not set yet. Until then, plan changes are made by the platform team.
        </NotYetAvailable>
      </div>
    </>
  );
}
