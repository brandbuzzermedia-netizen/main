import { createHmac, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const TEMPLATE_VARIABLES = ["first_name", "full_name", "preferred_location", "property_interest", "agent_name", "company"] as const;
export type TemplateVars = Partial<Record<(typeof TEMPLATE_VARIABLES)[number], string | null>>;

/** Replaces {{variable}} placeholders. Unknown placeholders are reported, never sent raw. */
export function renderTemplate(text: string, vars: TemplateVars): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const out = text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, name: string) => {
    const v = (vars as Record<string, string | null | undefined>)[name];
    if (v === undefined || v === null || v.trim() === "") {
      missing.add(name);
      return "";
    }
    return v;
  });
  return { text: out.replace(/[ \t]{2,}/g, " ").trim(), missing: [...missing] };
}

export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? "";
}

/** Plain text to minimal, escaped HTML paragraphs. */
export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("\n");
}

export { smsSegments } from "./sms";

// ---------------------------------------------------------------------------
// Opt-out keywords (inbound SMS). Carriers also act on these; we must record them.
// ---------------------------------------------------------------------------

const STOP_WORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "optout", "opt out", "revoke", "remove me"];

export function isOptOut(body: string): boolean {
  const v = body.trim().toLowerCase().replace(/[.!]+$/, "");
  return STOP_WORDS.includes(v);
}

// ---------------------------------------------------------------------------
// Webhook signatures
// ---------------------------------------------------------------------------

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Twilio: base64 HMAC-SHA1 of the full URL followed by each POST param name+value, sorted by name. */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params).sort().reduce((s, k) => s + k + params[k], url);
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

export function verifyTwilio(authToken: string, url: string, params: Record<string, string>, header: string | null): boolean {
  return Boolean(header) && safeEqual(twilioSignature(authToken, url, params), header!);
}

/**
 * Resend webhooks are signed with Svix: base64 HMAC-SHA256 of `${id}.${timestamp}.${body}` using the
 * base64 secret after "whsec_". The header may hold several "v1,<sig>" entries.
 * Rejects timestamps more than 5 minutes from now (replay protection).
 */
export function verifySvix(secret: string, headers: { id: string | null; timestamp: string | null; signature: string | null }, body: string, now = Date.now()): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    return version === "v1" && Boolean(sig) && safeEqual(sig, expected);
  });
}

// ---------------------------------------------------------------------------
// Unsubscribe links (no sign-in needed, so the link itself is the credential)
// ---------------------------------------------------------------------------

export function unsubscribeToken(secret: string, orgId: string, leadId: string): string {
  const payload = Buffer.from(`${orgId}.${leadId}`).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url").slice(0, 32);
  return `${payload}.${sig}`;
}

export function readUnsubscribeToken(secret: string, token: string): { orgId: string; leadId: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url").slice(0, 32);
  if (!safeEqual(sig, expected)) return null;
  const [orgId, leadId] = Buffer.from(payload, "base64url").toString().split(".");
  const uuid = /^[0-9a-f-]{36}$/i;
  return uuid.test(orgId ?? "") && uuid.test(leadId ?? "") ? { orgId, leadId } : null;
}

// ---------------------------------------------------------------------------
// Sequences
// ---------------------------------------------------------------------------

export type Step = { channel: "email" | "sms"; template_id: string; delay_days: number };

/** When the next step is due, measured from when the previous step ran (or from enrollment). */
export function nextRunAt(steps: Step[], nextIndex: number, from: Date): Date | null {
  const step = steps[nextIndex];
  return step ? new Date(from.getTime() + step.delay_days * 86_400_000) : null;
}

export type StepOutcome =
  | { kind: "send" }
  | { kind: "defer"; until: Date }
  | { kind: "hold"; reason: string }
  | { kind: "skip"; reason: string };

/**
 * What to do with a due step, given the eligibility decision for its channel at this moment.
 * A blocked step is skipped (the sequence continues on other steps); a step that needs review
 * holds the whole enrollment for a person; outside hours waits for the window.
 */
export function decideStep(decision: { decision: "allow" | "defer" | "review" | "block"; notBefore?: Date; reasons: { message: string }[] }): StepOutcome {
  switch (decision.decision) {
    case "allow": return { kind: "send" };
    case "defer": return decision.notBefore ? { kind: "defer", until: decision.notBefore } : { kind: "hold", reason: "No permitted contact time in the next 8 days" };
    case "review": return { kind: "hold", reason: decision.reasons.map((r) => r.message).join(" ") };
    case "block": return { kind: "skip", reason: decision.reasons.map((r) => r.message).join(" ") };
  }
}
