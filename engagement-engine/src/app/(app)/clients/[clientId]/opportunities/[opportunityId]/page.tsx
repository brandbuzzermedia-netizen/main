import { notFound } from "next/navigation";
import { requireClientAccess } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { SCORE_DISCLAIMER, SCORE_WEIGHTS, type FactorKey } from "@/lib/engine/scoring";
import { CHECK_LABELS, type QualityReport } from "@/lib/engine/quality";
import { getAdapter } from "@/lib/platforms/registry";
import type { Platform } from "@/lib/platforms/types";
import { Badge, Card, CardBody, CardHeader, EmptyState, LinkButton, Notice, PageHeader, PlatformIcon, QualityBadge, ScoreBadge, StatusBadge, cx, fmt, formatDate } from "@/components/ui";
import { ActionButton, GenerateButton, QueueButton, RegenerateForm, SubmitForApprovalButton } from "@/components/client/comment-tools";
import { VariantEditor } from "./variant-editor";
import { dismissOpportunity } from "@/app/actions/engagement";

export const metadata = { title: "Opportunity" };

const FACTOR_LABEL: Record<FactorKey, string> = {
  audienceMatch: "Audience match",
  contentRelevance: "Content relevance",
  conversationPotential: "Conversation potential",
  brandRelevance: "Brand relevance",
  authorRelevance: "Author relevance",
  freshness: "Freshness",
};
const TYPE_LABEL: Record<string, string> = { insight: "Insight", conversation: "Conversation", expert: "Expert perspective" };

export default async function OpportunityPage({ params }: { params: Promise<{ clientId: string; opportunityId: string }> }) {
  const { clientId, opportunityId } = await params;
  const { user, access } = await requireClientAccess(clientId);
  const data = await withUser(user.id, async (db) => {
    const o = await db.one<{
      id: string;
      platform: Platform;
      status: string;
      score: number | null;
      score_label: string | null;
      score_breakdown: Record<string, number | string>;
      explanation: string | null;
      topic: string | null;
      audience_match: string | null;
      brand_relevance: string | null;
      opportunity_type: string;
      publish_capability: string;
      reply_to_text: string | null;
      reply_to_author: string | null;
      campaign: string;
      campaign_id: string;
      url: string | null;
      content: string;
      author_handle: string | null;
      author_name: string | null;
      author_bio: string | null;
      author_followers: number | null;
      posted_at: Date | null;
      metrics: { likes?: number; comments?: number; views?: number };
      source: string;
    }>(
      `select o.id, o.platform, o.status, o.score, o.score_label, o.score_breakdown, o.explanation, o.topic, o.audience_match, o.brand_relevance,
              o.opportunity_type, o.publish_capability, o.reply_to_text, o.reply_to_author, ca.name as campaign, o.campaign_id,
              p.url, p.content, p.author_handle, p.author_name, p.author_bio, p.author_followers, p.posted_at, p.metrics, p.source
       from engagement_opportunities o
       join posts p on p.id = o.post_id and p.client_id = o.client_id
       join campaigns ca on ca.id = o.campaign_id and ca.client_id = o.client_id
       where o.id = $1 and o.client_id = $2`,
      [opportunityId, clientId],
    );
    if (!o) return null;
    const comments = await db.query<{
      id: string;
      comment_type: string;
      current_text: string;
      original_text: string;
      is_edited: boolean;
      is_selected: boolean;
      status: string;
      quality_score: number | null;
      quality_passed: boolean;
      quality_report: QualityReport | null;
      ai_reasoning: string | null;
      model: string | null;
      provider: string | null;
    }>(
      `select c.id, c.comment_type, c.current_text, c.original_text, c.is_edited, c.is_selected, c.status, c.quality_score, c.quality_passed,
              c.quality_report, c.ai_reasoning, g.model, g.provider
       from comments c left join comment_generations g on g.id = c.generation_id and g.client_id = c.client_id
       where c.opportunity_id = $1 and c.client_id = $2 and c.status <> 'superseded'
       order by c.is_selected desc, array_position(array['insight','conversation','expert'], c.comment_type)`,
      [opportunityId, clientId],
    );
    const generations = (await db.one<{ n: number }>("select count(*)::int as n from comment_generations where opportunity_id = $1 and client_id = $2", [opportunityId, clientId]))!.n;
    return { o, comments, generations };
  });
  if (!data) notFound();
  const { o, comments } = data;
  const caps = getAdapter(o.platform).capabilities;
  const drafts = comments.filter((c) => c.status === "generated");
  const active = comments.find((c) => !["generated", "rejected"].includes(c.status));
  const base = `/clients/${clientId}`;

  return (
    <>
      <PageHeader
        eyebrow={<span>Opportunity · {o.campaign}</span>}
        title={
          <span className="flex items-center gap-2">
            <PlatformIcon platform={o.platform} size={24} />
            {o.author_handle ? `@${o.author_handle}` : (o.author_name ?? "Unknown author")}
          </span>
        }
        actions={
          <>
            <StatusBadge status={o.status} />
            {access.canManage && ["analyzed", "discovered", "comment_generated", "rejected"].includes(o.status) && (
              <ActionButton run={dismissOpportunity.bind(null, clientId, o.id)} variant="ghost" size="md" confirm={{ title: "Dismiss this opportunity?", body: "It will be hidden from the open list.", label: "Dismiss" }}>
                Dismiss
              </ActionButton>
            )}
            <LinkButton href={`${base}/opportunities`}>Back</LinkButton>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader
              title="Post"
              description={`${formatDate(o.posted_at, true)} · ${fmt(o.metrics.likes ?? null)} likes · ${fmt(o.metrics.comments ?? null)} comments${o.source === "manual" ? " · added manually" : ""}`}
              actions={
                o.url ? (
                  <a href={o.url} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-brand hover:underline">
                    Open ↗
                  </a>
                ) : null
              }
            />
            <CardBody>
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink">{o.content}</p>
              {o.reply_to_text && (
                <div className="mt-4 rounded-lg border-l-2 border-accent bg-accent-soft/50 px-3 py-2 text-sm">
                  <div className="text-xs font-medium text-ink-3">Comment from {o.reply_to_author ? `@${o.reply_to_author}` : "a follower"} — the reply goes here</div>
                  <p className="mt-1 text-ink-2">{o.reply_to_text}</p>
                </div>
              )}
              {(o.author_bio || o.author_followers != null) && (
                <p className="mt-4 text-xs text-ink-3">
                  Author: {o.author_name ?? o.author_handle} {o.author_bio ? `· ${o.author_bio}` : ""} {o.author_followers != null ? `· ${fmt(o.author_followers)} followers` : ""}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Comments"
              description={data.generations ? `${data.generations} generation${data.generations === 1 ? "" : "s"} · three types per run: insight, conversation, expert perspective` : "Three options per run: insight, conversation and expert perspective"}
              actions={access.canManage && drafts.length === 0 && !active ? <GenerateButton clientId={clientId} opportunityId={o.id} /> : null}
            />
            {o.publish_capability === "manual" && (
              <div className="px-5 pt-4">
                <Notice tone="warn">
                  {(caps.publishOnThirdPartyPost.note ?? "This platform's API can't publish here").replace(/\.?$/, ".")} Once approved, the comment is posted manually from the client&apos;s account
                  and the link recorded.
                </Notice>
              </div>
            )}
            {comments.length === 0 ? (
              <EmptyState title="No comments yet" description={access.canManage ? "Generate three options grounded in this client's brand voice and audience." : "GBS hasn't drafted comments for this post yet."} />
            ) : (
              <ul className="divide-y divide-line">
                {comments.map((c) => (
                  <li key={c.id} className={cx("px-5 py-4", c.is_selected && c.status === "generated" && "bg-brand-soft/40")}>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge tone="brand">{TYPE_LABEL[c.comment_type]}</Badge>
                      {c.is_selected && c.status === "generated" && <Badge tone="good">Recommended</Badge>}
                      {c.is_edited && <Badge tone="info">Edited</Badge>}
                      <StatusBadge status={c.status} />
                      <span className="ml-auto">
                        <QualityBadge score={c.quality_score} passed={c.quality_passed} />
                      </span>
                    </div>
                    {c.status === "generated" && access.canEditComments ? (
                      <VariantEditor clientId={clientId} commentId={c.id} text={c.current_text} />
                    ) : (
                      <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink">{c.current_text}</p>
                    )}
                    {c.ai_reasoning && <p className="mt-1 text-xs text-ink-3">AI reasoning: {c.ai_reasoning}</p>}
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {(c.quality_report?.checks ?? []).map((q) => (
                        <li key={q.check} title={q.message}>
                          <Badge tone={q.status === "pass" ? "neutral" : q.status === "warn" ? "warn" : "bad"}>
                            {q.status === "pass" ? "✓" : q.status === "warn" ? "!" : "✕"} {CHECK_LABELS[q.check]}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                    {(c.quality_report?.checks ?? [])
                      .filter((q) => q.status !== "pass")
                      .map((q) => (
                        <p key={q.check} className={cx("mt-1 text-xs", q.status === "fail" ? "text-bad" : "text-warn")}>
                          {q.message}
                        </p>
                      ))}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {c.status === "generated" && access.canManage && !active && <SubmitForApprovalButton clientId={clientId} commentId={c.id} />}
                      {c.status === "approved" && (access.canApproveGbs || access.canApproveClient) && <QueueButton clientId={clientId} commentId={c.id} />}
                      {c.model && <span className="self-center text-xs text-ink-3">Drafted by {c.provider === "offline" ? "offline drafts (no AI key)" : c.model}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {access.canManage && comments.length > 0 && !active && (
              <div className="border-t border-line px-5 py-4">
                <div className="mb-2 text-xs font-medium text-ink-3">Not right? Regenerate with guidance</div>
                <RegenerateForm clientId={clientId} opportunityId={o.id} />
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Opportunity score" />
            <CardBody>
              <div className="flex items-baseline gap-3">
                <span className="tabular text-4xl font-semibold text-ink">{o.score ?? "—"}</span>
                <span className="text-sm text-ink-3">/100</span>
                <span className="text-sm font-medium text-ink-2">{o.score_label}</span>
              </div>
              {o.explanation && <p className="mt-3 text-sm text-ink-2">“{o.explanation}”</p>}
              <ul className="mt-4 flex flex-col gap-2.5">
                {(Object.keys(SCORE_WEIGHTS) as FactorKey[]).map((k) => {
                  const v = Number(o.score_breakdown[k] ?? 0);
                  return (
                    <li key={k}>
                      <div className="flex justify-between text-xs">
                        <span className="text-ink-2">
                          {FACTOR_LABEL[k]} <span className="text-ink-3">· {Math.round(SCORE_WEIGHTS[k] * 100)}%</span>
                        </span>
                        <span className="tabular font-medium text-ink">{v}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-sunken">
                        <div className="h-1.5 rounded-full bg-[var(--series-1)]" style={{ width: `${v}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <dl className="mt-4 flex flex-col gap-2 text-xs">
                <div>
                  <dt className="text-ink-3">Audience</dt>
                  <dd className="text-ink-2">{o.audience_match ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">Brand relevance</dt>
                  <dd className="text-ink-2">{o.brand_relevance ?? "—"}</dd>
                </div>
                {typeof o.score_breakdown.discovered_via === "string" && (
                  <div>
                    <dt className="text-ink-3">Found via</dt>
                    <dd className="text-ink-2">{o.score_breakdown.discovered_via}</dd>
                  </div>
                )}
              </dl>
              <p className="mt-4 text-xs text-ink-3">{SCORE_DISCLAIMER}</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
