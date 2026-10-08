import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { withSystem } from "@/lib/db";
import { getAdapter, isPlatform, oauthConfigFor } from "@/lib/platforms/registry";
import { readOAuthState, storePendingAccounts } from "@/lib/services/oauth";

/**
 * Exchanges the code, then holds the reachable accounts (encrypted) and sends the user to
 * pick which ones belong to this client. Nothing is attached without that choice.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code");
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (!isPlatform(platform)) return new NextResponse("Unknown platform", { status: 400 });
  const row = await withSystem((db) => readOAuthState(db, state, user.id));
  if (!row || row.platform !== platform) return new NextResponse("This connection link has expired. Start again.", { status: 400 });
  const back = new URL(`/clients/${row.client_id}/accounts`, req.url);
  const providerError = req.nextUrl.searchParams.get("error_description") ?? req.nextUrl.searchParams.get("error");
  if (providerError || !code) {
    back.searchParams.set("error", providerError ?? "Authorization was cancelled.");
    return NextResponse.redirect(back);
  }
  try {
    const redirectUri = new URL(`/api/oauth/${platform}/callback`, process.env.APP_URL ?? req.url).toString();
    const accounts = await getAdapter(platform).connectAccount({ code, redirectUri, codeVerifier: row.verifier, config: oauthConfigFor(platform)! });
    if (!accounts.length) {
      back.searchParams.set("error", "No eligible accounts were found for this login (Instagram needs a Business/Creator account linked to a Page).");
      return NextResponse.redirect(back);
    }
    await withSystem((db) => storePendingAccounts(db, state, accounts));
    const pick = new URL(`/clients/${row.client_id}/accounts/connect`, req.url);
    pick.searchParams.set("state", state);
    return NextResponse.redirect(pick);
  } catch (e) {
    back.searchParams.set("error", e instanceof Error ? e.message.slice(0, 200) : "Connection failed.");
    return NextResponse.redirect(back);
  }
}
