import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { words } from "@/lib/engine/text";

export const CommentTypeSchema = z.enum(["insight", "conversation", "expert"]);

export const GenerationSchema = z.object({
  analysis: z.object({
    topic: z.string(),
    post_summary: z.string(),
    author_summary: z.string(),
    audience_fit: z.string(),
  }),
  comments: z.array(
    z.object({
      type: CommentTypeSchema,
      text: z.string(),
      reasoning: z.string(),
    }),
  ),
});

export type GenerationOutput = z.infer<typeof GenerationSchema>;

export interface GenerationRequest {
  clientId: string;
  campaignId: string;
  system: string;
  clientContext: string;
  opportunity: string;
  /** Used only by the offline provider. */
  hints: { postContent: string; brandName: string; keywords: string[]; replyToText: string | null };
}

export interface GenerationResult extends GenerationOutput {
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface CommentAiProvider {
  readonly name: string;
  readonly model: string;
  generate(req: GenerationRequest): Promise<GenerationResult>;
}

export class AiRefusalError extends Error {}

export class AnthropicProvider implements CommentAiProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(
    readonly model: string,
    private readonly effort: "low" | "medium" | "high" = "medium",
    apiKey?: string,
  ) {
    this.client = new Anthropic(apiKey ? { apiKey } : {});
  }

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const res = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: this.effort, format: betaZodOutputFormat(GenerationSchema) },
      // Every request is tagged with the client and campaign it was built for.
      metadata: { user_id: `client:${req.clientId}:campaign:${req.campaignId}` },
      system: [
        { type: "text", text: req.system },
        // Per-client context is cached separately per client; it is never shared across clients.
        { type: "text", text: req.clientContext, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: req.opportunity }],
    });
    if (res.stop_reason === "refusal") throw new AiRefusalError("The model declined to write comments for this post.");
    const parsed = res.parsed_output;
    if (!parsed) throw new Error("The model returned an unparseable response.");
    return {
      ...normalizeComments(parsed),
      provider: this.name,
      model: res.model,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    };
  }
}

/**
 * Development-only provider used when no ANTHROPIC_API_KEY is set. Builds simple drafts
 * from the post's own words so the full workflow can be exercised without an AI call.
 */
export class OfflineDraftProvider implements CommentAiProvider {
  readonly name = "offline";
  readonly model = "offline-drafts-v1";

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const source = req.hints.replyToText || req.hints.postContent;
    const stop = new Set("the a an and or of to in on for with at by from is are this that your you our we they it as be how what".split(" "));
    const terms = words(source).filter((w) => w.length > 4 && !stop.has(w) && !w.startsWith("#") && !w.startsWith("@"));
    const kw = req.hints.keywords.find((k) => source.toLowerCase().includes(k.toLowerCase()));
    const a = kw ?? terms[0] ?? "this";
    const b = terms.find((t) => t !== a?.toLowerCase()) ?? "the details";
    return {
      analysis: {
        topic: kw ?? terms.slice(0, 3).join(", ") ?? "general",
        post_summary: source.slice(0, 160),
        author_summary: "unknown",
        audience_fit: "Estimated from keywords (offline draft).",
      },
      comments: [
        {
          type: "insight",
          text: `The point about ${a} is the one people tend to underestimate. Getting ${b} right early usually shapes how the whole space feels later.`,
          reasoning: "Offline draft: builds on the post's main term.",
        },
        {
          type: "conversation",
          text: `Interesting take on ${a}. How do you usually balance ${b} against budget when a project gets going?`,
          reasoning: "Offline draft: asks a specific follow-up question.",
        },
        {
          type: "expert",
          text: `From a materials point of view, ${a} decisions work best when ${b} is considered alongside proportion and finish, not after.`,
          reasoning: "Offline draft: adds a domain perspective without promotion.",
        },
      ],
      provider: this.name,
      model: this.model,
      inputTokens: null,
      outputTokens: null,
    };
  }
}

/** Exactly one comment of each type, in a stable order. */
export function normalizeComments(out: GenerationOutput): GenerationOutput {
  const order = ["insight", "conversation", "expert"] as const;
  const comments = order.map((type) => {
    const c = out.comments.find((x) => x.type === type) ?? out.comments.find((x) => !order.includes(x.type));
    return { type, text: (c?.text ?? "").trim(), reasoning: c?.reasoning ?? "" };
  });
  if (comments.some((c) => !c.text)) throw new Error("The model did not return all three comment types.");
  return { analysis: out.analysis, comments };
}

export function getAiProvider(settings: { model?: string; effort?: "low" | "medium" | "high" } = {}): CommentAiProvider {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_AI !== "true") {
      throw new Error("ANTHROPIC_API_KEY is not configured.");
    }
    return new OfflineDraftProvider();
  }
  return new AnthropicProvider(settings.model || process.env.AI_MODEL || "claude-opus-5-5", settings.effort ?? "medium", key);
}
