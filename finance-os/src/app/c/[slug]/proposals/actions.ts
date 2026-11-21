"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCompanyContext } from "@/lib/workspace";
import { addDays, todayInBusinessTz } from "@/domain/dates";
import { fetchWebsite, findInOs, normaliseUrl } from "@/lib/company-research";
import { researchAndDraftProposal } from "@/integrations/ai/claude";
import { lines, mergeAiDraft, parsePriceLines, ProposalDocSchema, SERVICE_KEYS, SERVICES, templateDoc, totals, type ProposalDoc, type Research } from "@/lib/gbs-proposal";

const back = (slug: string, note: string) => redirect(`/c/${slug}/proposals?note=${encodeURIComponent(note)}`);
const rupees = z.coerce.number().min(0).max(1e10);

/** Next proposal number for this company, e.g. GBS-P-007. */
async function nextNumber(ctx: Awaited<ReturnType<typeof getCompanyContext>>) {
  const prefix = (ctx.company.short_name ?? ctx.company.name).replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase() || "CO";
  const { count } = await ctx.supabase.from("proposals").select("id", { count: "exact", head: true }).eq("organization_id", ctx.company.id);
  return `${prefix}-P-${String((count ?? 0) + 1).padStart(3, "0")}`;
}

/** Moves the linked deal to the first stage of a kind (proposal or won). */
async function moveDeal(ctx: Awaited<ReturnType<typeof getCompanyContext>>, dealId: string | null, kind: "proposal" | "won") {
  if (!dealId) return;
  const { data: stage } = await ctx.supabase.from("pipeline_stages").select("id").eq("organization_id", ctx.company.id).eq("kind", kind).order("position").limit(1).maybeSingle();
  if (!stage) return;
  const { data: deal } = await ctx.supabase.from("deals").select("stage:pipeline_stages(kind)").eq("id", dealId).maybeSingle();
  const cur = (deal?.stage as unknown as { kind: string } | null)?.kind;
  if (cur === "won" || cur === "lost" || cur === kind) return;
  await ctx.supabase.from("deals").update({ stage_id: stage.id, ...(kind === "won" ? { closed_at: new Date().toISOString() } : {}) }).eq("id", dealId);
}

export async function addProposalAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) throw new Error("Not allowed");
  const v = z.object({
    title: z.string().trim().min(2).max(200), client_name: z.string().trim().min(1).max(200), deal_id: z.uuid().nullable().catch(null),
    amount: rupees, gst: z.coerce.number().min(0).max(28), status: z.enum(["draft", "sent"]).catch("draft"),
    sent_on: z.iso.date().nullable().catch(null), follow_up_on: z.iso.date().nullable().catch(null), notes: z.string().trim().max(4000).catch(""),
  }).safeParse({ title: fd.get("title"), client_name: fd.get("client_name"), deal_id: fd.get("deal_id") || null, amount: fd.get("amount"), gst: fd.get("gst"),
    status: fd.get("status"), sent_on: fd.get("sent_on") || null, follow_up_on: fd.get("follow_up_on") || null, notes: fd.get("notes") });
  if (!v.success) back(slug, "Check the title, client and amount.");
  const p = v.data!;
  const today = todayInBusinessTz();
  const sent = p.status === "sent";
  const { error } = await ctx.supabase.from("proposals").insert({
    organization_id: ctx.company.id, number: await nextNumber(ctx), title: p.title, client_name: p.client_name, deal_id: p.deal_id,
    amount_minor: Math.round(p.amount * 100), gst_bp: Math.round(p.gst * 100), status: p.status,
    sent_on: sent ? p.sent_on ?? today : p.sent_on, follow_up_on: p.follow_up_on ?? (sent ? addDays(p.sent_on ?? today, 3) : null), notes: p.notes || null,
  });
  if (!error && sent) await moveDeal(ctx, p.deal_id, "proposal");
  revalidatePath(`/c/${slug}`, "layout");
  back(slug, error ? error.message : sent ? "Proposal saved as sent. The deal moved to Proposal; a follow-up is due in 3 days." : "Proposal saved as a draft.");
}

export async function proposalStatusAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) throw new Error("Not allowed");
  const id = z.uuid().parse(fd.get("id"));
  const status = z.enum(["sent", "accepted", "rejected"]).parse(fd.get("status"));
  const today = todayInBusinessTz();
  const { data: p } = await ctx.supabase.from("proposals").select("deal_id, sent_on").eq("id", id).eq("organization_id", ctx.company.id).maybeSingle();
  if (!p) back(slug, "Proposal not found.");
  const patch = status === "sent" ? { status, sent_on: p!.sent_on ?? today, follow_up_on: addDays(today, 3) } : { status, decided_on: today, follow_up_on: null };
  const { error } = await ctx.supabase.from("proposals").update(patch).eq("id", id);
  if (!error) await moveDeal(ctx, p!.deal_id as string | null, status === "accepted" ? "won" : "proposal");
  revalidatePath(`/c/${slug}`, "layout");
  back(slug, error ? error.message : status === "accepted" ? "Accepted: the deal is marked Won. Raise the invoice from the pipeline." : status === "sent" ? "Marked sent; follow-up due in 3 days." : "Marked not accepted.");
}

// ---- Branded proposals (Get Bee Seen format) ----


/**
 * "Company name and details" in, a drafted proposal out. Facts come from the OS records and the
 * company's website (always), and from AI web research when AI is switched on with budget left.
 * The proposal is saved as a draft for a person to check and edit; nothing is sent.
 */
export async function createBrandedProposalAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) throw new Error("Not allowed");
  const s = (k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);
  const company = s("company", 200);
  const services = SERVICE_KEYS.filter((k) => fd.get(`svc_${k}`) === "on").map((key) => ({ key, amount: Math.max(0, Number(String(fd.get(`price_${key}`) ?? "").replace(/[^\d.]/g, "")) || 0) }));
  if (company.length < 2 || services.length === 0) back(slug, "Enter the company name and choose at least one service.");
  if (services.some((x) => x.amount <= 0)) back(slug, "Enter a price for every service you chose.");
  const rawSite = s("website", 300);
  const website = rawSite ? normaliseUrl(rawSite) : null;
  if (rawSite && !website) back(slug, "That website address does not look right. Use a form like acme.in or https://acme.in");
  const input = { company, industry: s("industry", 120), city: s("city", 120), contact: s("contact", 120), notes: s("notes", 1500) };
  const dealId = z.uuid().safeParse(fd.get("deal_id")).data ?? null;

  const [site, os, { data: settings }, { data: remaining }] = await Promise.all([
    website ? fetchWebsite(website).catch(() => null) : Promise.resolve(null),
    findInOs(ctx.supabase, ctx.company.id, company),
    ctx.supabase.from("app_settings").select("ai_enabled").eq("organization_id", ctx.company.id).maybeSingle(),
    ctx.supabase.rpc("ai_budget_remaining", { p_org: ctx.company.id }),
  ]);
  const known = [
    site ? `Website ${site.url}\nTitle: ${site.title}\nDescription: ${site.description}\nHeadings: ${site.headings.join(" | ")}\nText: ${site.text}\nSocial: ${site.social.join(", ")}` : "",
    os.contacts.length ? `CRM contacts: ${os.contacts.map((c) => `${c.name} (${c.company})`).join("; ")}` : "",
    os.deals.length ? `CRM deals: ${os.deals.map((d) => `${d.title}${d.next ? `, next: ${d.next}` : ""}`).join("; ")}` : "",
  ].filter(Boolean).join("\n\n");

  const aiAllowed = Boolean(settings?.ai_enabled) && Number(remaining ?? 0) > 60000;
  const ai = aiAllowed ? await researchAndDraftProposal({ ...input, website: website ?? "", services: services.map((x) => SERVICES[x.key].label), known }) : null;
  if (ai && !ai.usage.is_mock) {
    await ctx.supabase.from("ai_usage_log").insert({ organization_id: ctx.company.id, user_id: ctx.userId, purpose: "other", model: ai.usage.model,
      input_tokens: ai.usage.input_tokens, output_tokens: ai.usage.output_tokens, refused: ai.usage.refused, outcome: ai.error ? "error" : "draft" });
  }
  const r = ai?.result?.research;
  const research: Research | null = r ? { about: r.about.slice(0, 800), industry: r.industry.slice(0, 120), city: r.city.slice(0, 120), audience: r.audience.slice(0, 300), website: r.website.slice(0, 300), observations: r.observations.slice(0, 6).map((o) => o.slice(0, 240)), sources: r.sources.slice(0, 8).map((o) => o.slice(0, 300)) }
    : site ? { about: site.description || site.text.slice(0, 400), industry: input.industry, city: input.city, audience: "", website: site.url, observations: [], sources: [site.url] } : null;
  const base = templateDoc({ ...input, services, research });
  const doc = mergeAiDraft(ai?.result?.doc ?? null, base);
  const mode = ai?.result ? "ai" : "template";
  const note = !aiAllowed ? "AI research is off for this company (or over budget), so this draft uses the GBS template with the website and CRM facts. Switch AI on and add the Anthropic key to research companies by name."
    : ai?.error === "mock" ? "No Anthropic key is set, so this draft uses the GBS template with the website and CRM facts."
    : ai?.error ? "AI research did not finish, so this draft uses the GBS template. Try again later." : r?.confidence === "low" ? "AI could not identify this company with certainty. Check the research before sending." : "";
  const t = totals(doc.pricing.rows);
  const finalSite = website ?? (research?.website ? normaliseUrl(research.website) : null);
  const { data: row, error } = await ctx.supabase.from("proposals").insert({
    organization_id: ctx.company.id, number: await nextNumber(ctx), title: `${services.map((x) => SERVICES[x.key].short).slice(0, 3).join(" + ")} proposal`.slice(0, 200), client_name: company,
    deal_id: dealId, amount_minor: Math.round(t.firstMonth * 100), status: "draft", doc, website: finalSite,
    research: { mode, note, confidence: r?.confidence ?? null, found: research, site: site ? { url: site.url, title: site.title, emails: site.emails, phones: site.phones, social: site.social } : null, os, at: new Date().toISOString() },
  }).select("id").single();
  revalidatePath(`/c/${slug}`, "layout");
  if (error || !row) back(slug, error?.message ?? "Could not save the proposal.");
  redirect(`/c/${slug}/proposals/${row!.id}`);
}

/** Saves edits to a branded proposal's content. Prices update the proposal amount (first month: one-time plus monthly). */
export async function saveBrandedProposalAction(slug: string, id: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) throw new Error("Not allowed");
  const { data: cur } = await ctx.supabase.from("proposals").select("doc").eq("id", id).eq("organization_id", ctx.company.id).maybeSingle();
  if (!cur?.doc) redirect(`/c/${slug}/proposals`);
  const old = cur!.doc as ProposalDoc;
  const g = (k: string) => String(fd.get(k) ?? "").trim();
  const next = {
    ...old,
    tags: lines(g("tags")).slice(0, 5), prepared_for: lines(g("prepared_for")).slice(0, 3), subtitle: g("subtitle"),
    opportunity: { ...old.opportunity, headline: g("opp_headline"), intro: g("opp_intro"), callout: g("opp_callout") },
    phases: old.phases.map((p, i) => ({ ...p, title: g(`ph${i}_title`) || p.title, headline: g(`ph${i}_headline`) || p.headline, body: g(`ph${i}_body`), outcome: g(`ph${i}_outcome`) })),
    scope: { ...old.scope, items: lines(g("scope_items")).slice(0, 10) },
    pricing: { intro: g("pricing_intro"), rows: parsePriceLines(g("pricing_rows")).slice(0, 8) },
    terms: lines(g("terms")).slice(0, 8), commitment: g("commitment"),
    closing: { ...old.closing, headline: g("closing_headline"), body: g("closing_body"), checklist: lines(g("checklist")).slice(0, 6) },
  };
  const ok = ProposalDocSchema.safeParse(next);
  const to = `/c/${slug}/proposals/${id}`;
  if (!ok.success) redirect(`${to}?note=${encodeURIComponent(`Not saved: check ${ok.error.issues[0]?.path.join(" ") || "the fields"} (too long, empty, or a list with too many or too few lines).`)}`);
  const { error } = await ctx.supabase.from("proposals").update({ doc: ok.data, amount_minor: Math.round(totals(ok.data!.pricing.rows).firstMonth * 100) }).eq("id", id).eq("organization_id", ctx.company.id);
  revalidatePath(`/c/${slug}`, "layout");
  redirect(`${to}?note=${encodeURIComponent(error ? error.message : "Saved.")}`);
}
