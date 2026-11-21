import type { NextRequest } from "next/server";
import { legacyRedirect } from "@/lib/legacy-redirect";

export async function GET(request: NextRequest, { params }: RouteContext<"/tasks/[[...rest]]">) {
  const { rest = [] } = await params;
  return legacyRedirect(request, ["/tasks", ...rest.map(encodeURIComponent)].join("/"));
}
