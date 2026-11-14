import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelPaymentLink, createPaymentLink, RazorpayError } from "@/integrations/razorpay/client";
import { buildReferenceId } from "@/integrations/razorpay/webhook";
import { razorpayConfig } from "@/lib/env";

/**
 * Creates (or replaces) the Razorpay payment link for one invoice, as the signed-in user.
 * Shared by the receivables screen and the won-deal flow. Returns an error message or null.
 */
export async function issuePaymentLink(sb: SupabaseClient, o: { orgId: string; orgName: string; userId: string; invoiceId: string; replace?: boolean }): Promise<string | null> {
  const cfg = razorpayConfig();
  if (!cfg.enabled) return "Razorpay is not connected. Add the keys in the environment first.";
  const { data: inv } = await sb.from("invoice_balances").select("*").eq("id", o.invoiceId).maybeSingle();
  if (!inv) return "Invoice not found.";
  if (inv.status !== "issued") return `A ${inv.status} invoice cannot get a payment link.`;
  if (inv.outstanding_minor <= 0) return "Nothing is outstanding on this invoice.";
  const { data: open } = await sb.from("payment_links").select("id, provider_link_id").eq("invoice_id", o.invoiceId).in("status", ["created", "partially_paid"]).maybeSingle();
  if (open && !o.replace) return "This invoice already has an open payment link.";
  if (open) {
    try { await cancelPaymentLink(open.provider_link_id); } catch (e) { if (!(e instanceof RazorpayError && e.status === 400)) return (e as Error).message; }
    await sb.from("payment_links").update({ status: "cancelled" }).eq("id", open.id);
  }
  const { data: contact } = await sb.from("billing_contacts").select("name, email, whatsapp_e164").eq("client_id", inv.client_id).order("is_primary", { ascending: false }).limit(1).maybeSingle();
  const referenceId = buildReferenceId(inv.invoice_number);
  const expireBy = Math.floor(Date.now() / 1000) + cfg.linkValidityDays * 86_400;
  let link;
  try {
    link = await createPaymentLink({
      amountMinor: inv.outstanding_minor, currency: inv.currency, referenceId, description: `Invoice ${inv.invoice_number} · ${o.orgName}`, acceptPartial: false, expireBy,
      customer: { name: inv.client_legal_name, ...(contact?.email ? { email: contact.email } : {}), ...(contact?.whatsapp_e164 ? { contact: contact.whatsapp_e164 } : {}) },
      notes: { invoice_number: inv.invoice_number, finance_os_invoice_id: inv.id },
    });
  } catch (e) { return (e as Error).message; }
  const { error } = await sb.from("payment_links").insert({
    organization_id: o.orgId, invoice_id: inv.id, client_id: inv.client_id, provider_link_id: link.id, reference_id: link.reference_id ?? referenceId, short_url: link.short_url,
    amount_minor: link.amount, currency: inv.currency, accept_partial: false, status: "created", expire_by: new Date((link.expire_by || expireBy) * 1000).toISOString(),
    provider_response: link, created_by: o.userId,
  });
  if (error) { await cancelPaymentLink(link.id).catch(() => undefined); return `Could not save the payment link: ${error.message}`; }
  return null;
}
