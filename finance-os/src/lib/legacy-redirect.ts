import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/auth";

/**
 * Old receivables addresses (/invoices, /payments, …) from before they moved under
 * /c/<company>/receivables. Sends bookmarks and old emails to the active company's page.
 */
export async function legacyRedirect(request: NextRequest, to: string) {
  const ctx = await getContext();
  return NextResponse.redirect(new URL(`${ctx.base}${to}${request.nextUrl.search}`, request.url), 308);
}
