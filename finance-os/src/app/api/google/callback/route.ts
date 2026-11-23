import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { connect } from "@/integrations/google/calendar";

/** Google sends the person back here with a code; the state must match the cookie set when they started. */
export async function GET(req: NextRequest) {
  const { supabase, userId } = await getUser();
  const [state, back = "/"] = (req.cookies.get("dp_google_state")?.value ?? "").split("|");
  const got = req.nextUrl.searchParams.get("state") ?? "";
  const done = (note: string) => {
    const res = NextResponse.redirect(new URL(`${back}${back.includes("?") ? "&" : "?"}note=${encodeURIComponent(note)}`, req.url));
    res.cookies.delete({ name: "dp_google_state", path: "/api/google" });
    return res;
  };
  const same = state.length > 0 && got.length === state.length && timingSafeEqual(Buffer.from(got), Buffer.from(state));
  if (!same) return done("Google connection expired or did not match. Tap Connect Google again.");
  if (req.nextUrl.searchParams.get("error")) return done("Google connection was cancelled.");
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return done("Google did not send a sign-in code. Try again.");
  try {
    const email = await connect(supabase, userId, code);
    return done(`Google connected${email ? ` (${email})` : ""}. Meetings you book now go to your Google Calendar with a Meet link.`);
  } catch (e) {
    return done(e instanceof Error && e.message === "no_refresh_token"
      ? "Google did not give lasting access. Remove the OS from your Google account's third-party access, then connect again."
      : "Could not connect Google. Try again.");
  }
}
