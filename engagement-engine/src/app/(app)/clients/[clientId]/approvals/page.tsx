import { requireClientAccess } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { approverSide, requiredSides, type ApprovalMode } from "@/lib/engine/approvals";
import type { QualityReport } from "@/lib/engine/quality";
import { Card, EmptyState, LinkButton, Notice, PageHeader } from "@/components/ui";
import { ApprovalQueue, type ApprovalItem } from "@/components/client/approval-queue";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { user, access } = await requireClientAccess(clientId);
  const { rows, mode, approvers, suggestions } = await withUser(user.id, async (db) => {
    const client = await db.one<{ approval_mode: ApprovalMode }>("select approval_mode from clients where id = $1", [clientId]);
    const rows = await db.query<{
      id: string;
      platform: string;
      comment_type: string;
      current_text: string;
      original_text: string;
      is_edited: boolean;
      ai_reasoning: string | null;
      quality_score: number | null;
      quality_passed: boolean;
      quality_report: QualityReport | null;
      score: number | null;
      score_label: string | null;
      explanation: string | null;
      content: string;
      url: string | null;
      author: string | null;
      author_bio: string | null;
      campaign: string;
      created_at: Date;
      mode: ApprovalMode;
      sides: string[];
      my_sides: string[];
      publish_capability: "api" | "manual";
      reply_to_text: string | null;
    }>(
      `select c.id, c.platform, c.comment_type, c.current_text, c.original_text, c.is_edited, c.ai_reasoning, c.quality_score, c.quality_passed,
              c.quality_report, o.score, o.score_label, o.explanation, p.content, p.url, coalesce(p.author_handle, p.author_name) as author,
              p.author_bio, ca.name as campaign, c.created_at, coalesce(ca.approval_mode, cl.approval_mode) as mode, o.publish_capability, o.reply_to_text,
              coalesce((select array_agg(a.approver_side) from comment_approvals a where a.comment_id = c.id and a.decision = 'approved'), '{}') as sides,
              coalesce((select array_agg(a.approver_side) from comment_approvals a where a.comment_id = c.id and a.decision = 'approved' and a.approver_id = $2), '{}') as my_sides
       from comments c
       join engagement_opportunities o on o.id = c.opportunity_id and o.client_id = c.client_id
       join posts p on p.id = o.post_id and p.client_id = o.client_id
       join campaigns ca on ca.id = c.campaign_id and ca.client_id = c.client_id
       join clients cl on cl.id = c.client_id
       where c.client_id = $1 and c.status = 'pending_approval'
       order by c.quality_passed desc, o.score desc nulls last, c.created_at`,
      [clientId, user.id],
    );
    const approvers = await db.one<{ n: number }>(
      "select count(*)::int as n from client_users where client_id = $1 and (role = 'owner' or can_approve)",
      [clientId],
    );
    const suggestions = await db.query<{ id: string; comment_id: string; new_text: string; note: string | null; by: string | null }>(
      `select e.id, e.comment_id, e.new_text, e.note, u.full_name as by from comment_edits e left join users u on u.id = e.editor_id
       where e.client_id = $1 and e.kind = 'suggestion' and e.suggestion_status = 'open'`,
      [clientId],
    );
    return { rows, mode: client!.approval_mode, approvers: approvers!.n, suggestions };
  });

  const items: ApprovalItem[] = rows.map((r) => {
    const side = approverSide(access, r.mode);
    return {
      id: r.id,
      platform: r.platform,
      commentType: r.comment_type,
      text: r.current_text,
      originalText: r.original_text,
      isEdited: r.is_edited,
      aiReasoning: r.ai_reasoning,
      qualityScore: r.quality_score,
      qualityPassed: r.quality_passed,
      checks: r.quality_report?.checks ?? [],
      score: r.score,
      scoreLabel: r.score_label,
      explanation: r.explanation,
      postContent: r.content,
      postUrl: r.url,
      author: r.author,
      authorBio: r.author_bio,
      campaign: r.campaign,
      createdAt: r.created_at.toISOString(),
      approvedSides: r.sides,
      requiredSides: requiredSides(r.mode),
      mySide: side,
      iApproved: !!side && r.my_sides.includes(side),
      publishCapability: r.publish_capability,
      replyToText: r.reply_to_text,
      suggestions: suggestions.filter((s) => s.comment_id === r.id).map((s) => ({ id: s.id, text: s.new_text, by: s.by ?? "Team member", note: s.note })),
    };
  });

  const needsClient = requiredSides(mode).includes("client");
  return (
    <>
      <PageHeader
        title="Approvals"
        description="Nothing is published without approval. Approved comments move to the publishing queue."
        actions={<LinkButton href={`/clients/${clientId}/publishing`}>Publishing queue →</LinkButton>}
      />
      {needsClient && approvers === 0 && (
        <div className="mb-4">
          <Notice tone="warn">This client&apos;s approval mode needs client approval, but no client user can approve yet. Add an approver in Settings.</Notice>
        </div>
      )}
      {!access.canApproveGbs && !access.canApproveClient && (
        <div className="mb-4">
          <Notice tone="info">You can review and suggest edits. Approval is done by this client&apos;s approvers.</Notice>
        </div>
      )}
      {items.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing waiting for approval"
            description="Generated comments appear here once they're submitted for approval."
            action={access.canManage ? <LinkButton href={`/clients/${clientId}/opportunities`}>Go to opportunities</LinkButton> : undefined}
          />
        </Card>
      ) : (
        <ApprovalQueue clientId={clientId} items={items} canEdit={access.canEditComments} canRegenerate={access.canManage} />
      )}
    </>
  );
}
