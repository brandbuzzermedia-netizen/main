import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/"];
const SLUG_HEADER = "x-dp-company";

/** Refreshes the Supabase session cookie on every request and gates the app behind sign-in. */
export async function proxy(request: NextRequest) {
  // Receivables pages act on the company named in the URL. Pass it on as a header (never
  // trusted from the client); the server still checks that the user is a member.
  const headers = new Headers(request.headers);
  headers.delete(SLUG_HEADER);
  const m = /^\/c\/([a-z0-9][a-z0-9-]{1,47})\/receivables(?:\/|$)/.exec(request.nextUrl.pathname);
  if (m) headers.set(SLUG_HEADER, m[1]);
  const next = () => NextResponse.next({ request: { headers } });
  let response = next();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response; // setup page explains missing env

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        headers.set("cookie", request.cookies.toString()); // refreshed session for the page itself
        response = next();
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // getClaims() validates the JWT; do not run other code between client creation and this call.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;

  if (!signedIn && !PUBLIC_PATHS.some((p) => path.startsWith(p)) && !path.startsWith("/api/")) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = path === "/" ? "" : `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|bee.svg|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
