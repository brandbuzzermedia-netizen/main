import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "gbs_session";

// Sends visitors without a session cookie to /login. The cookie's signature
// is verified on the server by getSession() in every page and route.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = pathname === "/login";
  const hasCookie = !!request.cookies.get(SESSION_COOKIE)?.value;
  if (!hasCookie && !isPublic) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/).*)"],
};
