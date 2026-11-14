import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { verify } from "@/integrations/n8n/signing";

/**
 * Everything n8n brings in from outside, for one company: new leads (Meta lead forms, website,
 * WhatsApp, Instagram, Facebook, LinkedIn), incoming messages, Reddit conversations, post
 * results and AI call results. Signed like the callback (HMAC + timestamp + single-use nonce)
 * and schema-checked; the company must exist and not be under emergency stop for new outreach.
 */
const org = z.uuid();
const url = z.string().url().startsWith("https://").max(2000);
const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("lead"), organization_id: org, full_name: z.string().trim().min(1).max(200), email: z.email().optional(), phone_e164: z.string().regex(/^\+[1-9][0-9]{7,14}$/).optional(),
    company_name: z.string().max(200).optional(), source: z.string().max(80), consent: z.boolean().default(false), basis: z.enum(["legitimate_interest"]).optional(), search_id: z.uuid().optional(), linkedin_url: url.optional(), facebook_url: url.optional(),
    instagram_handle: z.string().regex(/^[A-Za-z0-9._]{1,30}$/).optional(), notes: z.string().max(2000).optional() }),
  z.object({ type: z.literal("message"), organization_id: org, channel: z.enum(["email", "whatsapp", "facebook", "instagram", "linkedin"]),
    from: z.string().max(200), text: z.string().max(4000), url: url.optional() }),
  z.object({ type: z.literal("signal"), organization_id: org, channel: z.enum(["reddit", "facebook", "instagram", "linkedin"]), kind: z.enum(["post", "comment", "message"]).default("post"),
    source_url: url, author: z.string().max(120).optional(), title: z.string().max(500).optional(), snippet: z.string().max(4000).optional(), matched_keyword: z.string().max(80).optional() }),
  z.object({ type: z.literal("post_result"), organization_id: org, post_id: z.uuid(), status: z.enum(["published", "failed"]), external_url: url.optional(), error: z.string().max(1000).optional() }),
  z.object({ type: z.literal("call_result"), organization_id: org, call_id: z.uuid(), status: z.enum(["calling", "completed", "failed", "no_answer"]),
    outcome: z.enum(["interested", "not_interested", "callback", "meeting_booked", "wrong_number", "do_not_call"]).optional(), summary: z.string().max(4000).optional(), recording_url: url.optional() }),
]);

export async function POST(request: NextRequest) {
  const body = await request.text();
  if (body.length > 64_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const h = request.headers;
  const check = verify(process.env.N8N_SIGNING_SECRET ?? "", { timestamp: h.get("x-dp-timestamp"), nonce: h.get("x-dp-nonce"), signature: h.get("x-dp-signature") }, body);
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 401 });
  let m: z.infer<typeof schema>;
  try { m = schema.parse(JSON.parse(body)); } catch { return NextResponse.json({ error: "invalid_payload" }, { status: 400 }); }
  const db = createAdminClient();
  if ((await db.from("webhook_nonces").insert({ nonce: h.get("x-dp-nonce") })).error) return NextResponse.json({ error: "replayed" }, { status: 409 });
  const { data: co } = await db.from("organizations").select("id, emergency_stop").eq("id", m.organization_id).maybeSingle();
  if (!co) return NextResponse.json({ error: "unknown_company" }, { status: 404 });

  /** Matches an existing lead by email, phone or social handle so the same person is never added twice. */
  const findContact = async (key: { email?: string; phone?: string; handle?: string; url?: string }) => {
    const ors = [key.email && `email.eq.${key.email.toLowerCase()}`, key.phone && `phone_e164.eq.${key.phone}`, key.handle && `instagram_handle.eq.${key.handle}`,
      key.url && `linkedin_url.eq.${key.url}`, key.url && `facebook_url.eq.${key.url}`].filter(Boolean).join(",");
    if (!ors) return null;
    const { data } = await db.from("contacts").select("id").eq("organization_id", m.organization_id).or(ors).limit(1).maybeSingle();
    return (data?.id as string | undefined) ?? null;
  };

  if (m.type === "lead") {
    const existing = await findContact({ email: m.email, phone: m.phone_e164, handle: m.instagram_handle, url: m.linkedin_url ?? m.facebook_url });
    if (existing) {
      await db.from("outreach_events").insert({ organization_id: m.organization_id, contact_id: existing, kind: "note", notes: `New enquiry via ${m.source}${m.notes ? `: ${m.notes}` : ""}` });
      return NextResponse.json({ ok: true, contact_id: existing, duplicate: true });
    }
    const { data, error } = await db.from("contacts").insert({
      organization_id: m.organization_id, full_name: m.full_name, email: m.email?.toLowerCase() ?? null, phone_e164: m.phone_e164 ?? null, company_name: m.company_name ?? null,
      source: m.source, lead_status: "new", consent_basis: m.consent ? "consent" : m.basis ?? "none", consent_at: m.consent || m.basis ? new Date().toISOString() : null,
      consent_note: m.basis ? `Bought data (${m.source}); legitimate interest, B2B. Email/LinkedIn/calls only, never WhatsApp.` : null,
      linkedin_url: m.linkedin_url ?? null, facebook_url: m.facebook_url ?? null, instagram_handle: m.instagram_handle ?? null,
    }).select("id").single();
    if (error) return NextResponse.json({ error: "lead_failed" }, { status: 422 });
    if (m.search_id) {
      // Saved search with a campaign: enrol the new lead straight away (sends still respect account limits and the weekly cap).
      const { data: ls } = await db.from("lead_searches").select("enroll_sequence_id").eq("id", m.search_id).eq("organization_id", m.organization_id).maybeSingle();
      if (ls?.enroll_sequence_id) await db.from("outreach_enrollments").insert({ organization_id: m.organization_id, sequence_id: ls.enroll_sequence_id, contact_id: data.id });
    }
    return NextResponse.json({ ok: true, contact_id: data.id });
  }
  if (m.type === "message") {
    const isEmail = m.from.includes("@"); const isPhone = /^\+[1-9][0-9]{7,14}$/.test(m.from);
    let contact = await findContact({ email: isEmail ? m.from : undefined, phone: isPhone ? m.from : undefined, handle: !isEmail && !isPhone ? m.from.replace(/^@/, "") : undefined });
    if (!contact && (isEmail || isPhone)) {
      // Someone wrote to us first: a new enquiry. No marketing consent is assumed.
      const { data } = await db.from("contacts").insert({ organization_id: m.organization_id, full_name: m.from, email: isEmail ? m.from.toLowerCase() : null,
        phone_e164: isPhone ? m.from : null, source: `${m.channel} enquiry`, lead_status: "new" }).select("id").single();
      contact = (data?.id as string | undefined) ?? null;
    }
    if (!contact) {
      await db.from("social_signals").upsert({ organization_id: m.organization_id, channel: m.channel as "facebook" | "instagram" | "linkedin", kind: "message",
        source_url: m.url ?? `https://${m.channel}.com/messages/${encodeURIComponent(m.from)}/${Date.now()}`, author: m.from, snippet: m.text }, { onConflict: "organization_id,source_url", ignoreDuplicates: true });
      return NextResponse.json({ ok: true, unmatched: true });
    }
    await db.from("outreach_events").insert({ organization_id: m.organization_id, contact_id: contact, kind: "reply", notes: `${m.channel}: ${m.text}`.slice(0, 2000) });
    await db.from("outreach_enrollments").update({ status: "stopped_reply" }).eq("contact_id", contact).eq("status", "active");
    await db.from("outreach_tasks").update({ status: "replied" }).eq("contact_id", contact).eq("status", "open");
    return NextResponse.json({ ok: true, contact_id: contact });
  }
  if (m.type === "signal") {
    const { error } = await db.from("social_signals").upsert({ organization_id: m.organization_id, channel: m.channel, kind: m.kind, source_url: m.source_url, author: m.author ?? null,
      title: m.title ?? null, snippet: m.snippet ?? null, matched_keyword: m.matched_keyword ?? null }, { onConflict: "organization_id,source_url", ignoreDuplicates: true });
    return error ? NextResponse.json({ error: "signal_failed" }, { status: 422 }) : NextResponse.json({ ok: true });
  }
  if (m.type === "post_result") {
    const { error } = await db.from("content_posts").update({ status: m.status, published_at: m.status === "published" ? new Date().toISOString() : null, external_url: m.external_url ?? null, error: m.error ?? null })
      .eq("id", m.post_id).eq("organization_id", m.organization_id).eq("status", "approved");
    return error ? NextResponse.json({ error: "post_failed" }, { status: 422 }) : NextResponse.json({ ok: true });
  }
  // call_result
  const now = new Date().toISOString();
  const { data: call } = await db.from("voice_calls").select("id, contact_id").eq("id", m.call_id).eq("organization_id", m.organization_id).maybeSingle();
  if (!call) return NextResponse.json({ error: "unknown_call" }, { status: 404 });
  await db.from("voice_calls").update({ status: m.status, outcome: m.outcome ?? null, summary: m.summary ?? null, recording_url: m.recording_url ?? null,
    ...(m.status === "calling" ? { started_at: now } : { ended_at: now }) }).eq("id", call.id);
  if (m.status !== "calling") {
    await db.from("outreach_events").insert({ organization_id: m.organization_id, contact_id: call.contact_id, kind: "call",
      outcome: m.outcome === "interested" || m.outcome === "meeting_booked" ? "positive" : m.outcome === "not_interested" ? "objection" : m.outcome === "callback" ? "not_now"
        : m.outcome === "wrong_number" ? "wrong_contact" : m.status === "no_answer" ? "no_answer" : "other",
      notes: `AI call${m.summary ? `: ${m.summary}` : ""}`.slice(0, 2000) });
    if (m.outcome === "interested" || m.outcome === "meeting_booked") await db.from("contacts").update({ lead_status: "qualified" }).eq("id", call.contact_id);
    if (m.outcome === "do_not_call") await db.from("contacts").update({ do_not_contact: true }).eq("id", call.contact_id);
  }
  return NextResponse.json({ ok: true });
}
