import { describe, expect, it } from "vitest";
import { suggestAllocations, type OpenInvoice } from "@/domain/allocation";
import { detectMethod, extractReference, guessPayer, parseBankStatement } from "@/integrations/bank/statement";
import { matchBankCredits } from "@/integrations/bank/match";
import type { MatchableClient } from "@/integrations/swipe/match";

const inv = (id: string, due: string, out: number, status: OpenInvoice["status"] = "issued"): OpenInvoice =>
  ({ id, invoice_number: id, effective_due_date: due, outstanding_minor: out, status });

describe("suggestAllocations", () => {
  const open = [inv("A", "2026-09-08", 5310000), inv("B", "2026-10-08", 5310000), inv("C", "2026-10-20", 1180000), inv("D", "2026-08-01", 999, "disputed")];
  it("prefers a unique exact match", () => {
    expect(suggestAllocations(1180000, open)).toEqual({ allocations: [{ invoice_id: "C", amount_minor: 1180000 }], unallocatedMinor: 0 });
  });
  it("pays oldest first and never touches disputed invoices", () => {
    expect(suggestAllocations(6000000, open)).toEqual({
      allocations: [{ invoice_id: "A", amount_minor: 5310000 }, { invoice_id: "B", amount_minor: 690000 }],
      unallocatedMinor: 0,
    });
  });
  it("falls back to oldest-first when the exact match is ambiguous", () => {
    expect(suggestAllocations(5310000, open).allocations).toEqual([{ invoice_id: "A", amount_minor: 5310000 }]);
  });
  it("leaves an advance unallocated", () => {
    expect(suggestAllocations(20000000, open).unallocatedMinor).toBe(20000000 - 5310000 * 2 - 1180000);
  });
});

describe("bank narration helpers", () => {
  it.each([
    ["UPI/629812345678/Payment from Shobha/shobha@okhdfc/HDFC", "629812345678", "upi"],
    ["NEFT-HDFCN52026101812345-SHOBHA DECOR PVT LTD-0001-ICIC0000001", "HDFCN52026101812345", "neft"],
    ["RTGS-ICICR42026101900123456-LYKES OFFICE SYSTEMS LLP", "ICICR42026101900123456", "rtgs"],
    ["MMT/IMPS/629912345678/Lykes/ICIC", "629912345678", "imps"],
    ["IMPS-629912345678-LYKES", "629912345678", "imps"],
  ])("%s", (narration, ref, method) => {
    expect(extractReference(narration)).toBe(ref);
    expect(detectMethod(narration)).toBe(method);
  });
  it("guesses a payer name", () => {
    expect(guessPayer("NEFT-HDFCN52026101812345-SHOBHA DECOR PVT LTD-0001")).toBe("SHOBHA DECOR PVT LTD");
  });
});

const hdfc = [
  "HDFC BANK Ltd.,,,,,,",
  "Statement of account,,,,,,",
  "Account No :,50100012345678,,,,,",
  ",,,,,,",
  "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance",
  '18/10/26,NEFT-HDFCN52026101812345-SHOBHA DECOR PVT LTD-0001,0000000000000000,18/10/26,,"53,100.00","4,53,100.00"',
  '18/10/26,ACH D- AWS INDIA-12345,0000000000000000,18/10/26,"8,450.00",,"4,44,650.00"',
  '19/10/26,UPI/629812345678/Payment from LYKES FURNITURE/lykes@okicici/ICICI,629812345678,19/10/26,,"10,000.00","4,54,650.00"',
  '19/10/26,CASH DEPOSIT BY SELF,,19/10/26,,"5,000.00","4,59,650.00"',
  "********,,,,,,",
  "Closing balance,,,,,,4,59,650.00",
].join("\n");

describe("parseBankStatement", () => {
  it("finds the header after preamble and returns only credits", () => {
    const p = parseBankStatement(hdfc);
    expect(p.headerFound).toBe(true);
    expect(p.skippedDebits).toBe(1);
    expect(p.credits.map((c) => [c.date, c.amountMinor, c.reference, c.method])).toEqual([
      ["2026-10-18", 5310000, "HDFCN52026101812345", "neft"],
      ["2026-10-19", 1000000, "629812345678", "upi"],
      ["2026-10-19", 500000, expect.stringMatching(/^BANK-2026-10-19-[0-9A-F]{10}$/), "other"],
    ]);
  });
  it("synthesizes stable references for re-imports", () => {
    expect(parseBankStatement(hdfc).credits[2].reference).toBe(parseBankStatement(hdfc).credits[2].reference);
  });
  it("supports single amount + Dr/Cr column formats", () => {
    const p = parseBankStatement("Txn Date,Description,Amount,Dr/Cr\n01-10-2026,NEFT-SBIN0012345678-ORBIT DENTAL,11800,CR\n02-10-2026,RENT,50000,DR");
    expect(p.credits).toHaveLength(1);
    expect(p.skippedDebits).toBe(1);
  });
  it("reports when no header is recognisable", () => {
    expect(parseBankStatement("foo,bar\n1,2").headerFound).toBe(false);
  });
});

describe("matchBankCredits", () => {
  const clients: MatchableClient[] = [
    { id: "c-shobha", client_code: "SHOBHA", legal_name: "Shobha Decor Pvt Ltd", trading_name: "Shobha Decor", gstin: null, source_aliases: [], payment_terms_days: 7 },
    { id: "c-lykes", client_code: "LYKES", legal_name: "Lykes Office Systems LLP", trading_name: null, gstin: null, source_aliases: ["Lykes Furniture"], payment_terms_days: 15 },
  ];
  const open = new Map([
    ["c-shobha", [inv("I-41", "2026-09-08", 5310000), inv("I-42", "2026-10-08", 5310000)]],
    ["c-lykes", [inv("I-44", "2026-10-30", 1180000)]],
  ]);
  it("matches clients by name/alias and auto-allocates only unambiguous exact amounts", () => {
    const m = matchBankCredits(parseBankStatement(hdfc).credits, clients, open);
    expect(m.map((r) => [r.client_id, r.allocate_invoice_id])).toEqual([
      ["c-shobha", null], // two invoices of 53,100: ambiguous
      ["c-lykes", null], // 10,000 ≠ 11,800
      [null, null], // cash deposit, no name
    ]);
    expect(m[0].matchNote).toMatch(/Several invoices/);
  });
  it("auto-allocates a unique exact match", () => {
    const one = new Map([["c-shobha", [inv("I-41", "2026-09-08", 5310000)]]]);
    const m = matchBankCredits(parseBankStatement(hdfc).credits.slice(0, 1), clients, one);
    expect(m[0].allocate_invoice_id).toBe("I-41");
  });
});

describe("Razorpay settlements in bank statements", () => {
  it("are skipped so gateway payments are not counted twice", () => {
    const csv = "Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.\n20/10/26,NEFT-UTIB0000001-RAZORPAY SOFTWARE PVT LTD-setl_ABC,UTIB12345678901,,\"1,15,640.00\"";
    const m = matchBankCredits(parseBankStatement(csv).credits, [], new Map());
    expect(m[0].gatewaySettlement).toBe(true);
    expect(m[0].client_id).toBeNull();
  });
});
