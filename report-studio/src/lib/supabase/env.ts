// Supabase is configured by environment. Without it the studio runs in demo
// mode on the seed fixture (development only, or when GBS_DEMO_MODE=1).
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export const demoAllowed = () =>
  !supabaseEnv() && (process.env.NODE_ENV !== "production" || process.env.GBS_DEMO_MODE === "1");

export const DEMO_COOKIE = "gbs_demo_session";
