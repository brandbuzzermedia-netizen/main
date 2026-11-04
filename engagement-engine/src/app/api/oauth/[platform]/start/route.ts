import { NextResponse, type NextRequest } from "next/server";
import { getClientAccess, getSessionUser } from "@/lib/auth/session";
import { withSystem } from "@/lib/db";
import { enabledPlatforms } from "@/lib/env";
import { getAdapter, isPlatform, oauthConfigFor } from "@/lib/platforms/registry";
import { createOAuthState, pkcePair } from "@/lib/services/oauth";

/** Starts OAuth for one client. The state is single-use and bound to this user and this client. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const clientId = req.nextUrl.searchParams.get("clientId") ?? "";
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (!isPlatform(platform) || !enabledPlatforms().includes(platform)) return new NextResponse("Platform not enabled", { status: 400 });
  const access = await getClientAccess(user.id, clientId);
  if (!access?.canManage) return new NextResponse("Not found", { status: 404 });
  const config = oauthConfigFor(platform);
  const back = new URL(`/clients/${clientId}/accounts`, req.url);
  if (!config) {
    back.searchParams.set("error", `${platform} app credentials are not configured. Add them in the environment (see Integrations).`);
    return NextResponse.redirect(back);
  }
  const { verifier, challenge } = pkcePair();
  const state = await withSystem((db) => createOAuthState(db, { organizationId: user.organizationId, clientId, userId: user.id, platform, verifier }));
  const redirectUri = new URL(`/api/oauth/${platform}/callback`, process.env.APP_URL ?? req.url).toString();
  return NextResponse.redirect(getAdapter(platform).authorizationUrl({ state, redirectUri, codeChallenge: challenge, config }));
}
