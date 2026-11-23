import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { authUrl, googleConfig } from "@/integrations/google/calendar";

/** Starts "Connect Google": a one-time state in a short-lived cookie, then Google's consent screen. */
export async function GET(req: NextRequest) {
  await getUser();
  const back = req.nextUrl.searchParams.get("back") ?? "/";
  const safeBack = /^\/c\/[a-z0-9-]+(\/[A-Za-z0-9/_-]*)?$/.test(back) ? back : "/";
  if (!googleConfig().enabled) return NextResponse.redirect(new URL(`${safeBack}?note=${encodeURIComponent("Google is not set up yet: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel.")}`, req.url));
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authUrl(state));
  res.cookies.set("dp_google_state", `${state}|${safeBack}`, { httpOnly: true, secure: req.nextUrl.protocol === "https:", sameSite: "lax", path: "/api/google", maxAge: 600 });
  return res;
}
