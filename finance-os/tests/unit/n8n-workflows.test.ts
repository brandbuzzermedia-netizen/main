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
type Wf = { nodes: Node[]; connections: Record<string, unknown>; active: boolean; meta: { templateKey: string; webhookPath: string } };
const load = (f: string) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Wf;
const code = (wf: Wf, name: string) => String(wf.nodes.find((n) => n.name === name)!.parameters.jsCode);
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
  it("ship one inactive workflow per low-risk template, at the path the OS routes to", () => {
    expect(files.sort()).toEqual(["dp-bill-ocr-review.json", "dp-daily-summary.json", "dp-rent-overdue-escalation.json"]);
    for (const f of files) {
      const wf = load(f);
      expect(wf.active).toBe(false);
      expect(AUTOMATION_TEMPLATES.some((t) => t.key === wf.meta.templateKey)).toBe(true);
      expect(wf.meta.webhookPath).toBe(`dp-${wf.meta.templateKey.replace(/_/g, "-")}`);
      expect(f).toBe(`${wf.meta.webhookPath}.json`);
      expect(wf.nodes.find((n) => n.type === "n8n-nodes-base.webhook")!.parameters.path).toBe(wf.meta.webhookPath);
      expect(JSON.stringify(wf)).not.toMatch(/sk-|password|secret"\s*:\s*"[^"]/i); // no credentials inside
    }
  });

  for (const f of files) {
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

      it("composes a message from the run summary only", () => {
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
});
