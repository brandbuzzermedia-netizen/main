import { normalizeName, type MatchableClient } from "@/integrations/swipe/match";
import type { OpenInvoice } from "@/domain/allocation";
import type { BankCredit } from "./statement";
import { isGatewaySettlement } from "@/integrations/razorpay/webhook";

export type BankImportRow = {
  row_number: number;
  transaction_reference: string;
  payment_date: string;
  amount_minor: number;
  narration: string;
  payer_name: string | null;
  method: string;
  client_id: string | null;
  allocate_invoice_id: string | null;
};

export type BankMatch = BankImportRow & { clientLabel: string | null; matchNote: string; gatewaySettlement: boolean };

/**
 * Attach a client when exactly one client's name, trading name, alias or code appears in
 * the narration. Allocate automatically only when that client has exactly one open invoice
 * whose outstanding equals the credit. Everything else is left for the founder to allocate.
 */
export function matchBankCredits(
  credits: BankCredit[],
  clients: MatchableClient[],
  openInvoicesByClient: Map<string, OpenInvoice[]>,
): BankMatch[] {
  const needles = clients.map((c) => ({
    client: c,
    names: [...new Set([c.legal_name, c.trading_name ?? "", ...c.source_aliases, c.client_code].map(normalizeName))].filter((n) => n.length >= 4),
  }));

  return credits.map((cr) => {
    if (isGatewaySettlement(cr.narration)) {
      return {
        row_number: cr.rowNumber, transaction_reference: cr.reference, payment_date: cr.date, amount_minor: cr.amountMinor,
        narration: cr.narration, payer_name: cr.payerGuess, method: cr.method, client_id: null, allocate_invoice_id: null,
        clientLabel: null, gatewaySettlement: true,
        matchNote: "Razorpay settlement. Skipped: each client payment is already recorded from Razorpay's webhook",
      };
    }
    const hay = ` ${normalizeName(cr.narration)} `;
    const hits = needles.filter((n) => n.names.some((name) => hay.includes(` ${name} `)));
    let client_id: string | null = null;
    let allocate_invoice_id: string | null = null;
    let clientLabel: string | null = null;
    let matchNote = "No client name found in the narration";
    if (hits.length === 1) {
      const c = hits[0].client;
      client_id = c.id;
      clientLabel = c.trading_name || c.legal_name;
      const exact = (openInvoicesByClient.get(c.id) ?? []).filter((i) => i.status === "issued" && i.outstanding_minor === cr.amountMinor);
      if (exact.length === 1) {
        allocate_invoice_id = exact[0].id;
        matchNote = `Exact match: ${exact[0].invoice_number}`;
      } else {
        matchNote = exact.length > 1 ? "Several invoices match this amount. Allocate manually" : "Client matched, amount needs manual allocation";
      }
    } else if (hits.length > 1) {
      matchNote = `Narration matches ${hits.length} clients. Assign manually`;
    }
    return {
      row_number: cr.rowNumber,
      transaction_reference: cr.reference,
      payment_date: cr.date,
      amount_minor: cr.amountMinor,
      narration: cr.narration,
      payer_name: cr.payerGuess,
      method: cr.method,
      client_id,
      allocate_invoice_id,
      clientLabel,
      matchNote,
      gatewaySettlement: false,
    };
  });
}
