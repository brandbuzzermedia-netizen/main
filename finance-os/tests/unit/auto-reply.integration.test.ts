import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * The AI reply assistant's rules against a real database (local Supabase). The model call is
 * replaced so the test is free and deterministic; everything around it is real.
 * Runs only when SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL point at a local stack.
 */
vi.mock("server-only", () => ({}));
const next = vi.hoisted(() => ({ value: null as null | { action: "reply" | "handoff"; reply: string; interest: "hot" | "warm" | "cold" | "not_interested"; reason: string } }));
vi.mock("@/integrations/ai/claude", () => ({
  draftAutoReply: vi.fn(async () => ({ result: next.value, usage: { model: "test-model", input_tokens: 100, output_tokens: 50, is_mock: false, refused: false } })),
}));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const local = !!url && !!key && /localhost|127\.0\.0\.1/.test(url);

describe.skipIf(!local)("AI reply assistant (local database)", () => {
  const db = createClient(url!, key!, { auth: { persistSession: false } });
  let org = "", contact = "";
  const run = Date.now() % 100000;
  beforeAll(async () => {
    org = (await db.from("organizations").select("id").eq("slug", "demo-gbs").single()).data!.id;
    await db.from("app_settings").update({ ai_enabled: true }).eq("organization_id", org);
    await db.from("growth_settings").upsert({ organization_id: org, ai_reply_enabled: true, ai_reply_channels: ["email", "whatsapp"], ai_daily_limit: 2, ai_knowledge: "We run Meta ads.", booking_url: "https://cal.com/gbs/intro" });
    contact = (await db.from("contacts").insert({ organization_id: org, full_name: `AI Test ${run}`, email: `ai${run}@lead.test` }).select("id").single()).data!.id;
  });
  afterAll(async () => { await db.from("growth_settings").update({ ai_reply_enabled: false }).eq("organization_id", org); });

  it("replies, signs as the AI assistant, logs the conversation and usage, and marks hot leads", async () => {
    const { autoReply } = await import("@/lib/auto-reply");
    next.value = { action: "reply", reply: "Happy to help! Book a call: https://cal.com/gbs/intro", interest: "hot", reason: "Asked about pricing tiers listed" };
    const out = await autoReply(db, org, contact, "email", "What do you charge for Meta ads?");
    expect(out).toMatchObject({ channel: "email", to: `ai${run}@lead.test` });
    expect(out!.text).toMatch(/AI assistant/);
    expect((await db.from("ai_replies").select("action, interest").eq("contact_id", contact)).data).toEqual([{ action: "replied", interest: "hot" }]);
    expect((await db.from("contacts").select("lead_status").eq("id", contact).single()).data!.lead_status).toBe("qualified");
    expect((await db.from("ai_usage_log").select("purpose").eq("organization_id", org).eq("purpose", "auto_reply").limit(1)).data!.length).toBe(1);
  });

  it("hands negotiations to a person as an urgent task", async () => {
    const { autoReply } = await import("@/lib/auto-reply");
    next.value = { action: "handoff", reply: "", interest: "warm", reason: "Wants a discount: price negotiation" };
    expect(await autoReply(db, org, contact, "email", "Can you do it for half?")).toBeNull();
    const { data } = await db.from("tasks").select("priority, title").eq("organization_id", org).like("title", `Reply needed: AI Test ${run}%`);
    expect(data).toEqual([{ priority: "high", title: `Reply needed: AI Test ${run}` }]);
  });

  it("stops after the per-person daily limit and hands over", async () => {
    const { autoReply } = await import("@/lib/auto-reply");
    next.value = { action: "reply", reply: "Sure!", interest: "warm", reason: "ok" };
    expect(await autoReply(db, org, contact, "email", "One more question")).not.toBeNull(); // 2nd reply today (limit 2)
    expect(await autoReply(db, org, contact, "email", "And another")).toBeNull();          // limit reached
    expect((await db.from("ai_replies").select("action").eq("contact_id", contact).eq("action", "handed_over")).data!.length).toBe(2);
  });

  it("never replies to opted-out people, on switched-off channels, or when AI is off", async () => {
    const { autoReply } = await import("@/lib/auto-reply");
    next.value = { action: "reply", reply: "Hi", interest: "warm", reason: "ok" };
    const c2 = (await db.from("contacts").insert({ organization_id: org, full_name: `Opted out ${run}`, email: `out${run}@lead.test`, do_not_contact: true }).select("id").single()).data!.id;
    expect(await autoReply(db, org, c2, "email", "hello")).toBeNull();
    const c3 = (await db.from("contacts").insert({ organization_id: org, full_name: `Fresh ${run}`, email: `fresh${run}@lead.test` }).select("id").single()).data!.id;
    await db.from("growth_settings").update({ ai_reply_channels: ["whatsapp"] }).eq("organization_id", org);
    expect(await autoReply(db, org, c3, "email", "hello")).toBeNull();
    await db.from("growth_settings").update({ ai_reply_channels: ["email", "whatsapp"] }).eq("organization_id", org);
    await db.from("app_settings").update({ ai_enabled: false }).eq("organization_id", org);
    expect(await autoReply(db, org, c3, "email", "hello")).toBeNull();
    await db.from("app_settings").update({ ai_enabled: true }).eq("organization_id", org);
    expect(await autoReply(db, org, c3, "email", "hello")).not.toBeNull();
  });
});
