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

export function hasServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

export const isDevelopment = process.env.NODE_ENV === "development";

/** Email via Resend. Off until a key is set. */
export function resendConfig() {
  return { apiKey: process.env.RESEND_API_KEY ?? "", webhookSecret: process.env.RESEND_WEBHOOK_SECRET ?? "", enabled: Boolean(process.env.RESEND_API_KEY) };
}

/** SMS via Twilio. Off until the account SID and auth token are set. */
export function twilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  return { accountSid, authToken, enabled: Boolean(accountSid && authToken) };
}

/** Claude for AI qualification. Off until a key is set. */
export function anthropicConfig() {
  return { enabled: Boolean(process.env.ANTHROPIC_API_KEY), model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5" };
}

/** Signs unsubscribe links. Required before any marketing email is sent. */
export function unsubscribeSecret(): string | null {
  const v = process.env.UNSUBSCRIBE_SECRET ?? "";
  return v.length >= 32 ? v : null;
}

/** Bearer secret for the scheduled job endpoint (Vercel Cron sends CRON_SECRET). */
export function cronSecret(): string | null {
  const v = process.env.CRON_SECRET ?? "";
  return v.length >= 32 ? v : null;
}
