import type { NextRequest } from "next/server";
import { legacyRedirect } from "@/lib/legacy-redirect";

export async function GET(request: NextRequest, { params }: RouteContext<"/payments/[[...rest]]">) {
  const { rest = [] } = await params;
  return legacyRedirect(request, ["/payments", ...rest.map(encodeURIComponent)].join("/"));
}
