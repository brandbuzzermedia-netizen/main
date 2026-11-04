// Browser stand-in for src/lib/ai/client.ts. With no server, Claude is called
// straight from the browser with the API key saved on this computer (Settings).
// This studio is for internal use only: never publish a build with a key in it.
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";
const KEY = "gbs-anthropic-api-key";

export function getApiKey(): string {
  try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; }
}
export function setApiKey(key: string) {
  try { if (key) localStorage.setItem(KEY, key.trim()); else localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  client = null;
}

export const aiConfigured = () => getApiKey().startsWith("sk-ant-");

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!aiConfigured()) throw new Error("Add your Anthropic API key in Settings first.");
  // The SDK sends the header Anthropic requires for direct browser requests.
  return (client ??= new Anthropic({ apiKey: getApiKey(), dangerouslyAllowBrowser: true }));
}
