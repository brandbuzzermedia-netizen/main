import "server-only";
import { randomBytes } from "node:crypto";
import { sign } from "./signing";

/**
 * Sends a queued run to n8n. Mock mode (no N8N_BASE_URL, or N8N_MODE=mock) never calls out; the
 * caller records the run as a labelled mock. Only exact https webhook paths under the configured
 * base URL are called (no user-supplied URLs: SSRF-safe).
 */
export function n8nConfig() {
  const base = process.env.N8N_BASE_URL ?? "";
  const secret = process.env.N8N_SIGNING_SECRET ?? "";
  const mock = process.env.N8N_MODE === "mock" || !base || !secret;
  return { mock, base, secret, environment: process.env.N8N_ENVIRONMENT ?? "development" };
}

export async function dispatchToN8n(workflowPath: string, payload: Record<string, unknown>): Promise<{ ok: boolean; executionId?: string; error?: string; mock: boolean }> {
  const cfg = n8nConfig();
  if (cfg.mock) return { ok: true, mock: true, executionId: `mock-${Date.now()}` };
  if (!/^[a-zA-Z0-9/_-]{1,120}$/.test(workflowPath)) return { ok: false, mock: false, error: "Invalid workflow path" };
  const url = new URL(`/webhook/${workflowPath}`, cfg.base);
  if (url.protocol !== "https:" || url.origin !== new URL(cfg.base).origin) return { ok: false, mock: false, error: "n8n must be reached over https" };
  const body = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("hex");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-dp-timestamp": String(ts), "x-dp-nonce": nonce, "x-dp-signature": sign(cfg.secret, ts, nonce, body) },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { ok: false, mock: false, error: `n8n responded ${res.status}` };
    const data = (await res.json().catch(() => ({}))) as { executionId?: string };
    return { ok: true, mock: false, executionId: data.executionId };
  } catch (e) {
    return { ok: false, mock: false, error: e instanceof Error && e.name === "TimeoutError" ? "n8n timed out" : "n8n unreachable" };
  }
}
