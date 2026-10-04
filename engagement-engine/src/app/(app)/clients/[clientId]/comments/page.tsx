import Link from "next/link";
import { requireClientAccess } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { Card, EmptyState, PageHeader, PlatformIcon, QualityBadge, StatusBadge, Table, Td, Th, formatDate } from "@/components/ui";

export const metadata = { title: "Comment history" };

const STATUS_FILTERS = ["", "generated", "pending_approval", "approved", "edited", "rejected", "queued", "published", "failed"];

export default async function CommentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ platform?: string; campaign?: string; status?: string; from?: string; to?: string; author?: string; sort?: string }>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const { user } = await requireClientAccess(clientId);
  const status = STATUS_FILTERS.includes(sp.status ?? "") ? (sp.status ?? "") : "";
  const iso = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  const { rows, campaigns } = await withUser(user.id, async (db) => {
    const campaigns = await db.query<{ id: string; name: string }>("select id, name from campaigns where client_id = $1 order by name", [clientId]);
    const rows = await db.query<{
      id: string;
      opportunity_id: string;
      platform: string;
      current_text: string;
      original_text: string;
      is_edited: boolean;
      status: string;
      quality_score: number | null;
      quality_passed: boolean;
      author: string | null;
      campaign: string;
      created_at: Date;
      published_at: Date | null;
      approved_by: string | null;
      likes: number;
      replies: number;
      external_url: string | null;
    }>(
      `select c.id, c.opportunity_id, c.platform, c.current_text, c.original_text, c.is_edited, c.status, c.quality_score, c.quality_passed,
              coalesce(p.author_handle, p.author_name) as author, ca.name as campaign, c.created_at, c.published_at, u.full_name as approved_by,
              coalesce(m.likes, 0)::int as likes, coalesce(m.replies, 0)::int as replies, c.external_url
       from comments c
       join engagement_opportunities o on o.id = c.opportunity_id and o.client_id = c.client_id
       join posts p on p.id = o.post_id and p.client_id = o.client_id
       join campaigns ca on ca.id = c.campaign_id and ca.client_id = c.client_id
       left join users u on u.id = c.approved_by
       left join lateral (select sum(likes) as likes, sum(replies) as replies from engagement_metrics em where em.comment_id = c.id and em.client_id = c.client_id) m on true
       where c.client_id = $1 and c.status <> 'superseded'
         and ($2 = '' or c.platform = $2)
         and ($3 = '' or c.campaign_id::text = $3)
         and (case $4 when '' then true when 'edited' then c.is_edited else c.status = $4 end)
         and ($5 = '' or c.created_at >= $5::date)
         and ($6 = '' or c.created_at < $6::date + 1)
         and ($7 = '' or p.author_handle ilike '%' || $7 || '%' or p.author_name ilike '%' || $7 || '%')
       order by case when $8 = 'performance' then coalesce(m.replies, 0) * 3 + coalesce(m.likes, 0) end desc nulls last, c.created_at desc
       limit 300`,
      [clientId, sp.platform ?? "", sp.campaign ?? "", status, iso(sp.from), iso(sp.to), (sp.author ?? "").replace(/^@/, "").slice(0, 60), sp.sort === "performance" ? "performance" : ""],
    );
    return { rows, campaigns };
  });

  const sel = "h-9 rounded-lg border border-line-strong px-2 text-sm";
  return (
    <>
      <PageHeader title="Comment history" description="Every comment for this client, with the original AI version kept alongside any edits." />
      <Card>
        <form className="flex flex-wrap gap-2 border-b border-line px-4 py-3">
          <select name="platform" defaultValue={sp.platform ?? ""} aria-label="Platform" className={sel}>
            <option value="">All platforms</option>
            {["instagram", "facebook", "linkedin", "youtube"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select name="campaign" defaultValue={sp.campaign ?? ""} aria-label="Campaign" className={sel}>
            <option value="">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={status} aria-label="Status" className={sel}>
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s ? s.replace("_", " ") : "All statuses"}
              </option>
            ))}
          </select>
          <input type="date" name="from" defaultValue={iso(sp.from)} aria-label="From" className={sel} />
          <input type="date" name="to" defaultValue={iso(sp.to)} aria-label="To" className={sel} />
          <input name="author" defaultValue={sp.author ?? ""} placeholder="Author" aria-label="Author" className={sel + " w-32"} />
          <select name="sort" defaultValue={sp.sort ?? ""} aria-label="Sort" className={sel}>
            <option value="">Newest first</option>
            <option value="performance">Best performing</option>
          </select>
          <button className="h-9 rounded-lg border border-line-strong px-3 text-sm">Apply</button>
        </form>
        {rows.length === 0 ? (
          <EmptyState title="No comments match these filters" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Comment</Th>
                <Th>Author</Th>
                <Th>Status</Th>
                <Th>Quality</Th>
                <Th className="text-right">Likes</Th>
                <Th className="text-right">Replies</Th>
                <Th>Date</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="align-top hover:bg-surface-2">
                  <Td className="max-w-[440px]">
                    <div className="flex items-start gap-2">
                      <PlatformIcon platform={r.platform} size={18} />
                      <div className="min-w-0">
                        <Link href={`/clients/${clientId}/opportunities/${r.opportunity_id}`} className="line-clamp-3 text-sm text-ink hover:underline">
                          {r.current_text}
                        </Link>
                        {r.is_edited && (
                          <details className="mt-1 text-xs text-ink-3">
                            <summary className="cursor-pointer">Edited · original AI version</summary>
                            <p className="mt-1">{r.original_text}</p>
                          </details>
                        )}
                        <div className="mt-1 text-xs text-ink-3">
                          {r.campaign}
                          {r.approved_by ? ` · approved by ${r.approved_by}` : ""}
                          {r.external_url && (
                            <>
                              {" · "}
                              <a href={r.external_url} target="_blank" rel="noopener noreferrer nofollow" className="text-brand hover:underline">
                                view ↗
                              </a>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </Td>
                  <Td>{r.author ? `@${r.author}` : "—"}</Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge status={r.status} />
                      {r.is_edited && <span className="text-xs text-info">Edited</span>}
                    </div>
                  </Td>
                  <Td>
                    <QualityBadge score={r.quality_score} passed={r.quality_passed} />
                  </Td>
                  <Td className="tabular text-right">{r.likes}</Td>
                  <Td className="tabular text-right">{r.replies}</Td>
                  <Td className="whitespace-nowrap text-xs">{formatDate(r.published_at ?? r.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
