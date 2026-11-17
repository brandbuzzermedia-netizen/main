import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { sign, verify } from "@/integrations/n8n/signing";
import { AUTOMATION_TEMPLATES } from "@/integrations/n8n/templates";

/**
 * Runs the JavaScript inside the shipped n8n workflow files against the OS's own signing code,
 * so the two sides cannot drift apart.
 */
const dir = join(process.cwd(), "n8n/workflows");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
type Node = { name: string; type: string; parameters: Record<string, unknown> };
type Wf = { nodes: Node[]; connections: Record<string, unknown>; active: boolean; meta: { templateKey: string; webhookPath: string; relay?: boolean } };
const load = (f: string) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Wf;
const code = (wf: Wf, name: string) => String(wf.nodes.find((n) => n.name === name)!.parameters.jsCode);
const has = (wf: Wf, name: string) => wf.nodes.some((n) => n.name === name);
const nodeRequire = createRequire(import.meta.url);

function run(src: string, ctx: { input: unknown; env: Record<string, string>; named?: Record<string, unknown> }) {
  const one = (json: unknown) => ({ first: () => json, all: () => [json] });
  return runInNewContext(`(function(){ ${src} })()`, {
    require: (m: string) => { if (m !== "crypto") throw new Error(`blocked ${m}`); return nodeRequire("crypto"); },
    Buffer, JSON, Math, Date, String, Number, Boolean,
    $input: one(ctx.input), $env: ctx.env, $execution: { id: "4242" },
    $: (n: string) => one({ json: ctx.named?.[n] }),
  }) as { json: Record<string, unknown> }[];
}

const SECRET = "test-secret-that-is-long-enough";
const RUN = { run_id: "3f6c3a52-1c1b-4b9e-9a51-6a3c2b8f1e01", organization_id: "9b1e1c1a-6c55-4b8e-8f86-1d1f2a3b4c5d" };

function signedRequest(body: string, ts = Math.floor(Date.now() / 1000), nonce = "a".repeat(32)) {
  return { json: { headers: { "x-dp-timestamp": String(ts), "x-dp-nonce": nonce, "x-dp-signature": sign(SECRET, ts, nonce, body) }, body: JSON.parse(body) },
    binary: { data: { data: Buffer.from(body).toString("base64") } } };
}

describe("n8n workflow files", () => {
  it("ship inactive workflows: one per scheduled template, plus the inbound relays", () => {
    expect(files.sort()).toEqual(["dp-apollo-search.json", "dp-bill-ocr-review.json", "dp-bookings.json", "dp-daily-summary.json", "dp-elevenlabs-results.json", "dp-email-inbox.json", "dp-meta-leads.json", "dp-payment-hold-alerts.json", "dp-payment-reminders.json",
      "dp-reddit-listen.json", "dp-rent-overdue-escalation.json", "dp-sequence-sends.json", "dp-social-publish.json", "dp-voice-calls.json", "dp-whatsapp-incoming.json"]);
    for (const f of files) {
      const wf = load(f);
      expect(wf.active).toBe(false);
      if (!wf.meta.relay) expect(AUTOMATION_TEMPLATES.some((t) => t.key === wf.meta.templateKey)).toBe(true);
      expect(wf.meta.webhookPath).toBe(`dp-${wf.meta.templateKey.replace(/_/g, "-")}`);
      expect(f).toBe(`${wf.meta.webhookPath}.json`);
      const hook = wf.nodes.find((n) => n.type === "n8n-nodes-base.webhook");
      if (hook) expect(hook.parameters.path).toBe(wf.meta.webhookPath);
      else expect(wf.nodes.some((n) => n.type === "n8n-nodes-base.emailReadImap")).toBe(true); // the inbox reader is triggered by IMAP
      expect(JSON.stringify(wf)).not.toMatch(/sk-|password|secret"\s*:\s*"[^"]/i); // no credentials inside
    }
  });

  it("AI calls always open by saying they are an AI, and never dial outside 09:00–21:00 IST", () => {
    const wf = load("dp-voice-calls.json");
    const start = JSON.stringify(wf.nodes.find((n) => n.name === "Start call (ElevenLabs)")!.parameters);
    expect(start).toContain("first_message: $json.disclosure");
    expect(code(wf, "Calls")).toContain("h < 9 || h >= 21");
  });

  it("messages to the OS inbound endpoint are signed so the OS accepts them", () => {
    let checked = 0;
    for (const f of files) {
      const wf = load(f);
      if (!has(wf, "Sign for OS")) continue;
      const payload = { type: "signal", organization_id: RUN.organization_id, source_url: "https://www.reddit.com/r/x" };
      const out = runInNewContext(`(function(){ ${code(wf, "Sign for OS")} })()`, {
        require: () => nodeRequire("crypto"), JSON, Math, Date, String, $json: { payload }, $env: { DP_SIGNING_SECRET: SECRET },
      }) as { json: { body: string; ts: string; nonce: string; signature: string } };
      expect(verify(SECRET, { timestamp: out.json.ts, nonce: out.json.nonce, signature: out.json.signature }, out.json.body), f).toEqual({ ok: true });
      expect(JSON.parse(out.json.body)).toEqual(payload);
      checked++;
    }
    expect(checked).toBe(9);
  });

  for (const f of files.filter((x) => has(load(x), "Verify signature"))) {
    const wf = load(f);
    describe(f, () => {
      it("accepts a request the OS signed and rejects tampered, stale or unsigned ones", () => {
        const body = JSON.stringify({ ...RUN, input: { company: "Demo", date: "2026-11-13" } });
        const env = { DP_SIGNING_SECRET: SECRET };
        expect(run(code(wf, "Verify signature"), { input: signedRequest(body), env })[0].json.ok).toBe(true);
        const tampered = signedRequest(body);
        tampered.binary.data.data = Buffer.from(body.replace("Demo", "Evil")).toString("base64");
        expect(run(code(wf, "Verify signature"), { input: tampered, env })[0].json.ok).toBe(false);
        expect(run(code(wf, "Verify signature"), { input: signedRequest(body, Math.floor(Date.now() / 1000) - 600), env })[0].json.ok).toBe(false);
        expect(run(code(wf, "Verify signature"), { input: signedRequest(body), env: { DP_SIGNING_SECRET: "" } })[0].json.ok).toBe(false);
      });

      it("signs its callback so the OS accepts it, for success and failure", () => {
        for (const input of [{}, { error: { message: "SMTP down" } }]) {
          const out = run(code(wf, "Sign result"), { input: { json: input }, env: { DP_SIGNING_SECRET: SECRET }, named: { "Verify signature": { ...RUN } } })[0].json as Record<string, string>;
          expect(verify(SECRET, { timestamp: out.ts, nonce: out.nonce, signature: out.signature }, out.body)).toEqual({ ok: true });
          const sent = JSON.parse(out.body);
          expect(sent).toMatchObject({ ...RUN, status: "error" in input ? "failed" : "succeeded", execution_id: "4242" });
        }
      });

      it.runIf(has(wf, "Compose message"))("composes a message from the run summary only", () => {
        const input = { company: "Demo Co", date: "2026-11-13", open_deals: 3, open_pipeline_minor: 1_20_000_00, meetings_today: 1, tasks_overdue: 2,
          ledger_awaiting_approval: 1, bills_awaiting_review: 4, oldest_waiting_days: 2,
          overdue: [{ unit: "Salon", due_on: "2026-11-05", outstanding_minor: 50_000_00, days_overdue: 8 }] };
        const msg = run(code(wf, "Compose message"), { input: { json: {} }, env: {}, named: { "Verify signature": { input } } })[0].json as { subject: string; text: string };
        expect(msg.subject).toContain("Demo Co");
        expect(msg.text.length).toBeGreaterThan(20);
        expect(msg.text).not.toContain("undefined");
      });
    });
  }

  it("reads mailbox replies, unsubscribes and bounces, and skips auto-replies", () => {
    const wf = load("dp-email-inbox.json");
    const mails = [
      { from: "Asha Rao <asha@client.in>", subject: "Re: a quick idea", textPlain: "Yes, let's talk Tuesday.\n\nOn Mon, 10 Nov 2026 Sales wrote:\n> Hi Asha" },
      { from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>", subject: "Delivery Status Notification (Failure)", textPlain: "Final-Recipient: rfc822; gone@old.in\nStatus: 5.1.1" },
      { from: "Ravi <ravi@x.in>", subject: "Automatic reply: Out of office", textPlain: "I am away" },
    ];
    const src = code(wf, "Map to OS");
    const out = runInNewContext(`(function(){ ${src} })()`, { JSON, String, $env: { DP_INBOX_ORG: RUN.organization_id }, $input: { all: () => mails.map((json) => ({ json })) } }) as { json: { payload: Record<string, unknown> } }[];
    expect(out.map((o) => o.json.payload)).toEqual([
      { type: "message", organization_id: RUN.organization_id, channel: "email", from: "asha@client.in", name: "Asha Rao", text: "Yes, let's talk Tuesday." },
      { type: "bounce", organization_id: RUN.organization_id, email: "gone@old.in" },
    ]);
  });

  it("turns Cal.com and Calendly bookings into meetings, only with the relay key", () => {
    const wf = load("dp-bookings.json");
    const src = code(wf, "Map to OS");
    const go = (body: unknown, key = "k") => runInNewContext(`(function(){ ${src} })()`, { JSON, String, Object, $env: { DP_RELAY_KEY: "k" }, $json: { body },
      $: () => ({ first: () => ({ json: { query: { org: RUN.organization_id, key } } }) }) }) as { json: { payload: Record<string, unknown> } }[];
    const cal = { triggerEvent: "BOOKING_CREATED", payload: { title: "Intro call", startTime: "2026-11-20T05:30:00Z", endTime: "2026-11-20T06:00:00Z", attendees: [{ email: "a@b.in", name: "A" }], metadata: { videoCallUrl: "https://meet.google.com/x" } } };
    expect(go(cal)[0].json.payload).toEqual({ type: "meeting_booked", organization_id: RUN.organization_id, email: "a@b.in", name: "A", title: "Intro call", starts_at: "2026-11-20T05:30:00Z", ends_at: "2026-11-20T06:00:00Z", location: "https://meet.google.com/x", source: "Cal.com booking" });
    const cly = { event: "invitee.created", payload: { email: "c@d.in", name: "C", scheduled_event: { name: "Demo", start_time: "2026-11-21T05:30:00Z", end_time: "2026-11-21T06:00:00Z" } } };
    expect(go(cly)[0].json.payload).toMatchObject({ email: "c@d.in", source: "Calendly booking" });
    expect(go(cal, "wrong")).toEqual([]);
  });

  it("sends the AI assistant's reply on the channel it came from", () => {
    const run2 = (wf: Wf, node: string, inputs: unknown[], named: Record<string, unknown[]>) => runInNewContext(`(function(){ ${code(wf, node)} })()`, { JSON, String,
      $input: { all: () => inputs.map((json) => ({ json })) }, $: (n: string) => ({ all: () => (named[n] ?? []).map((json) => ({ json })) }) }) as { json: Record<string, unknown> }[];
    const reply = { channel: "email", to: "asha@client.in", text: "Thanks! — GBS AI assistant", subject: "Re: your message to GBS" };
    const mail = run2(load("dp-email-inbox.json"), "AI reply?", [{ ok: true, auto_reply: reply }, { ok: true }], { "Map to OS": [{ reply_subject: "Re: Pricing" }, { reply_subject: "Re: Hi" }] });
    expect(mail).toEqual([{ json: { ...reply, subject: "Re: Pricing" } }]);
    const wa = run2(load("dp-whatsapp-incoming.json"), "AI reply?", [{ ok: true, auto_reply: { channel: "whatsapp", to: "+919800000011", text: "Hi" } }], { "Map to OS": [{ via: "wati", phone_id: "" }] });
    expect(wa[0].json).toMatchObject({ to: "+919800000011", via: "wati" });
  });

  it("passes the ElevenLabs conversation id and transcript to the OS", () => {
    const src = code(load("dp-elevenlabs-results.json"), "Map to OS");
    const body = { data: { conversation_id: "conv_8f2k1", status: "done", conversation_initiation_client_data: { dynamic_variables: { dp_call_id: RUN.run_id } },
      analysis: { transcript_summary: "Interested", data_collection_results: { outcome: { value: "interested" } } },
      transcript: [{ role: "agent", message: "Hi, this is an AI assistant. This call is recorded." }, { role: "user", message: "Okay, tell me more" }, { role: "user", message: null }] } };
    const out = runInNewContext(`(function(){ ${src} })()`, { JSON, String, Array, $json: { body }, $: () => ({ first: () => ({ json: { query: { org: RUN.organization_id } } }) }) }) as { json: { payload: Record<string, unknown> } }[];
    expect(out[0].json.payload).toMatchObject({ type: "call_result", call_id: RUN.run_id, outcome: "interested", conversation_id: "conv_8f2k1",
      transcript: "AI: Hi, this is an AI assistant. This call is recorded.\nLead: Okay, tell me more" });
  });
});

