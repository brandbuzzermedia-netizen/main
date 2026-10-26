import { toCsv } from "@/domain/csv";
import { TEMPLATE_HEADERS } from "@/domain/lead-import";
import { getContext } from "@/lib/auth";

export async function GET() {
  await getContext();
  const example = [
    "Jane Example", "jane@example.com", "+1 212 736 5000", "US", "America/New_York", "buyer", "3-bed family home", "Townhouse",
    "Brooklyn", "450k", "600k", "USD", "within 3 months", "first-time-buyer", "Met at open house",
    "yes", "no", "yes", "no", "no", "express", "Open house sign-in sheet, 12 Oct 2026 (consent wording v2)", "2026-10-12",
  ];
  const body = toCsv([TEMPLATE_HEADERS, example]);
  return new Response(`﻿${body}\r\n`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="acquire-lead-template.csv"' },
  });
}
