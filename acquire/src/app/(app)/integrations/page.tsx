import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import { anthropicConfig, cronSecret, resendConfig, twilioConfig, unsubscribeSecret } from "@/lib/env";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Integrations" };

/** Honest status of each integration. Nothing here is connected until its phase ships. */
const INTEGRATIONS: { name: string; purpose: string; phase: number; group: string; live?: () => boolean }[] = [
  { group: "CRM", name: "GoHighLevel", purpose: "Two-way sync of contacts, opportunities, pipeline stages, tags and appointments via the official API v2 (OAuth, per sub-account).", phase: 6 },
  { group: "Messaging", name: "Twilio SMS", purpose: "Outbound and inbound SMS with STOP handling and delivery status webhooks. US numbers need A2P 10DLC registration. Webhooks: /api/webhooks/twilio/sms and /api/webhooks/twilio/status.", phase: 4, live: () => twilioConfig().enabled },
  { group: "Messaging", name: "Resend", purpose: "Email with unsubscribe links, bounce and complaint handling. Needs UNSUBSCRIBE_SECRET and a verified domain. Webhook: /api/webhooks/resend.", phase: 4, live: () => resendConfig().enabled && Boolean(unsubscribeSecret()) },
  { group: "Automation", name: "Scheduled sequence runner", purpose: "Sends due sequence steps every 15 minutes (vercel.json cron → /api/jobs/run with CRON_SECRET).", phase: 5, live: () => Boolean(cronSecret()) },
  { group: "Messaging", name: "WhatsApp Business (Meta Cloud API)", purpose: "Template messages to opted-in contacts.", phase: 4 },
  { group: "Voice", name: "AI voice provider (e.g. Twilio Voice + a realtime voice model, Retell, Vapi)", purpose: "Consent-gated qualification calls with disclosure, transcript, structured outcome and human handoff.", phase: 6 },
  { group: "Calendar", name: "Google Calendar / Microsoft 365", purpose: "Availability and confirmed bookings. An appointment counts only after the calendar confirms it.", phase: 6 },
  { group: "AI", name: "Claude (Anthropic API)", purpose: "Lead assessment with schema-validated output, evidence quotes and human approval. Every run is logged with tokens.", phase: 4, live: () => anthropicConfig().enabled },
  { group: "Billing", name: "Stripe", purpose: "Subscriptions, usage-based metering and invoices. Card data never touches this app.", phase: 7 },
  { group: "Compliance", name: "Do-not-call registry screening", purpose: "US National DNC, UK TPS/CTPS, Canada DNCL, Australia DNCR, UAE DNCR. Until connected, calls without consent go to manual review.", phase: 6 },
  { group: "Data", name: "Licensed property and contact data (e.g. MLS via RESO Web API, ATTOM)", purpose: "Listing and owner data under a licence. Scraping portals such as Zillow is not supported.", phase: 6 },
];

export default async function IntegrationsPage() {
  await getContext();
  return (
    <>
      <PageHeader
        title="Integrations"
        description="What the platform connects to. “Built · needs keys” means the integration is implemented and waits for its API keys on the server."
      />
      <Card>
        <ul className="divide-y divide-line">
          {INTEGRATIONS.map((i) => (
            <li key={i.name} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted">{i.group}</div>
                <div className="font-medium">{i.name}</div>
                <p className="max-w-2xl text-sm text-muted">{i.purpose}</p>
              </div>
              {i.live ? (i.live() ? <Badge tone="ok">Connected</Badge> : <Badge tone="warn">Built · needs keys</Badge>) : <Badge>Not built yet · phase {i.phase}</Badge>}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
