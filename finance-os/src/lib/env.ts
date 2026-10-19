import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return v;
}

/** Public Supabase settings. Safe for the browser (the anon key is RLS-restricted). */
export function supabasePublicEnv() {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}

/** Server-only secret. Never import this from a client component. */
export function supabaseServiceRoleKey(): string {
  return required("SUPABASE_SERVICE_ROLE_KEY");
}

export function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

/**
 * The Swipe API adapter stays off until the founder has confirmed, with a real key in the
 * Swipe API Playground, that their plan allows API access (see docs/SWIPE_INTEGRATION.md).
 */
export function swipeApiConfig() {
  return {
    enabled: process.env.SWIPE_API_ENABLED === "true",
    hasKey: Boolean(process.env.SWIPE_API_KEY),
  };
}

export const isDevelopment = process.env.NODE_ENV === "development";

/**
 * Razorpay. Use TEST-mode keys (rzp_test_…) until a test payment has gone through end to end.
 * The webhook secret is the one you type when adding the webhook in the Razorpay Dashboard;
 * it is different from the API key secret.
 */
export function razorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID ?? "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
  return {
    enabled: process.env.RAZORPAY_ENABLED === "true" && Boolean(keyId && keySecret),
    keyId,
    keySecret,
    webhookSecret,
    mode: keyId.startsWith("rzp_live_") ? ("live" as const) : keyId.startsWith("rzp_test_") ? ("test" as const) : ("unknown" as const),
    linkValidityDays: Number(process.env.RAZORPAY_LINK_VALIDITY_DAYS ?? 30),
  };
}
