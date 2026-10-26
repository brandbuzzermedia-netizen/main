import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Integrations" };

/** Honest status of each integration. Nothing here is connected until its phase ships. */
const INTEGRATIONS: { name: string; purpose: string; phase: number; group: string }[] = [
  { group: "CRM", name: "GoHighLevel", purpose: "Two-way sync of contacts, opportunities, pipeline stages, tags and appointments via the official API v2 (OAuth, per sub-account).", phase: 6 },
  { group: "Messaging", name: "Twilio SMS", purpose: "Outbound and inbound SMS with STOP handling and delivery status webhooks. US numbers need A2P 10DLC registration.", phase: 4 },
  { group: "Messaging", name: "Resend or SendGrid", purpose: "Transactional and campaign email with bounce, complaint and unsubscribe webhooks.", phase: 4 },
  { group: "Messaging", name: "WhatsApp Business (Meta Cloud API)", purpose: "Template messages to opted-in contacts.", phase: 4 },
  { group: "Voice", name: "AI voice provider (e.g. Twilio Voice + a realtime voice model, Retell, Vapi)", purpose: "Consent-gated qualification calls with disclosure, transcript, structured outcome and human handoff.", phase: 6 },
  { group: "Calendar", name: "Google Calendar / Microsoft 365", purpose: "Availability and confirmed bookings. An appointment counts only after the calendar confirms it.", phase: 6 },
  { group: "AI", name: "Claude (Anthropic API)", purpose: "Qualification, summaries and drafting with schema-validated outputs, usage and cost logging.", phase: 4 },
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
        description="What this workspace can connect to, and what is available today. Today the platform runs on its own CRM; nothing below sends messages yet."
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
              <Badge>Not connected · phase {i.phase}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
