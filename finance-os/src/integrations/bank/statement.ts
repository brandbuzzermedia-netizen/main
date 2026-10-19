import { createHash } from "node:crypto";
import { parseCsv } from "@/integrations/swipe/csv";
import { parseFlexibleDate } from "@/domain/dates";
import { parseMoneyToMinor } from "@/domain/money";

/**
 * Bank statement CSV parsing for Indian banks (HDFC, ICICI, SBI, Axis, Kotak exports).
 * Statements often start with account-summary lines, so the header row is detected by content.
 * Only credits (money in) are returned; debits are ignored here.
 */

const ALIASES = {
  date: ["date", "txn date", "transaction date", "tran date", "value date", "posting date", "value dt", "txn posted date"],
  narration: ["narration", "description", "particulars", "remarks", "transaction remarks", "details", "transaction details", "transaction description"],
  reference: ["chq./ref.no.", "chq/ref no", "chq / ref no.", "ref no./cheque no.", "ref no", "reference no", "reference number", "cheque no", "chq no", "utr", "utr number", "transaction id", "tran id", "cheque/reference no"],
  credit: ["deposit amt.", "deposit amt", "deposit", "deposits", "credit", "credit amount", "credit amt", "cr amount", "amount (cr)", "credit(inr)", "deposit amount (inr)"],
  debit: ["withdrawal amt.", "withdrawal amt", "withdrawal", "withdrawals", "debit", "debit amount", "dr amount", "amount (dr)", "debit(inr)"],
  amount: ["amount", "transaction amount", "amount (inr)"],
  drcr: ["dr/cr", "cr/dr", "type", "transaction type", "dr / cr"],
} as const;
type Col = keyof typeof ALIASES;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function detectHeader(table: string[][]): { index: number; cols: Partial<Record<Col, number>> } | null {
  for (let r = 0; r < Math.min(table.length, 40); r++) {
    const cells = table[r].map(norm);
    const cols: Partial<Record<Col, number>> = {};
    for (const key of Object.keys(ALIASES) as Col[]) {
      const idx = cells.findIndex((c, i) => (ALIASES[key] as readonly string[]).includes(c) && !Object.values(cols).includes(i));
      if (idx >= 0) cols[key] = idx;
    }
    if (cols.date !== undefined && (cols.credit !== undefined || (cols.amount !== undefined && cols.drcr !== undefined))) {
      return { index: r, cols };
    }
  }
  return null;
}

export type BankCredit = {
  rowNumber: number;
  date: string;
  amountMinor: number;
  narration: string;
  reference: string;
  referenceSynthesized: boolean;
  method: "upi" | "neft" | "rtgs" | "imps" | "cheque" | "other";
  payerGuess: string | null;
};

export type StatementParse = { credits: BankCredit[]; skippedDebits: number; issues: { rowNumber: number; message: string }[]; headerFound: boolean };

export function detectMethod(narration: string): BankCredit["method"] {
  const n = narration.toUpperCase();
  if (/\bUPI\b|^UPI[/-]/.test(n)) return "upi";
  if (/\bNEFT\b|^NEFT[/-]/.test(n)) return "neft";
  if (/\bRTGS\b|^RTGS[/-]/.test(n)) return "rtgs";
  if (/\bIMPS\b|^IMPS[/-]|MMT\/IMPS/.test(n)) return "imps";
  if (/\bCHQ\b|CHEQUE|CLG/.test(n)) return "cheque";
  return "other";
}

/** Pull the bank's unique transaction reference (UTR / RRN) out of a narration when present. */
export function extractReference(narration: string): string | null {
  const n = narration.toUpperCase();
  const patterns = [
    /UPI[/-](\d{12})\b/, // UPI RRN is 12 digits
    /\b(?:NEFT|RTGS)[/-]?(?:CR[/-])?([A-Z]{4}[A-Z0-9]{8,18})\b/, // UTR starts with IFSC bank code
    /IMPS[/-](?:P2A[/-])?(\d{12})\b/,
    /\bUTR[:\s#-]*([A-Z0-9]{12,22})\b/,
  ];
  for (const p of patterns) {
    const m = p.exec(n);
    if (m) return m[1];
  }
  return null;
}

/** Best-effort payer name for display: the longest alphabetic segment of the narration. */
export function guessPayer(narration: string): string | null {
  const parts = narration
    .split(/[/\-|:]+/)
    .map((p) => p.trim())
    .filter((p) => /^[A-Za-z][A-Za-z .&']{3,}$/.test(p) && !/^(NEFT|RTGS|IMPS|UPI|CR|DR|INB|MOB|P2A|P2M|TRANSFER|PAYMENT|SALARY)$/i.test(p));
  if (parts.length === 0) return null;
  return parts.sort((a, b) => b.length - a.length)[0];
}

function isBlankRef(v: string) {
  return !v || /^0+$/.test(v) || v === "-" || v.toUpperCase() === "NA";
}

export function parseBankStatement(text: string): StatementParse {
  const table = parseCsv(text);
  const header = detectHeader(table);
  if (!header) return { credits: [], skippedDebits: 0, issues: [], headerFound: false };
  const { cols } = header;
  const credits: BankCredit[] = [];
  const issues: StatementParse["issues"] = [];
  let skippedDebits = 0;

  for (let r = header.index + 1; r < table.length; r++) {
    const row = table[r];
    const rowNumber = r + 1;
    const cell = (c: Col) => (cols[c] === undefined ? "" : (row[cols[c]!] ?? "").trim());
    const dateText = cell("date");
    if (!dateText || /^\*+$/.test(dateText) || /opening|closing|total/i.test(row.join(" "))) continue;

    let amountText = cell("credit");
    if (cols.credit === undefined) {
      const kind = cell("drcr").toUpperCase();
      if (!kind.startsWith("CR") && kind !== "C" && kind !== "CREDIT") {
        if (cell("amount")) skippedDebits++;
        continue;
      }
      amountText = cell("amount");
    }
    if (!amountText || /^0+(\.0+)?$/.test(amountText.replace(/,/g, ""))) {
      if (cell("debit")) skippedDebits++;
      continue;
    }

    let date: string, amountMinor: number;
    try {
      date = parseFlexibleDate(dateText);
    } catch (e) {
      issues.push({ rowNumber, message: (e as Error).message });
      continue;
    }
    try {
      amountMinor = parseMoneyToMinor(amountText.replace(/\s*cr$/i, ""));
    } catch (e) {
      issues.push({ rowNumber, message: (e as Error).message });
      continue;
    }
    if (amountMinor <= 0) continue;

    const narration = cell("narration");
    const fromNarration = extractReference(narration);
    const refCol = cell("reference");
    let reference = fromNarration ?? (isBlankRef(refCol) ? "" : refCol);
    let synthesized = false;
    if (!reference) {
      // Deterministic, so re-importing the same statement produces the same reference.
      const h = createHash("sha256").update(`${date}|${amountMinor}|${narration}`).digest("hex").slice(0, 10).toUpperCase();
      reference = `BANK-${date}-${h}`;
      synthesized = true;
    }
    credits.push({
      rowNumber,
      date,
      amountMinor,
      narration,
      reference,
      referenceSynthesized: synthesized,
      method: detectMethod(narration),
      payerGuess: guessPayer(narration),
    });
  }
  return { credits, skippedDebits, issues, headerFound: true };
}
