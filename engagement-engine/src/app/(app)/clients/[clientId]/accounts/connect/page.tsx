import { notFound } from "next/navigation";
import { requireClientAccess } from "@/lib/auth/session";
import { withSystem, withUser } from "@/lib/db";
import { readOAuthState } from "@/lib/services/oauth";
import { Card, CardBody, CardHeader, Notice, PageHeader, PlatformIcon } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { attachAccounts } from "@/app/actions/accounts";

export const metadata = { title: "Choose accounts" };

export default async function ConnectPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ state?: string }> }) {
  const { clientId } = await params;
  const { state = "" } = await searchParams;
  const { user, access } = await requireClientAccess(clientId);
  if (!access.canManage) notFound();
  const row = await withSystem((db) => readOAuthState(db, state, user.id));
  if (!row || row.client_id !== clientId || !row.pending) notFound();
  const client = await withUser(user.id, (db) => db.one<{ name: string }>("select name from clients where id = $1", [clientId]));
  // Only names are shown; tokens never leave the server.
  const options = row.pending.filter((a) => a.platform === row.platform);
  return (
    <>
      <PageHeader title={`Choose accounts for ${client?.name}`} description="This login can reach the accounts below. Select only the ones that belong to this client." />
      <Card className="max-w-2xl">
        <CardHeader title="Available accounts" />
        <CardBody>
          <div className="mb-4">
            <Notice tone="warn">Each account can belong to only one client. Don&apos;t select pages or profiles that belong to another client.</Notice>
          </div>
          <ActionForm action={attachAccounts.bind(null, clientId, state)} className="flex flex-col gap-3">
            {options.map((a) => (
              <label key={a.externalAccountId} className="flex items-center gap-3 rounded-lg border border-line-strong px-3 py-2.5">
                <input type="checkbox" name="account" value={a.externalAccountId} className="h-4 w-4 accent-[var(--brand)]" />
                <PlatformIcon platform={a.platform} />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-ink">{a.displayName ?? a.handle}</span>
                  <span className="text-xs text-ink-3">
                    {a.handle ? `@${a.handle} · ` : ""}
                    {a.accountType}
                    {typeof a.metadata.page_name === "string" ? ` · Page: ${a.metadata.page_name}` : ""}
                  </span>
                </span>
              </label>
            ))}
            <div>
              <SubmitButton>Connect selected</SubmitButton>
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
