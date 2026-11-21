import type { NextRequest } from "next/server";
import { legacyRedirect } from "@/lib/legacy-redirect";

export async function GET(request: NextRequest) {
  return legacyRedirect(request, "/integrations");
}
