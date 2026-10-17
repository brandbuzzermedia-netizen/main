import { TEMPLATE_HEADERS } from "@/integrations/swipe/csv-import";
import { toCsv } from "@/integrations/swipe/csv";
import { getUser } from "@/lib/auth";

export async function GET() {
  await getUser();
  const example = [
    "GBS/26-27/001", "01-10-2026", "08-10-2026", "Example Client Pvt Ltd", "", "01-10-2026", "31-10-2026",
    "50000.00", "9000.00", "59000.00", "Unpaid", "0", "", "",
  ];
  return new Response(toCsv([TEMPLATE_HEADERS, example]) + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="gbs-invoice-import-template.csv"',
    },
  });
}
