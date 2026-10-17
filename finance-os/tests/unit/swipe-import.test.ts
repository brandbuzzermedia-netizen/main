import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "@/integrations/swipe/csv";
import { mapHeaders, normalizeRows } from "@/integrations/swipe/normalize";
import { matchClients, normalizeName, type MatchableClient } from "@/integrations/swipe/match";

const clients: MatchableClient[] = [
  { id: "c-shobha", client_code: "SHOBHA", legal_name: "Shobha Decor & Furniture Pvt. Ltd.", trading_name: "Shobha Decor",
    gstin: "29ABCDE1234F1Z5", source_aliases: [], payment_terms_days: 7 },
  { id: "c-lykes", client_code: "LYKES", legal_name: "Lykes Office Systems LLP", trading_name: null,
    gstin: null, source_aliases: ["LYKES FURNITURE"], payment_terms_days: 15 },
];

function run(csv: string) {
  const rows = parseCsv(csv);
  const mapping = mapHeaders(rows[0]);
  const normalized = normalizeRows(rows, mapping);
  const matched = matchClients(normalized.records, clients);
  return { mapping, normalized, matched };
}

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF, embedded newlines and BOM", () => {
    const text = '﻿a,b,c\r\n"1,5","say ""hi""","line1\nline2"\r\n\r\nx,,z';
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["1,5", 'say "hi"', "line1\nline2"],
      ["x", "", "z"],
    ]);
  });

  it("round-trips through toCsv", () => {
    const rows = [["Invoice No", "Customer"], ["GBS/1", 'A "B", C']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it("rejects an unterminated quote", () => {
    expect(() => parseCsv('a,"b\n')).toThrow(/unterminated/);
  });
});

describe("Swipe CSV normalization", () => {
  const csv = [
    "Invoice No.,Invoice Date,Due Date,Customer Name,GSTIN,Taxable Amount,Total Tax,Grand Total,Status,Amount Paid,Link,Notes",
    'GBS/26-27/041,01-10-2026,08-10-2026,Shobha Decor,29ABCDE1234F1Z5,"50,000.00","9,000.00","59,000.00",Unpaid,0,https://swipe.example/inv/41,x',
    'GBS/26-27/042,01-10-2026,,LYKES FURNITURE,,"10,000",1800,"11,800",Paid,11800,,',
    "GBS/26-27/043,01/10/2026,,Unknown Traders,,1000,0,1000,Cancelled,,,",
    "GBS/26-27/044,31-02-2026,,Shobha Decor,,1000,0,1000,,,,",
    "GBS/26-27/041,01-10-2026,08-10-2026,Shobha Decor,29ABCDE1234F1Z5,50000,9000,59000,Unpaid,0,https://swipe.example/inv/41,x",
    "GBS/26-27/045,01-10-2026,08-10-2026,Shobha Decor,,1000,0,1000.50,,,,",
  ].join("\n");

  it("maps Swipe-style headers and reports unknown columns", () => {
    const { mapping } = run(csv);
    expect(mapping.missing).toEqual([]);
    expect(mapping.unmapped).toEqual(["Notes"]);
  });

  it("validates rows without aborting the file", () => {
    const { normalized } = run(csv);
    expect(normalized.records.map((r) => r.invoiceNumber)).toEqual([
      "GBS/26-27/041", "GBS/26-27/042", "GBS/26-27/043", "GBS/26-27/045",
    ]);
    expect(normalized.issues).toEqual([
      expect.objectContaining({ rowNumber: 5, field: "invoiceDate" }),
    ]);
  });

  it("drops exact duplicate rows but flags conflicting duplicates", () => {
    const conflicting = csv + "\nGBS/26-27/041,01-10-2026,08-10-2026,Shobha Decor,,51000,9000,60000,Unpaid,0,,";
    const { normalized } = run(conflicting);
    expect(normalized.issues).toHaveLength(2);
    expect(normalized.records.filter((r) => r.invoiceNumber === "GBS/26-27/041")).toHaveLength(1);
    expect(normalized.issues.some((i) => /appears again/.test(i.message))).toBe(true);
  });

  it("parses amounts exactly and keeps Swipe's paid figure informational", () => {
    const { normalized } = run(csv);
    const r = normalized.records[0];
    expect(r).toMatchObject({ subtotalMinor: 5000000, taxMinor: 900000, totalMinor: 5900000, sourceReportedPaidMinor: 0 });
    expect(normalized.records[1]).toMatchObject({ sourceReportedStatus: "Paid", sourceReportedPaidMinor: 1180000 });
    expect(normalized.records[2].sourceStatus).toBe("cancelled");
  });

  it("matches clients by GSTIN, name and alias, and derives due dates from terms", () => {
    const { matched } = run(csv);
    expect(matched.rows.map((r) => [r.invoice_number, r.client_id, r.due_date, r.due_date_derived])).toEqual([
      ["GBS/26-27/041", "c-shobha", "2026-10-08", false],
      ["GBS/26-27/042", "c-lykes", "2026-10-16", true],
      ["GBS/26-27/045", "c-shobha", "2026-10-08", false],
    ]);
    expect(matched.unmatchedCustomers).toEqual([{ name: "Unknown Traders", rows: 1 }]);
  });

  it("reports missing required columns", () => {
    const { mapping } = run("Invoice No,Customer\nX,Y");
    expect(mapping.missing).toEqual(["invoiceDate", "total"]);
  });

  it("refuses ambiguous name matches", () => {
    const dupClients = [...clients, { ...clients[0], id: "c-other", client_code: "SHOBHA2", gstin: null }];
    const rows = parseCsv("Invoice No,Invoice Date,Customer,Total\nA1,01-10-2026,Shobha Decor,100");
    const n = normalizeRows(rows, mapHeaders(rows[0]));
    const m = matchClients(n.records, dupClients);
    expect(m.rows).toHaveLength(0);
    expect(m.issues[0].message).toMatch(/matches 2 clients/);
  });
});

describe("normalizeName", () => {
  it("ignores legal suffixes, punctuation and accents", () => {
    expect(normalizeName("Shobha Décor & Furniture Pvt. Ltd.")).toBe("shobha decor and furniture");
    expect(normalizeName("LYKES OFFICE SYSTEMS LLP")).toBe("lykes office systems");
  });
});
