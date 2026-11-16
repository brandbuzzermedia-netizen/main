import { randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { sign } from "../src/integrations/n8n/signing";
import { OWNER_STATE, skipLoader } from "./helpers";

/** Lead data, lead-to-delivery and full-automation features, through the real screens and the signed inbound endpoint. */
test.use({ storageState: OWNER_STATE });
test.beforeEach(async ({ page }) => skipLoader(page));

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const orgId = async () => (await admin().from("organizations").select("id").eq("slug", "demo-gbs").single()).data!.id as string;
const run = Date.now() % 100000;

async function inbound(request: APIRequestContext, payload: object, opts: { nonce?: string; secret?: string } = {}) {
  const body = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000), nonce = opts.nonce ?? randomBytes(16).toString("hex");
  const sig = sign(opts.secret ?? process.env.N8N_SIGNING_SECRET!, ts, nonce, body);
  return request.post("/api/inbound", { data: body, headers: { "content-type": "application/json", "x-dp-timestamp": String(ts), "x-dp-nonce": nonce, "x-dp-signature": sig } });
}

test("leads import: a D7-style CSV is mapped, duplicates and bad rows skipped", async ({ page }) => {
  await page.goto("/c/demo-gbs/leads");
  await page.getByRole("link", { name: "Import", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Import leads" })).toBeVisible();
  const csv = `Business Name,Phone,Email,Website\nSmile Dental ${run},98450${String(run).padStart(5, "0")},smile${run}@clinic.test,https://s.in\nNo Contact ${run},,,\nSmile Again,98450${String(run).padStart(5, "0")},,\n`;
  await page.locator("input[name=file]").setInputFiles({ name: "d7.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.fill("input[name=source]", `D7 test ${run}`);
  await page.getByRole("button", { name: "Import leads" }).click();
  await expect(page.getByRole("status")).toContainText("Added 1 of 3 rows");
  await expect(page.getByRole("status")).toContainText("Repeated in the file: 1");
  await expect(page.getByRole("status")).toContainText("Missing name or valid email/phone: 1");
  const { data } = await admin().from("contacts").select("consent_basis, phone_e164, source").eq("email", `smile${run}@clinic.test`).single();
  expect(data).toMatchObject({ consent_basis: "legitimate_interest", phone_e164: `+9198450${String(run).padStart(5, "0")}`, source: `D7 test ${run}` });
  // The same file again adds nobody.
  await page.locator("input[name=file]").setInputFiles({ name: "d7.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Import leads" }).click();
  await expect(page.getByRole("status")).toContainText("Added 0 of 3 rows. Already in this company: 1");
});

test("Apollo searches: add, pause and remove", async ({ page }) => {
  await page.goto("/c/demo-gbs/leads/import");
  await page.fill("input[name=name]", `Clinic owners ${run}`);
  await page.fill("input[name=titles]", "Owner, Founder");
  await page.fill("input[name=locations]", "Bengaluru");
  await page.locator("input[name=employees][value='1,10']").check();
  await page.getByRole("button", { name: "Save search" }).click();
  await expect(page.getByRole("status")).toContainText("Search saved");
  const row = page.locator("div").filter({ hasText: `Clinic owners ${run}` }).filter({ has: page.getByRole("button", { name: "Pause" }) }).last();
  await expect(row).toContainText("Owner, Founder · Bengaluru");
  await row.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("status")).toContainText("Search paused");
  await page.locator("div").filter({ hasText: `Clinic owners ${run}` }).filter({ has: page.getByRole("button", { name: "Remove" }) }).last().getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("status")).toContainText("Search removed");
});

test("lead to delivery: booking link, round-robin routing, onboarding steps and the AI assistant settings", async ({ page }) => {
  await page.goto("/c/demo-gbs/settings#growth");
  const g = page.locator("#growth");
  await g.locator("input[name=booking_url]").fill("http://not-secure.test");
  await g.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#growth [role=status]")).toContainText("must start with https://");
  await page.locator("#growth input[name=booking_url]").fill("https://cal.com/demo-gbs/intro");
  await page.locator("#growth input[name=routing_enabled]").check();
  await page.locator("#growth input[name=routing_members]").first().check();
  await page.locator("#growth").getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#growth [role=status]")).toContainText("Saved.");
  await expect(page.locator("#growth input[name=booking_url]")).toHaveValue("https://cal.com/demo-gbs/intro");
  await page.locator("#growth input[name=title]").fill(`Kick-off call ${run}`);
  await page.locator("#growth").getByRole("button", { name: "Add step" }).click();
  await expect(page.locator("#growth")).toContainText(`Kick-off call ${run}`);
  await page.locator("#ai textarea[name=ai_knowledge]").fill("We run Meta ads for clinics in Bengaluru, from ₹25,000 a month.");
  await page.locator("#ai input[name=ai_reply_enabled]").check();
  await page.locator("#ai").getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#ai [role=status]")).toContainText("AI reply assistant saved.");
  await expect(page.locator("#ai input[name=ai_reply_enabled]")).toBeChecked();
});

test("approve once: an owner approves a campaign and it no longer waits each run", async ({ page }) => {
  await page.goto("/c/demo-gbs/outreach?ch=email");
  await page.getByRole("button", { name: "+ Email outreach" }).click();
  await page.goto("/c/demo-gbs/outreach");
  const row = page.locator("div").filter({ has: page.getByRole("button", { name: "Approve once" }) }).last();
  await expect(row).toContainText("Needs approval each run");
  await row.getByRole("button", { name: "Approve once" }).click();
  await expect(page.getByRole("status")).toContainText("Approved. This campaign now sends every day");
  await expect(page.getByText("✓ Approved: runs on its own").first()).toBeVisible();
});

test("WhatsApp: opt-in link and QR per number", async ({ page }) => {
  await page.goto("/c/demo-gbs/settings#accounts");
  const f = page.locator("#accounts form:has(select[name=channel])");
  await f.locator("select[name=channel]").selectOption("whatsapp");
  await f.locator("select[name=kind]").selectOption("business_number");
  await f.locator("input[name=label]").fill(`WA ${run}`);
  await f.locator("input[name=address]").fill(`+9198${String(run).padStart(8, "0")}`);
  await f.locator("input[name=daily_limit]").fill("250");
  await f.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Account added." })).toBeVisible();
  await page.goto("/c/demo-gbs/outreach?ch=whatsapp");
  await expect(page.getByText("Get WhatsApp opt-ins")).toBeVisible();
  const link = await page.getByLabel("WhatsApp opt-in link").first().inputValue();
  expect(link).toMatch(/^https:\/\/wa\.me\/\d+\?text=START/);
  await expect(page.getByRole("img", { name: /QR code for/ }).first()).toBeVisible();
  await expect(page.getByText("AI conversations")).toBeVisible();
});

test("reports: the lead-to-cash funnel per company and across the group", async ({ page }) => {
  await page.goto("/c/demo-gbs/reports?days=90");
  await expect(page.getByText("Lead to cash · last 90 days")).toBeVisible();
  await expect(page.getByText("New leads")).toBeVisible();
  await expect(page.getByText("Collected")).toBeVisible();
  await page.goto("/group/reports");
  await expect(page.getByText("Lead to cash by company · last 30 days")).toBeVisible();
  await expect(page.locator("table")).toContainText("COLLECTED");
});

test("inbound (n8n → OS): signed events drive leads, opt-ins, opt-outs, bounces and bookings", async ({ request }) => {
  const org = await orgId();
  const db = admin();
  // Signatures and replays are refused.
  expect((await inbound(request, { type: "bounce", organization_id: org, email: "x@y.test" }, { secret: "wrong-secret-wrong-secret-wrong!!" })).status()).toBe(401);
  const nonce = randomBytes(16).toString("hex");
  expect((await inbound(request, { type: "bounce", organization_id: org, email: "nobody@y.test" }, { nonce })).status()).toBe(200);
  expect((await inbound(request, { type: "bounce", organization_id: org, email: "nobody@y.test" }, { nonce })).status()).toBe(409);

  // Apollo lead with a saved search that names a campaign: added with legitimate interest and enrolled.
  const { data: seq } = await db.from("outreach_sequences").insert({ organization_id: org, name: `Apollo flow ${run}`, status: "active", steps: [{ channel: "email", delay_days: 0, template: "Hi" }] }).select("id").single();
  const { data: ls } = await db.from("lead_searches").insert({ organization_id: org, name: `Apollo ${run}`, titles: ["Owner"], enroll_sequence_id: seq!.id }).select("id").single();
  const email = `apollo${run}@lead.test`;
  const r1 = await (await inbound(request, { type: "lead", organization_id: org, full_name: "Apollo Lead", email, source: `Apollo: Apollo ${run}`, basis: "legitimate_interest", search_id: ls!.id })).json();
  const { data: c1 } = await db.from("contacts").select("id, consent_basis, owner_id").eq("id", r1.contact_id).single();
  expect(c1!.consent_basis).toBe("legitimate_interest");
  expect((await db.from("outreach_enrollments").select("status").eq("contact_id", c1!.id).eq("sequence_id", seq!.id).single()).data?.status).toBe("active");

  // Their email reply stops the campaign; no AI reply without an API key (mock mode).
  const r2 = await (await inbound(request, { type: "message", organization_id: org, channel: "email", from: email, text: "Sounds interesting, tell me more" })).json();
  expect(r2.auto_reply).toBeUndefined();
  expect((await db.from("outreach_enrollments").select("status").eq("contact_id", c1!.id).single()).data?.status).toBe("stopped_reply");

  // They book through the booking link: a meeting, a qualified lead.
  const starts = new Date(Date.now() + 2 * 86_400_000).toISOString();
  expect((await inbound(request, { type: "meeting_booked", organization_id: org, email, name: "Apollo Lead", starts_at: starts, source: "Cal.com booking" })).status()).toBe(200);
  expect((await db.from("contacts").select("lead_status").eq("id", c1!.id).single()).data?.lead_status).toBe("qualified");
  expect((await db.from("meetings").select("id").eq("organization_id", org).eq("starts_at", starts)).data?.length).toBe(1);

  // "Unsubscribe" by email: never emailed again.
  await inbound(request, { type: "message", organization_id: org, channel: "email", from: email, text: "Unsubscribe me please" });
  expect((await db.from("contacts").select("do_not_contact").eq("id", c1!.id).single()).data?.do_not_contact).toBe(true);
  expect((await db.from("suppression_records").select("id").eq("organization_id", org).eq("channel", "email").eq("value_normalized", email)).data?.length).toBe(1);

  // WhatsApp START from a new number: a lead with consent. STOP: suppressed for WhatsApp.
  const phone = `+9197${String(run).padStart(8, "0")}`;
  const r3 = await (await inbound(request, { type: "message", organization_id: org, channel: "whatsapp", from: phone, name: "Walk-in", text: "START - please send me updates" })).json();
  expect(r3.opted_in).toBe(true);
  const { data: c3 } = await db.from("contacts").select("consent_basis, source, full_name").eq("id", r3.contact_id).single();
  expect(c3).toMatchObject({ consent_basis: "consent", source: "WhatsApp opt-in", full_name: "Walk-in" });
  const r4 = await (await inbound(request, { type: "message", organization_id: org, channel: "whatsapp", from: phone, text: "STOP" })).json();
  expect(r4.opted_out).toBe(true);
  expect((await db.from("suppression_records").select("id").eq("organization_id", org).eq("channel", "whatsapp").eq("value_normalized", phone)).data?.length).toBe(1);

  // A bounce suppresses the address.
  const bounced = `gone${run}@old.test`;
  await db.from("contacts").insert({ organization_id: org, full_name: "Old address", email: bounced });
  await inbound(request, { type: "bounce", organization_id: org, email: bounced });
  expect((await db.from("suppression_records").select("reason").eq("organization_id", org).eq("channel", "email").eq("value_normalized", bounced).single()).data?.reason).toBe("bounced");
});
