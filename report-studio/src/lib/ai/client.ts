// The Claude client. Claude features turn on when ANTHROPIC_API_KEY is set
// on the server; the key is never sent to the browser.
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";

export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!aiConfigured()) throw new Error("ANTHROPIC_API_KEY is not set");
  return (client ??= new Anthropic());
}
