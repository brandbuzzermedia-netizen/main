import type { NextRequest } from "next/server";
import { legacyRedirect } from "@/lib/legacy-redirect";

export async function GET(request: NextRequest, { params }: RouteContext<"/clients/[[...rest]]">) {
  const { rest = [] } = await params;
  return legacyRedirect(request, ["/clients", ...rest.map(encodeURIComponent)].join("/"));
}
