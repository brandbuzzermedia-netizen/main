import { requireClientAccess } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { enabledPlatforms } from "@/lib/env";
import { getAdapter, oauthConfigFor } from "@/lib/platforms/registry";
import { PLATFORM_LABELS, type Capability, type Platform } from "@/lib/platforms/types";
import { Badge, Card, CardBody, CardHeader, EmptyState, Notice, PageHeader, PlatformIcon, StatusBadge, buttonClass, formatDate, timeAgo } from "@/components/ui";
import { ActionButton } from "@/components/client/comment-tools";
import { disconnectAccount } from "@/app/actions/accounts";

export const metadata = { title: "Social accounts" };

function CapLine({ label, c }: { label: string; c: Capability }) {
  const tone = c.status === "supported" ? "good" : c.status === "limited" ? "warn" : c.status === "manual" ? "accent" : "neutral";
  const word = { supported: "Yes", limited: "Limited", manual: "Manual", unsupported: "No", prohibited: "Not allowed" }[c.status];
  return (
    <li className="flex items-start justify-between gap-3 py-1 text-xs">
      <span className="text-ink-2">{label}</span>
      <span className="flex flex-col items-end text-right">
        <Badge tone={tone}>{word}</Badge>
        {c.note && <span className="mt-0.5 max-w-[240px] text-[11px] text-ink-3">{c.note}</span>}
      </span>
    </li>
  );
}

export default async function AccountsPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ error?: string; connected?: string }> }) {
  const { clientId } = await params;
  const sp = await searchParams;
  const { user, access } = await requireClientAccess(clientId);
  const accounts = await withUser(user.id, (db) =>
    db.query<{
      id: string;
      platform: Platform;
      handle: string | null;
      display_name: string | null;
      account_type: string | null;
      status: string;
      connected_at: Date;
      last_synced_at: Date | null;
      last_published_at: Date | null;
      demo: boolean;
      connected_by: string | null;
    }>(
      `select sa.id, sa.platform, sa.handle, sa.display_name, sa.account_type, sa.status, sa.connected_at, sa.last_synced_at, sa.last_published_at,
              coalesce((sa.metadata->>'demo')::boolean, false) as demo, u.full_name as connected_by
       from social_accounts sa left join users u on u.id = sa.connected_by
       where sa.client_id = $1 and sa.status <> 'disconnected' order by sa.platform, sa.display_name`,
      [clientId],
    ),
  );
  const platforms = enabledPlatforms().filter((p): p is Platform => ["instagram", "facebook", "linkedin", "youtube"].includes(p));

  return (
    <>
      <PageHeader title="Social accounts" description="Accounts belong to this client only. Tokens are encrypted and bound to this client — they can't be used for anyone else." />
      {sp.error && (
        <div className="mb-4">
          <Notice tone="bad">{sp.error}</Notice>
        </div>
      )}
      {sp.connected && (
        <div className="mb-4">
          <Notice tone="good">Account connected.</Notice>
        </div>
      )}
      <Card>
        <CardHeader title="Connected" />
        {accounts.length === 0 ? (
          <EmptyState title="No accounts connected" description="Connect the client's Instagram, Facebook or LinkedIn accounts through official sign-in." />
        ) : (
          <ul className="divide-y divide-line">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <PlatformIcon platform={a.platform} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                    {a.display_name ?? a.handle}
                    {a.handle && <span className="text-xs font-normal text-ink-3">@{a.handle}</span>}
                    {a.demo && <Badge tone="accent">Demo data</Badge>}
                  </div>
                  <div className="text-xs text-ink-3">
                    {PLATFORM_LABELS[a.platform]} {a.account_type} · connected {formatDate(a.connected_at)}
                    {a.connected_by ? ` by ${a.connected_by}` : ""} · synced {timeAgo(a.last_synced_at)}
                  </div>
                </div>
                <StatusBadge status={a.status} />
                {access.canManage && a.status === "expired" && (
                  <a href={`/api/oauth/${a.platform}/start?clientId=${clientId}`} className={buttonClass("primary", "sm")}>
                    Reconnect
                  </a>
                )}
                {access.canManage && (
                  <ActionButton
                    run={disconnectAccount.bind(null, clientId, a.id)}
                    variant="danger"
                    confirm={{ title: "Disconnect this account?", body: "Its token is deleted. Queued comments for it won't publish until it's reconnected.", label: "Disconnect" }}
                  >
                    Disconnect
                  </ActionButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-ink">Connect a platform</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {platforms.map((p) => {
          const caps = getAdapter(p).capabilities;
          const configured = !!oauthConfigFor(p);
          return (
            <Card key={p}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <PlatformIcon platform={p} /> {PLATFORM_LABELS[p]}
                  </span>
                }
                description={caps.connect.note}
                actions={
                  access.canManage &&
                  (configured ? (
                    <a href={`/api/oauth/${p}/start?clientId=${clientId}`} className={buttonClass("primary", "sm")}>
                      Connect
                    </a>
                  ) : (
                    <Badge tone="neutral">App not configured</Badge>
                  ))
                }
              />
              <CardBody>
                <ul className="divide-y divide-line">
                  <CapLine label="Find posts by hashtag" c={caps.discoverByHashtag} />
                  <CapLine label="Find posts by keyword" c={caps.discoverByKeyword} />
                  <CapLine label="Reply on own posts" c={caps.publishReplyOnOwnPost} />
                  <CapLine label="Comment on others' posts" c={caps.publishOnThirdPartyPost} />
                  <CapLine label="Comment metrics" c={caps.commentMetrics} />
                </ul>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
