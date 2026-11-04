import Link from "next/link";
import { requireClientAccess } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { Card, CardHeader, EmptyState, PageHeader, PlatformIcon, StatusBadge, Table, Td, Th, formatDate } from "@/components/ui";
import { ActionButton, QueueButton } from "@/components/client/comment-tools";
import { cancelJob, processQueueNow, retryJob } from "@/app/actions/engagement";
import { ManualPublishForm, CopyButton } from "./manual";

export const metadata = { title: "Publishing queue" };

export default async function PublishingPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { user, access } = await requireClientAccess(clientId);
  const { jobs, awaiting, client } = await withUser(user.id, async (db) => {
    const client = await db.one<{ name: string; publish_on_approval: boolean }>("select name, publish_on_approval from clients where id = $1", [clientId]);
    const jobs = await db.query<{
      id: string;
      status: string;
      platform: string;
      scheduled_for: Date;
      attempts: number;
      last_error: string | null;
      text: string;
      author: string | null;
      post_url: string | null;
      approved_by: string | null;
      account: string | null;
      updated_at: Date;
      opportunity_id: string;
    }>(
      `select j.id, j.status, j.platform, j.scheduled_for, j.attempts, j.last_error, c.current_text as text,
              coalesce(p.author_handle, p.author_name) as author, p.url as post_url, u.full_name as approved_by,
              coalesce(sa.display_name, sa.handle) as account, j.updated_at, c.opportunity_id
       from publishing_jobs j
       join comments c on c.id = j.comment_id and c.client_id = j.client_id
       join engagement_opportunities o on o.id = c.opportunity_id and o.client_id = c.client_id
       join posts p on p.id = o.post_id and p.client_id = o.client_id
       left join users u on u.id = j.approved_by
       left join social_accounts sa on sa.id = j.social_account_id and sa.client_id = j.client_id
       where j.client_id = $1 and (j.status <> 'published' or j.updated_at > now() - interval '7 days')
       order by case j.status when 'manual_required' then 0 when 'failed' then 1 when 'publishing' then 2 when 'queued' then 3 else 4 end, j.scheduled_for`,
      [clientId],
    );
    const awaiting = await db.query<{ id: string; platform: string; text: string; author: string | null; approved_at: Date }>(
      `select c.id, c.platform, c.current_text as text, coalesce(p.author_handle, p.author_name) as author, c.approved_at
       from comments c join engagement_opportunities o on o.id = c.opportunity_id and o.client_id = c.client_id
       join posts p on p.id = o.post_id and p.client_id = o.client_id
       where c.client_id = $1 and c.status = 'approved' order by c.approved_at`,
      [clientId],
    );
    return { jobs, awaiting, client: client! };
  });
  const canQueue = access.canApproveGbs || access.canApproveClient;
  const canRecord = access.canEditComments || access.canApproveClient;

  return (
    <>
      <PageHeader
        title="Publishing queue"
        description="Only approved comments appear here. The worker publishes through official APIs, respecting daily limits and spacing between comments."
        actions={access.isGbsManager && <ActionButton run={processQueueNow.bind(null, clientId)} size="md">Process due jobs now</ActionButton>}
      />

      {awaiting.length > 0 && (
        <Card className="mb-6">
          <CardHeader
            title={`Approved, not yet queued (${awaiting.length})`}
            description={client.publish_on_approval ? "This client publishes on approval; these were approved before that was switched on." : "Queue each approved comment when you're ready."}
          />
          <ul className="divide-y divide-line">
            {awaiting.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <PlatformIcon platform={a.platform} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm text-ink">{a.text}</p>
                  <p className="text-xs text-ink-3">
                    {a.author ? `@${a.author} · ` : ""}approved {formatDate(a.approved_at, true)}
                  </p>
                </div>
                {canQueue && <QueueButton clientId={clientId} commentId={a.id} />}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        {jobs.length === 0 ? (
          <EmptyState title="The queue is empty" description="Approved comments you queue will show here until they're published." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th>Platform</Th>
                <Th>Author</Th>
                <Th>Comment</Th>
                <Th>Approved by</Th>
                <Th>Scheduled</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="align-top">
                  <Td className="text-xs">{client.name}</Td>
                  <Td>
                    <span className="flex items-center gap-2">
                      <PlatformIcon platform={j.platform} size={18} />
                      <span className="text-xs">{j.account ?? "—"}</span>
                    </span>
                  </Td>
                  <Td>
                    {j.post_url ? (
                      <a href={j.post_url} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">
                        {j.author ? `@${j.author}` : "post"} ↗
                      </a>
                    ) : j.author ? (
                      `@${j.author}`
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="max-w-[360px]">
                    <Link href={`/clients/${clientId}/opportunities/${j.opportunity_id}`} className="line-clamp-3 text-sm text-ink hover:underline">
                      {j.text}
                    </Link>
                    {j.last_error && j.status !== "published" && <p className="mt-1 text-xs text-bad">{j.last_error}</p>}
                  </Td>
                  <Td className="text-xs">{j.approved_by ?? "—"}</Td>
                  <Td className="whitespace-nowrap text-xs">{formatDate(j.scheduled_for, true)}</Td>
                  <Td>
                    <StatusBadge status={j.status} />
                    {j.attempts > 0 && j.status !== "published" && <div className="mt-1 text-xs text-ink-3">{j.attempts} attempt(s)</div>}
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-2">
                      {j.status === "manual_required" && (
                        <>
                          <CopyButton text={j.text} />
                          {canRecord && <ManualPublishForm clientId={clientId} jobId={j.id} />}
                        </>
                      )}
                      {j.status === "failed" && canQueue && <ActionButton run={retryJob.bind(null, clientId, j.id)}>Retry</ActionButton>}
                      {["queued", "manual_required", "failed"].includes(j.status) && canQueue && (
                        <ActionButton run={cancelJob.bind(null, clientId, j.id)} variant="ghost" confirm={{ title: "Remove from queue?", body: "The comment stays approved and can be queued again.", label: "Remove" }}>
                          Remove
                        </ActionButton>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
