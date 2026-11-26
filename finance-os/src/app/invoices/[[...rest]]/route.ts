import type { NextRequest } from "next/server";
import { legacyRedirect } from "@/lib/legacy-redirect";

export async function GET(request: NextRequest, { params }: RouteContext<"/invoices/[[...rest]]">) {
  const { rest = [] } = await params;
  return legacyRedirect(request, ["/invoices", ...rest.map(encodeURIComponent)].join("/"));
}
