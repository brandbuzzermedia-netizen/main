"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCompanyContext } from "@/lib/workspace";

export async function logOutcomeAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) throw new Error("Not allowed");
  const contact = z.uuid().parse(fd.get("contact_id"));
  const kind = z.enum(["call", "email", "whatsapp", "linkedin", "facebook", "instagram", "reply", "unsubscribe", "note"]).parse(fd.get("kind"));
  const outcome = z.enum(["connected", "no_answer", "voicemail", "positive", "objection", "not_now", "referral", "wrong_contact", "out_of_office", "sent", "other"]).nullable().catch(null).parse(fd.get("outcome"));
  const { error } = await ctx.supabase.from("outreach_events").insert({ organization_id: ctx.company.id, contact_id: contact, kind, outcome, notes: String(fd.get("notes") ?? "").slice(0, 2000) || null });
  if (error) throw new Error(error.message);
  if (outcome === "positive") await ctx.supabase.from("contacts").update({ lead_status: "qualified" }).eq("id", contact);
  else if (kind !== "note" && kind !== "unsubscribe") await ctx.supabase.from("contacts").update({ lead_status: "contacted" }).eq("id", contact).eq("lead_status", "new");
  revalidatePath(`/c/${slug}/outreach`);
  const back = String(fd.get("back") ?? "");
  if (back.startsWith(`/c/${slug}/outreach`)) redirect(back);
}

/** Setter hands a deal to a closer: the closer becomes the owner; the setter is recorded. */
export async function handoverAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) throw new Error("Not allowed");
  const deal = z.uuid().parse(fd.get("deal_id"));
  const closer = z.uuid().parse(fd.get("closer_id"));
  const { data: d } = await ctx.supabase.from("deals").select("owner_id").eq("id", deal).single();
  const { error } = await ctx.supabase.from("deals").update({ setter_id: d?.owner_id ?? ctx.userId, owner_id: closer, handed_over_at: new Date().toISOString(),
    next_action: String(fd.get("note") ?? "").slice(0, 300) || "Closer to call" }).eq("id", deal).eq("organization_id", ctx.company.id);
  if (error) throw new Error(ctx.can("crm.read_all") ? error.message : "Only managers can reassign deals. Ask your sales manager to hand it over.");
  revalidatePath(`/c/${slug}/outreach`);
}

// --- Growth systems: tasks, posts, listening, AI calls, sequences ------------------------------

async function writer(slug: string) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) throw new Error("Not allowed");
  return ctx;
}
const back = (slug: string, ch: string, note?: string) => redirect(`/c/${slug}/outreach?ch=${ch}${note ? `&note=${encodeURIComponent(note)}` : ""}`);
const KIND: Record<string, "linkedin" | "facebook" | "instagram" | "call" | "email" | "whatsapp" | "note"> = { linkedin: "linkedin", facebook: "facebook", instagram: "instagram", call: "call", email: "email", whatsapp: "whatsapp", reddit: "note" };

/** Done / Skipped / Replied on an assisted step. A reply stops the lead's sequence. */
export async function taskOutcomeAction(slug: string, fd: FormData) {
  const ctx = await writer(slug);
  const id = z.uuid().parse(fd.get("task_id"));
  const status = z.enum(["done", "skipped", "replied"]).parse(fd.get("status"));
  const { data: t, error } = await ctx.supabase.from("outreach_tasks").update({ status, done_at: new Date().toISOString() }).eq("id", id).eq("organization_id", ctx.company.id).select("contact_id, channel, step, enrollment_id").single();
  if (error) throw new Error(error.message);
  if (t.contact_id && status !== "skipped") {
    await ctx.supabase.from("outreach_events").insert({ organization_id: ctx.company.id, contact_id: t.contact_id, kind: status === "replied" ? "reply" : KIND[t.channel] ?? "note",
      outcome: status === "replied" ? "positive" : "sent", notes: `${t.channel} ${t.step.replace("_", " ")}` });
    if (status === "replied") {
      if (t.enrollment_id) await ctx.supabase.from("outreach_enrollments").update({ status: "stopped_reply" }).eq("id", t.enrollment_id);
      await ctx.supabase.from("contacts").update({ lead_status: "qualified" }).eq("id", t.contact_id);
    }
  }
  back(slug, String(fd.get("ch") ?? t.channel));
}

export async function createPostAction(slug: string, fd: FormData) {
  const ctx = await writer(slug);
  const v = z.object({ channel: z.enum(["linkedin", "facebook", "instagram"]), body: z.string().trim().min(1).max(3000), media_url: z.string().url().startsWith("https://").optional().or(z.literal("")),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/) }).safeParse(Object.fromEntries(fd));
  if (!v.success) back(slug, String(fd.get("channel") ?? "linkedin"), "Check the post: text, date and time are needed; Instagram needs an image link.");
  const p = v.data!;
  const { error } = await ctx.supabase.from("content_posts").insert({ organization_id: ctx.company.id, channel: p.channel, body: p.body, media_url: p.media_url || null,
    scheduled_at: new Date(`${p.date}T${p.time}:00+05:30`).toISOString() });
  back(slug, p.channel, error ? (error.message.includes("check") ? "Instagram posts need an image link." : error.message) : "Draft saved. It publishes after approval.");
}

export async function postDecisionAction(slug: string, fd: FormData) {
  const ctx = await writer(slug);
  const id = z.uuid().parse(fd.get("post_id")); const ch = String(fd.get("ch") ?? "linkedin");
  const { error } = fd.get("decision") === "approve" ? await ctx.supabase.rpc("approve_post", { p_post: id })
    : await ctx.supabase.from("content_posts").update({ status: "cancelled" }).eq("id", id).eq("organization_id", ctx.company.id);
  back(slug, ch, error ? error.message : undefined);
}

export async function keywordAction(slug: string, fd: FormData) {
  const ctx = await writer(slug);
  if (fd.get("remove")) {
    await ctx.supabase.from("listen_keywords").delete().eq("id", z.uuid().parse(fd.get("remove"))).eq("organization_id", ctx.company.id);
    back(slug, "reddit");
  }
  const v = z.object({ keyword: z.string().trim().min(2).max(80), subreddit: z.string().trim().regex(/^[A-Za-z0-9_]{2,21}$/).optional().or(z.literal("")) }).safeParse({ keyword: fd.get("keyword"), subreddit: String(fd.get("subreddit") ?? "").replace(/^r\//, "") });
  if (!v.success) back(slug, "reddit", "Enter a keyword (2–80 letters) and an optional subreddit name.");
  const { error } = await ctx.supabase.from("listen_keywords").insert({ organization_id: ctx.company.id, keyword: v.data!.keyword, subreddit: v.data!.subreddit || null });
  back(slug, "reddit", error ? (error.code === "23505" ? "That keyword is already watched." : error.message) : undefined);
}

export async function signalAction(slug: string, fd: FormData) {
  const ctx = await writer(slug);
  const id = z.uuid().parse(fd.get("signal_id")); const ch = String(fd.get("ch") ?? "reddit");
  const status = z.enum(["drafted", "replied", "ignored"]).parse(fd.get("status"));
  const draft = String(fd.get("draft_reply") ?? "").slice(0, 3000) || null;
  await ctx.supabase.from("social_signals").update({ status, ...(draft !== null ? { draft_reply: draft } : {}) }).eq("id", id).eq("organization_id", ctx.company.id);
  back(slug, ch);
}

export async function queueCallAction(slug: string, fd: FormData) {
  const ctx = await writer(slug);
  if (fd.get("cancel")) {
    await ctx.supabase.from("voice_calls").update({ status: "cancelled" }).eq("id", z.uuid().parse(fd.get("cancel"))).eq("organization_id", ctx.company.id);
    back(slug, "ai-calls");
  }
  const { error } = await ctx.supabase.rpc("queue_voice_call", { p_contact: z.uuid().parse(fd.get("contact_id")),
    p_purpose: z.enum(["qualify", "follow_up", "payment_reminder", "meeting_reminder"]).parse(fd.get("purpose")) });
  back(slug, "ai-calls", error ? error.message : "Call queued. It runs in the next calling window after approval.");
}

const PRESETS: Record<string, { name: string; steps: { channel: string; action?: string; delay_days: number; template: string }[] }> = {
  linkedin: { name: "LinkedIn engagement", steps: [
    { channel: "linkedin", action: "follow", delay_days: 0, template: "Follow {{first_name}} and read their recent activity." },
    { channel: "linkedin", action: "comment", delay_days: 1, template: "Thoughtful point, {{first_name}}. [add one specific insight from your experience]" },
    { channel: "linkedin", action: "connect", delay_days: 1, template: "Hi {{first_name}}, enjoyed your post. I work with teams like {{company}}; would be good to connect." },
    { channel: "linkedin", action: "message", delay_days: 2, template: "Thanks for connecting, {{first_name}}. Curious how {{company}} handles [problem you solve]?" },
    { channel: "linkedin", action: "follow_up", delay_days: 4, template: "Hi {{first_name}}, sharing a short case study that may help {{company}}. Worth a 15-minute call?" },
    { channel: "linkedin", action: "follow_up", delay_days: 7, template: "Last note from me, {{first_name}}. Happy to help whenever the timing is right." } ] },
  email: { name: "Email outreach", steps: [
    { channel: "email", delay_days: 0, template: "Hi {{first_name}}, a quick idea for {{company}}: [one-line value]. Open to a 15-minute call this week?" },
    { channel: "email", delay_days: 3, template: "Hi {{first_name}}, following up in case this got buried. [short proof point]" },
    { channel: "email", delay_days: 4, template: "Hi {{first_name}}, one example of what this looked like for a similar business: [result]." },
    { channel: "email", delay_days: 7, template: "Hi {{first_name}}, I'll close the loop here. Reply any time if it becomes relevant." } ] },
  whatsapp: { name: "WhatsApp follow-up (opted-in leads)", steps: [
    { channel: "whatsapp", delay_days: 0, template: "approved_template:intro" },
    { channel: "whatsapp", delay_days: 2, template: "approved_template:follow_up" } ] },
  instagram: { name: "Instagram engagement", steps: [
    { channel: "instagram", action: "follow", delay_days: 0, template: "Follow and watch their stories." },
    { channel: "instagram", action: "comment", delay_days: 1, template: "Genuine comment on their latest post." },
    { channel: "instagram", action: "comment", delay_days: 3, template: "Reply to a story or comment again; DM only after they engage." } ] },
  facebook: { name: "Facebook engagement", steps: [
    { channel: "facebook", action: "follow", delay_days: 0, template: "Follow their Page and engage with a recent post." },
    { channel: "facebook", action: "comment", delay_days: 2, template: "Helpful comment on their Page post." } ] },
  multi: { name: "Multi-channel (email, LinkedIn, call)", steps: [
    { channel: "email", delay_days: 0, template: "Hi {{first_name}}, a quick idea for {{company}}: [one-line value]." },
    { channel: "linkedin", action: "connect", delay_days: 1, template: "Hi {{first_name}}, sent you a note by email; would be good to connect." },
    { channel: "call_task", action: "call", delay_days: 2, template: "Call {{first_name}} at {{company}}; reference the email." },
    { channel: "email", delay_days: 4, template: "Hi {{first_name}}, tried you by phone. Worth a 15-minute chat?" } ] },
};

export async function presetSequenceAction(slug: string, fd: FormData) {
  const ctx = await writer(slug);
  const key = z.enum(Object.keys(PRESETS) as [string, ...string[]]).parse(fd.get("preset")); const ch = String(fd.get("ch") ?? "email");
  const p = PRESETS[key];
  const { error } = await ctx.supabase.from("outreach_sequences").insert({ organization_id: ctx.company.id, name: p.name, steps: p.steps, status: "active", requires_approval: true });
  back(slug, ch, error ? (ctx.can("crm.manage") ? error.message : "Only a sales manager or owner can add sequences.") : `"${p.name}" added. Edit the wording in Outreach → Sequences before enrolling leads.`);
}

export async function enrollAction(slug: string, fd: FormData) {
  const ctx = await writer(slug);
  const ch = String(fd.get("ch") ?? "email");
  const ids = fd.getAll("contact_id").map(String).filter(Boolean);
  const seq = z.uuid().parse(fd.get("sequence_id"));
  const rows = ids.map((c) => ({ organization_id: ctx.company.id, sequence_id: seq, contact_id: z.uuid().parse(c), next_step_at: new Date().toISOString() }));
  const { error } = rows.length ? await ctx.supabase.from("outreach_enrollments").insert(rows) : { error: { message: "Choose at least one lead." } };
  back(slug, ch, error ? (error.message.includes("duplicate") ? "That lead is already in this sequence." : error.message) : `${rows.length} lead(s) enrolled. Steps start at the next daily run.`);
}

/** Start, pause or resume a whole campaign. Paused campaigns send nothing and create no tasks. */
export async function campaignStatusAction(slug: string, fd: FormData) {
  const ctx = await writer(slug);
  const id = z.uuid().parse(fd.get("sequence_id"));
  const status = z.enum(["active", "paused", "archived"]).parse(fd.get("status"));
  const ret = String(fd.get("ret") ?? `/c/${slug}/outreach`);
  const { error, count } = await ctx.supabase.from("outreach_sequences").update({ status }, { count: "exact" }).eq("id", id).eq("organization_id", ctx.company.id);
  const msg = error || count === 0 ? "Only a sales manager or owner can start or pause campaigns." : status === "active" ? "Campaign running. Due steps go out at the next daily run." : status === "paused" ? "Campaign paused. Nothing is sent until you resume." : "Campaign archived.";
  revalidatePath(`/c/${slug}/outreach`);
  redirect(`${ret.startsWith(`/c/${slug}/outreach`) ? ret : `/c/${slug}/outreach`}${ret.includes("?") ? "&" : "?"}note=${encodeURIComponent(msg)}`);
}

/** Pause or resume one lead inside a campaign. */
export async function enrollmentStatusAction(slug: string, fd: FormData) {
  const ctx = await writer(slug);
  const id = z.uuid().parse(fd.get("enrollment_id"));
  const status = z.enum(["active", "paused", "stopped_manual"]).parse(fd.get("status"));
  await ctx.supabase.from("outreach_enrollments").update({ status }).eq("id", id).eq("organization_id", ctx.company.id).in("status", ["active", "paused"]);
  revalidatePath(`/c/${slug}/outreach`);
  redirect(`/c/${slug}/outreach?campaign=${z.uuid().parse(fd.get("sequence_id"))}`);
}
