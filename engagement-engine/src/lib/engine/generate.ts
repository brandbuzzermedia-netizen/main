import type { Db, DbRunner } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadClientAiContext, type ClientAiContext } from "@/lib/ai/context";
import { getEmbedder } from "@/lib/ai/embeddings";
import { buildClientContextBlock, buildOpportunityBlock, PROMPT_VERSION, SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { getAiProvider, type CommentAiProvider, type GenerationResult } from "@/lib/ai/provider";
import { getAdapter } from "@/lib/platforms/registry";
import type { CommentRules, Platform } from "@/lib/platforms/types";
import { runQualityChecks, type HistoryComment, type QualityReport } from "./quality";

export class UsageLimitError extends Error {}

export interface OpportunityRow {
  id: string;
  client_id: string;
  organization_id: string;
  campaign_id: string;
  platform: Platform;
  opportunity_type: "third_party_post" | "own_post_comment" | "mention" | "manual";
  social_account_id: string | null;
  segment_id: string | null;
  segment_name: string | null;
  reply_to_text: string | null;
  reply_to_author: string | null;
  url: string | null;
  content: string;
  posted_at: Date | null;
  author_handle: string | null;
  author_name: string | null;
  author_bio: string | null;
  author_followers: number | null;
  post_client_id: string;
}

export async function loadOpportunity(db: Db, clientId: string, opportunityId: string): Promise<OpportunityRow | null> {
  return db.one<OpportunityRow>(
    `select o.id, o.client_id, o.organization_id, o.campaign_id, o.platform, o.opportunity_type, o.social_account_id,
            o.segment_id, s.name as segment_name, o.reply_to_text, o.reply_to_author,
            p.url, p.content, p.posted_at, p.author_handle, p.author_name, p.author_bio, p.author_followers,
            p.client_id as post_client_id
     from engagement_opportunities o
     join posts p on p.id = o.post_id and p.client_id = o.client_id
     left join audience_segments s on s.id = o.segment_id and s.client_id = o.client_id
     where o.id = $1 and o.client_id = $2`,
    [opportunityId, clientId],
  );
}

export async function loadHistory(db: Db, clientId: string): Promise<HistoryComment[]> {
  const rows = await db.query<{
    current_text: string;
    embedding: number[] | null;
    embedding_model: string | null;
    campaign_id: string;
    author_handle: string | null;
    platform: string;
    created_at: Date;
  }>(
    `select c.current_text, c.embedding, c.embedding_model, c.campaign_id, p.author_handle, c.platform, c.created_at
     from comments c
     join engagement_opportunities o on o.id = c.opportunity_id and o.client_id = c.client_id
     join posts p on p.id = o.post_id and p.client_id = o.client_id
     where c.client_id = $1 and c.status in ('pending_approval','approved','queued','publishing','published')
       and c.created_at > now() - interval '90 days'
     order by c.created_at desc limit 500`,
    [clientId],
  );
  return rows.map((r) => ({
    text: r.current_text,
    embedding: r.embedding,
    embeddingModel: r.embedding_model,
    campaignId: r.campaign_id,
    authorHandle: r.author_handle,
    platform: r.platform,
    createdAt: r.created_at,
  }));
}

export function qualityFor(
  ctx: Pick<ClientAiContext, "brand" | "campaign" | "campaignId">,
  opp: OpportunityRow,
  rules: CommentRules,
  text: string,
  embedding: number[],
  embeddingModel: string,
  history: HistoryComment[],
): QualityReport {
  return runQualityChecks({
    text,
    embedding,
    embeddingModel,
    platform: opp.platform,
    rules,
    postContent: opp.content,
    replyToText: opp.reply_to_text,
    authorHandle: opp.author_handle,
    campaignId: ctx.campaignId,
    campaignKeywords: [...ctx.campaign.keywords, ...ctx.brand.keywords],
    brand: {
      wordsToAvoid: ctx.brand.words_to_avoid,
      topicsToAvoid: ctx.brand.topics_to_avoid,
      competitors: ctx.brand.competitors,
      claimsRequiringApproval: ctx.brand.claims_requiring_approval,
      ctaStyle: ctx.brand.cta_style,
      emojiPolicy: ctx.brand.emoji_policy,
      commentLength: ctx.brand.comment_length,
      tone: [...ctx.brand.tone, ...ctx.brand.brand_personality],
    },
    history,
  });
}

async function assertGenerationBudget(db: Db, clientId: string): Promise<void> {
  const row = await db.one<{ used: number; limit: number | null }>(
    `select (select coalesce(sum(quantity), 0)::int from usage_events
              where client_id = $1 and kind = 'ai_generation' and created_at >= date_trunc('month', now())) as used,
            (select monthly_ai_generation_limit from usage_limits where client_id = $1 and platform = 'all') as limit`,
    [clientId],
  );
  if (row?.limit != null && row.used >= row.limit) {
    throw new UsageLimitError(`This client has used its ${row.limit} AI generations for the month.`);
  }
}

export interface GenerateOptions {
  clientId: string;
  opportunityId: string;
  actor: { id: string | null; name: string };
  regenerationNote?: string | null;
  provider?: CommentAiProvider;
}

/**
 * Generates three comments for one opportunity of one client.
 * Read phase and write phase run in separate transactions so the model call doesn't hold a connection.
 */
export async function generateForOpportunity(run: DbRunner, o: GenerateOptions) {
  const prep = await run(async (db) => {
    const opp = await loadOpportunity(db, o.clientId, o.opportunityId);
    if (!opp) throw new Error("Opportunity not found for this client.");
    if (opp.post_client_id !== o.clientId) throw new Error("Post belongs to a different client.");
    await assertGenerationBudget(db, o.clientId);
    const ctx = await loadClientAiContext(db, { clientId: o.clientId, campaignId: opp.campaign_id });
    const org = await db.one<{ ai_settings: { model?: string; effort?: "low" | "medium" | "high" } }>(
      "select ai_settings from organizations where id = $1",
      [ctx.organizationId],
    );
    const history = await loadHistory(db, o.clientId);
    return { opp, ctx, history, aiSettings: org?.ai_settings ?? {} };
  });

  const { opp, ctx, history } = prep;
  if (ctx.clientId !== opp.client_id) throw new Error("Context/opportunity client mismatch.");
  const adapter = getAdapter(opp.platform);
  const provider = o.provider ?? getAiProvider(prep.aiSettings);

  const result: GenerationResult = await adapter.generateComment({}, (input) =>
    provider.generate({
      clientId: ctx.clientId,
      campaignId: ctx.campaignId,
      system: SYSTEM_PROMPT,
      clientContext: buildClientContextBlock(ctx),
      opportunity: buildOpportunityBlock(
        {
          platform: input.platform,
          opportunityType: opp.opportunity_type,
          postUrl: opp.url,
          postContent: opp.content,
          postedAt: opp.posted_at,
          authorHandle: opp.author_handle,
          authorName: opp.author_name,
          authorBio: opp.author_bio,
          authorFollowers: opp.author_followers,
          replyToText: opp.reply_to_text,
          replyToAuthor: opp.reply_to_author,
          segmentName: opp.segment_name,
          regenerationNote: o.regenerationNote,
        },
        input.platformRules,
      ),
      hints: {
        postContent: opp.content,
        brandName: ctx.brand.company_name,
        keywords: [...ctx.campaign.keywords, ...ctx.brand.keywords],
        replyToText: opp.reply_to_text,
      },
    }),
  );

  const embedder = getEmbedder();
  const vectors = await embedder.embed(result.comments.map((c) => c.text));
  const reports = result.comments.map((c, i) => qualityFor(ctx, opp, adapter.commentRules, c.text, vectors[i], embedder.model, history));

  // Pick the best variant: passed checks first, then quality score, then insight > expert > conversation.
  const rank = { insight: 0, expert: 1, conversation: 2 } as const;
  const bestIdx = result.comments
    .map((c, i) => ({ i, passed: reports[i].passed, score: reports[i].score, r: rank[c.type] }))
    .sort((a, b) => Number(b.passed) - Number(a.passed) || b.score - a.score || a.r - b.r)[0].i;

  return run(async (db) => {
    await db.query(
      `update comments set status = 'superseded' where opportunity_id = $1 and client_id = $2 and status in ('generated','pending_approval')`,
      [opp.id, o.clientId],
    );
    const gen = await db.one<{ id: string }>(
      `insert into comment_generations (organization_id, client_id, campaign_id, opportunity_id, provider, model, prompt_version,
         context_hash, input_tokens, output_tokens, analysis, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
      [
        opp.organization_id,
        o.clientId,
        opp.campaign_id,
        opp.id,
        result.provider,
        result.model,
        PROMPT_VERSION,
        ctx.hash,
        result.inputTokens,
        result.outputTokens,
        JSON.stringify(result.analysis),
        o.actor.id,
      ],
    );
    const ids: string[] = [];
    for (let i = 0; i < result.comments.length; i++) {
      const c = result.comments[i];
      const row = await db.one<{ id: string }>(
        `insert into comments (organization_id, client_id, campaign_id, opportunity_id, generation_id, social_account_id, platform,
           comment_type, ai_reasoning, original_text, current_text, is_selected, status, quality_score, quality_passed,
           quality_report, embedding, embedding_model, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, 'generated', $12, $13, $14, $15, $16, $17) returning id`,
        [
          opp.organization_id,
          o.clientId,
          opp.campaign_id,
          opp.id,
          gen!.id,
          opp.social_account_id,
          opp.platform,
          c.type,
          c.reasoning,
          c.text,
          i === bestIdx,
          reports[i].score,
          reports[i].passed,
          JSON.stringify(reports[i]),
          vectors[i],
          embedder.model,
          o.actor.id,
        ],
      );
      ids.push(row!.id);
    }
    await db.query(
      `update engagement_opportunities set status = 'comment_generated', topic = coalesce(topic, $3), updated_at = now(),
         analyzed_at = coalesce(analyzed_at, now())
       where id = $1 and client_id = $2 and status in ('discovered','analyzed','comment_generated','pending_approval','rejected')`,
      [opp.id, o.clientId, result.analysis.topic?.slice(0, 200) || null],
    );
    await db.query(
      `insert into usage_events (organization_id, client_id, kind, platform, quantity, metadata) values
         ($1, $2, 'ai_generation', $3, 1, $4), ($1, $2, 'comment_generated', $3, $5, '{}')`,
      [opp.organization_id, o.clientId, opp.platform, JSON.stringify({ model: result.model, provider: result.provider }), ids.length],
    );
    if (o.actor.id) {
      await audit(db, {
        organizationId: opp.organization_id,
        clientId: o.clientId,
        campaignId: opp.campaign_id,
        actorId: o.actor.id,
        actorName: o.actor.name,
        action: "comment.generated",
        entityType: "opportunity",
        entityId: opp.id,
        details: { model: result.model, regenerated: Boolean(o.regenerationNote) },
      });
    }
    return { generationId: gen!.id, commentIds: ids, selectedId: ids[bestIdx], analysis: result.analysis };
  });
}
