import Link from "next/link";
import { requireClientAccess } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { SCORE_DISCLAIMER } from "@/lib/engine/scoring";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, PlatformIcon, ScoreBadge, StatusBadge, Table, Td, Th, timeAgo } from "@/components/ui";
import { ManualIntakeForm } from "./intake-form";

export const metadata = { title: "Opportunities" };

const STATUSES = ["open", "analyzed", "comment_generated", "pending_approval", "approved", "queued", "published", "rejected", "dismissed", "all"] as const;

export default async function OpportunitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ status?: string; campaign?: string; platform?: string }>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const { user, access } = await requireClientAccess(clientId);
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status! : "open";
  const { rows, campaigns } = await withUser(user.id, async (db) => {
    const campaigns = await db.query<{ id: string; name: string; platforms: string[]; status: string }>(
      "select id, name, platforms, status from campaigns where client_id = $1 and status <> 'archived' order by name",
      [clientId],
    );
    const rows = await db.query<{
      id: string;
      platform: string;
      score: number | null;
      score_label: string | null;
      status: string;
      explanation: string | null;
      opportunity_type: string;
      publish_capability: string;
      author: string | null;
      content: string;
      campaign: string;
      discovered_at: Date;
      followers: number | null;
    }>(
      `select o.id, o.platform, o.score, o.score_label, o.status, o.explanation, o.opportunity_type, o.publish_capability,
              coalesce(p.author_handle, p.author_name) as author, p.content, ca.name as campaign, o.discovered_at, p.author_followers as followers
       from engagement_opportunities o
       join posts p on p.id = o.post_id and p.client_id = o.client_id
       join campaigns ca on ca.id = o.campaign_id and ca.client_id = o.client_id
       where o.client_id = $1
         and (case $2 when 'all' then true when 'open' then o.status in ('discovered','analyzed','comment_generated') else o.status = $2 end)
         and ($3 = '' or o.campaign_id::text = $3)
         and ($4 = '' or o.platform = $4)
       order by o.score desc nulls last, o.discovered_at desc limit 200`,
      [clientId, status, sp.campaign ?? "", sp.platform ?? ""],
    );
    return { rows, campaigns };
  });

  const base = `/clients/${clientId}`;
  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Conversations found through official platform APIs or added manually, scored for this client's audience."
        actions={
          <Link href={`${base}/campaigns`} className="text-sm text-brand hover:underline">
            Run discovery from a campaign →
          </Link>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card>
          <form className="flex flex-wrap gap-2 border-b border-line px-4 py-3">
            <select name="status" defaultValue={status} aria-label="Status" className="h-9 rounded-full border-2 border-brand/30 bg-surface-2 px-3 text-sm">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === "open" ? "Open (needs action)" : s === "all" ? "All statuses" : s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <select name="campaign" defaultValue={sp.campaign ?? ""} aria-label="Campaign" className="h-9 rounded-full border-2 border-brand/30 bg-surface-2 px-3 text-sm">
              <option value="">All campaigns</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select name="platform" defaultValue={sp.platform ?? ""} aria-label="Platform" className="h-9 rounded-full border-2 border-brand/30 bg-surface-2 px-3 text-sm">
              <option value="">All platforms</option>
              {["instagram", "facebook", "linkedin", "youtube"].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <button className="gbs-press h-9 rounded-full border-2 border-brand bg-surface px-4 text-sm font-semibold text-brand shadow-hard-sm">Apply</button>
          </form>
          {rows.length === 0 ? (
            <EmptyState title="No opportunities here" description="Activate a campaign and run discovery, or add a post you found manually." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Post</Th>
                  <Th>Score</Th>
                  <Th>Campaign</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="hover:bg-surface-2">
                    <Td className="max-w-[520px]">
                      <Link href={`${base}/opportunities/${o.id}`} className="flex items-start gap-3">
                        <PlatformIcon platform={o.platform} />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-ink">
                            {o.author ? `@${o.author}` : "Unknown author"}
                            <span className="ml-2 text-xs font-normal text-ink-3">{timeAgo(o.discovered_at)}</span>
                            {o.opportunity_type === "own_post_comment" && <span className="ml-2 text-xs font-normal text-info">reply on own post</span>}
                          </span>
                          <span className="line-clamp-2 text-sm text-ink-2">{o.content}</span>
                          {o.explanation && <span className="mt-0.5 line-clamp-1 text-xs text-ink-3">{o.explanation}</span>}
                        </span>
                      </Link>
                    </Td>
                    <Td>
                      <ScoreBadge score={o.score} label={o.score_label} />
                    </Td>
                    <Td className="text-xs">{o.campaign}</Td>
                    <Td>
                      <StatusBadge status={o.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <p className="border-t border-line px-4 py-2 text-xs text-ink-3">{SCORE_DISCLAIMER}</p>
        </Card>
        {access.canManage && (
          <Card className="self-start">
            <CardHeader title="Add a post manually" description="For platforms whose API can't search (LinkedIn, Instagram beyond hashtags). Paste the post you found." />
            <CardBody>
              <ManualIntakeForm clientId={clientId} campaigns={campaigns.filter((c) => c.status !== "archived")} />
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
