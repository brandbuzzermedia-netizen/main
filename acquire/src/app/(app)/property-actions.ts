"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { appUrl, unsubscribeSecret } from "@/lib/env";
import { sendToLead } from "@/lib/outreach";
import { fieldErrors, type FieldErrors } from "@/domain/schemas";
import { normalizeCountry } from "@/domain/normalize";
import { formatMoney, parseAmount } from "@/domain/money";
import { propertyLinkToken } from "@/domain/forms";

export type PropState = { error?: string; fieldErrors?: FieldErrors; ok?: boolean; message?: string };

const optional = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim() : v), z.string().max(max).optional());
const httpsUrl = z.preprocess((v) => (v === "" ? undefined : v), z.url("Enter a full https:// link").max(1000).refine((u) => u.startsWith("https://"), "Links must start with https://").optional());

const propertySchema = z.object({
  title: z.string().trim().min(1, "Give it a title").max(200),
  reference: optional(60),
  address: optional(300),
  city: optional(120),
  country: optional(60),
  property_type: optional(80),
  listing_type: z.enum(["sale", "rent", "off_plan"]),
  price: optional(30),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  bedrooms: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(0).max(50).optional()),
  bathrooms: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(0).max(50).optional()),
  area_sqm: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().positive().max(1_000_000).optional()),
  status: z.enum(["draft", "available", "under_offer", "sold", "let", "withdrawn"]),
  description: optional(10000),
  listing_url: httpsUrl,
  video_url: httpsUrl,
  image_url: httpsUrl,
});

export async function savePropertyAction(propertyId: string | null, _prev: PropState, formData: FormData): Promise<PropState> {
  const ctx = await requirePermission("assignLeads");
  const parsed = propertySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const price = parseAmount(v.price, v.currency);
  if (Number.isNaN(price)) return { fieldErrors: { price: ["Enter a number, e.g. 650000 or 650k"] } };
  const country = v.country ? normalizeCountry(v.country) : null;
  if (v.country && !country) return { fieldErrors: { country: ["Use a 2-letter country code"] } };
  const row = {
    title: v.title, reference: v.reference ?? null, address: v.address ?? null, city: v.city ?? null, country, property_type: v.property_type ?? null,
    listing_type: v.listing_type, price_minor: price, currency: v.currency, bedrooms: v.bedrooms ?? null, bathrooms: v.bathrooms ?? null,
    area_sqm: v.area_sqm ?? null, status: v.status, description: v.description ?? null,
    listing_url: v.listing_url ?? null, video_url: v.video_url ?? null, image_url: v.image_url ?? null,
  };
  const { data, error } = propertyId
    ? await ctx.supabase.from("properties").update(row).eq("id", propertyId).eq("organization_id", ctx.org.id).select("id").single()
    : await ctx.supabase.from("properties").insert({ ...row, organization_id: ctx.org.id, created_by: ctx.userId }).select("id").single();
  if (error) return { error: error.message.includes("properties_reference_unique") ? "Another property uses that reference." : error.message };
  revalidatePath("/properties");
  if (!propertyId) redirect(`/properties/${data.id}`);
  revalidatePath(`/properties/${propertyId}`);
  return { ok: true, message: "Saved." };
}

/**
 * Shares a property with a lead: records the interest and sends a message with a signed, per-lead
 * link (which records views). The send goes through the normal eligibility check.
 */
export async function sharePropertyAction(leadId: string, _prev: PropState, formData: FormData): Promise<PropState> {
  const ctx = await requirePermission("workCrm");
  const propertyId = String(formData.get("property_id") ?? "");
  const channel = formData.get("channel") === "sms" ? "sms" : "email";
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  const secret = unsubscribeSecret();
  if (!secret) return { error: "UNSUBSCRIBE_SECRET is not set, so tracked links cannot be created." };
  const { data: p } = await ctx.supabase.from("properties").select("id, title, city, price_minor, currency, bedrooms, listing_type, status")
    .eq("id", propertyId).eq("organization_id", ctx.org.id).maybeSingle();
  if (!p) return { error: "Choose a property." };
  if (!["available", "under_offer"].includes(p.status)) return { error: "Only available or under-offer properties can be shared." };

  const link = `${appUrl()}/p/${propertyLinkToken(secret, ctx.org.id, leadId, p.id)}`;
  const facts = [p.bedrooms !== null && `${p.bedrooms} bed`, p.city, p.price_minor !== null && formatMoney(p.price_minor, p.currency)].filter(Boolean).join(" · ");
  const body = channel === "email"
    ? `Hi {{first_name}},\n\n${note || "I thought this one might suit you:"}\n\n${p.title}${facts ? ` (${facts})` : ""}\nPhotos, video tour and details: ${link}\n\nReply to this email if you'd like to arrange a viewing.\n\n{{agent_name}}`
    : `Hi {{first_name}}, ${note || "this one might suit you"}: ${p.title}${facts ? ` (${facts})` : ""}. Video tour: ${link}`;

  try {
    const r = await sendToLead(ctx.supabase, {
      orgId: ctx.org.id, leadId, channel, subject: channel === "email" ? `${p.title}${p.city ? ` in ${p.city}` : ""}` : null, body, actorId: ctx.userId,
    });
    if (r.status !== "sent") {
      return { error: r.status === "failed" ? `Sending failed: ${r.error}` : `Not sent: ${r.error ?? r.decision.reasons.map((x) => x.message).join(" ")}` };
    }
    const { error } = await ctx.supabase.from("lead_property_interests").upsert({
      organization_id: ctx.org.id, lead_id: leadId, property_id: p.id, status: "shared", shared_at: new Date().toISOString(),
      message_id: r.messageId, created_by: ctx.userId,
    }, { onConflict: "lead_id,property_id" });
    if (error) return { error: error.message };
    revalidatePath(`/leads/${leadId}`);
    return { ok: true, message: "Shared. You'll see on this page when they open it." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Share failed" };
  }
}

export async function setInterestStatusAction(interestId: string, status: "interested" | "not_interested") {
  const ctx = await requirePermission("workCrm");
  const { data, error } = await ctx.supabase.from("lead_property_interests").update({ status }).eq("id", interestId).eq("organization_id", ctx.org.id).select("lead_id");
  if (error) throw new Error(error.message);
  if (data?.[0]) revalidatePath(`/leads/${data[0].lead_id}`);
}

// ---------------------------------------------------------------------------
// Lead forms
// ---------------------------------------------------------------------------

const formSchema = z.object({
  name: z.string().trim().min(1, "Name the form").max(80),
  headline: z.string().trim().min(1).max(160),
  intro: optional(1000),
  segment: z.enum(["buyer", "seller", "landlord", "tenant", "investor", "other"]),
  source_id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  assign_to: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  consent_email: optional(500),
  consent_sms: optional(500),
  consent_call: optional(500),
  privacy_url: httpsUrl,
  thank_you: z.string().trim().min(1).max(500),
  ask_budget: z.preprocess((v) => v === "on", z.boolean()),
  ask_location: z.preprocess((v) => v === "on", z.boolean()),
  is_active: z.preprocess((v) => v === "on", z.boolean()),
});

export async function saveLeadFormAction(formId: string | null, _prev: PropState, formData: FormData): Promise<PropState> {
  const ctx = await requirePermission("assignLeads");
  const parsed = formSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  if (v.consent_sms && !/\bSTOP\b/i.test(v.consent_sms)) return { fieldErrors: { consent_sms: ["SMS consent wording should say how to opt out, e.g. “Reply STOP to opt out.”"] } };
  const row = {
    name: v.name, headline: v.headline, intro: v.intro ?? null, segment: v.segment, source_id: v.source_id ?? null, assign_to: v.assign_to ?? null,
    consent_email: v.consent_email ?? null, consent_sms: v.consent_sms ?? null, consent_call: v.consent_call ?? null,
    privacy_url: v.privacy_url ?? null, thank_you: v.thank_you, ask_budget: v.ask_budget, ask_location: v.ask_location, is_active: v.is_active,
  };
  const { error } = formId
    ? await ctx.supabase.from("lead_forms").update(row).eq("id", formId).eq("organization_id", ctx.org.id)
    : await ctx.supabase.from("lead_forms").insert({ ...row, organization_id: ctx.org.id, created_by: ctx.userId });
  if (error) return { error: error.message.includes("must be a member") ? "Choose a member of this workspace." : error.message };
  revalidatePath("/settings/forms");
  return { ok: true, message: formId ? "Saved. Changing consent wording only affects new submissions." : "Form created." };
}
