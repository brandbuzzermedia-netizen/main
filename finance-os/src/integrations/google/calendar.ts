import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/env";
import { eventBody, type MeetingInput } from "./event";

/**
 * Google Calendar and Meet for each person's own Google account (OAuth, offline access).
 * Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel. Tokens are encrypted with a key derived
 * from the client secret before they are stored; rotating the secret means people connect again.
 * Only the calendar.events scope is asked for: the OS can add and change events, not read mail or files.
 */

export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  return { enabled: Boolean(clientId && clientSecret), clientId, clientSecret, redirectUri: `${appUrl().replace(/\/$/, "")}/api/google/callback` };
}

export function authUrl(state: string): string {
  const c = googleConfig();
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({ client_id: c.clientId, redirect_uri: c.redirectUri, response_type: "code", scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state }).toString();
  return u.toString();
}

const key = () => Buffer.from(hkdfSync("sha256", googleConfig().clientSecret, "diwani-os", "google-tokens", 32));
export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
}
export function open(sealed: string): string | null {
  try {
    const [v, iv, tag, body] = sealed.split(".");
    if (v !== "v1") return null;
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
  } catch { return null; }
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope?: string; id_token?: string; error?: string };
async function tokenCall(params: Record<string, string>): Promise<TokenResponse> {
  const c = googleConfig();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...params }), signal: AbortSignal.timeout(10000),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok) throw new Error(json.error ?? `google_${res.status}`);
  return json;
}

/** Exchanges the sign-in code and stores the encrypted tokens for the signed-in person. */
export async function connect(db: SupabaseClient, userId: string, code: string): Promise<string | null> {
  const t = await tokenCall({ code, grant_type: "authorization_code", redirect_uri: googleConfig().redirectUri });
  if (!t.refresh_token) throw new Error("no_refresh_token");
  // The id_token comes straight from Google's token endpoint over TLS, so its claims can be read without re-verifying.
  let email: string | null = null;
  try { email = JSON.parse(Buffer.from((t.id_token ?? "").split(".")[1] ?? "", "base64url").toString()).email ?? null; } catch { email = null; }
  const { error } = await db.from("google_connections").upsert({
    user_id: userId, google_email: email, refresh_token_enc: seal(t.refresh_token), access_token_enc: seal(t.access_token),
    access_expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(), scope: t.scope ?? null,
  });
  if (error) throw new Error(error.message);
  return email;
}

export async function connection(db: SupabaseClient, userId: string) {
  const { data } = await db.from("google_connections").select("google_email, created_at").eq("user_id", userId).maybeSingle();
  return data as { google_email: string | null; created_at: string } | null;
}

/** A valid access token for this person, refreshed when needed. Null when not connected or access was revoked. */
export async function accessToken(db: SupabaseClient, userId: string): Promise<string | null> {
  if (!googleConfig().enabled) return null;
  const { data } = await db.from("google_connections").select("refresh_token_enc, access_token_enc, access_expires_at").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  if (data.access_token_enc && data.access_expires_at && new Date(data.access_expires_at).getTime() > Date.now()) {
    const a = open(data.access_token_enc);
    if (a) return a;
  }
  const refresh = open(data.refresh_token_enc);
  if (!refresh) return null;
  try {
    const t = await tokenCall({ refresh_token: refresh, grant_type: "refresh_token" });
    await db.from("google_connections").update({ access_token_enc: seal(t.access_token), access_expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString() }).eq("user_id", userId);
    return t.access_token;
  } catch (e) {
    if (e instanceof Error && e.message === "invalid_grant") await db.from("google_connections").delete().eq("user_id", userId);
    return null;
  }
}

export async function disconnect(db: SupabaseClient, userId: string) {
  const { data } = await db.from("google_connections").select("refresh_token_enc").eq("user_id", userId).maybeSingle();
  const refresh = data ? open(data.refresh_token_enc) : null;
  if (refresh) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: "POST", signal: AbortSignal.timeout(8000) }).catch(() => undefined);
  await db.from("google_connections").delete().eq("user_id", userId);
}

export type CreatedEvent = { id: string; htmlLink: string; meetUrl: string | null };

/** Adds the meeting to the person's Google Calendar (with a Meet link when asked) and emails the invite to the guest. */
export async function createEvent(token: string, m: MeetingInput): Promise<CreatedEvent> {
  const u = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  u.searchParams.set("conferenceDataVersion", "1");
  u.searchParams.set("sendUpdates", m.attendeeEmail ? "all" : "none");
  const res = await fetch(u, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(eventBody(m)), signal: AbortSignal.timeout(15000) });
  const json = (await res.json().catch(() => ({}))) as { id?: string; htmlLink?: string; hangoutLink?: string; conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] }; error?: { message?: string } };
  if (!res.ok || !json.id) throw new Error(json.error?.message ?? `Google Calendar error ${res.status}`);
  const meet = json.hangoutLink ?? json.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ?? null;
  return { id: json.id, htmlLink: json.htmlLink ?? "", meetUrl: meet && meet.startsWith("https://meet.google.com/") ? meet : null };
}
