import { NextResponse, type NextRequest } from "next/server";

/**
 * Fast redirect for signed-out visitors. This only checks that a session cookie exists;
 * every page and action validates the session and client access on the server.
 */
export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has("gbs_session");
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = req.nextUrl.pathname === "/" ? "" : `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/cron|api/health|brand/|icon.svg|_next/static|_next/image|favicon.ico).*)"],
};
