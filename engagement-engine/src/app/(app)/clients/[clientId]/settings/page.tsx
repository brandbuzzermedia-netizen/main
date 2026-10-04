import { requireClientAccess } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { APPROVAL_MODE_LABELS, type ApprovalMode } from "@/lib/engine/approvals";
import { AUDIT_LABELS } from "@/lib/audit";
import { Badge, Card, CardBody, CardHeader, Field, Notice, PageHeader, Table, Td, Th, formatDate, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { addClientUser, assignAccountManager, deleteClient, saveClientSettings, saveLimits, setClientStatus, updateClientUser } from "@/app/actions/clients";

export const metadata = { title: "Client settings" };

export default async function ClientSettings({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { user, access } = await requireClientAccess(clientId);
  const isAdmin = user.platformRole === "super_admin";
  const d = await withUser(user.id, async (db) => ({
    client: (await db.one<{ name: string; industry: string | null; status: string; approval_mode: ApprovalMode; publish_on_approval: boolean }>(
      "select name, industry, status, approval_mode, publish_on_approval from clients where id = $1",
      [clientId],
    ))!,
    members: await db.query<{ user_id: string; full_name: string; email: string; role: "owner" | "member"; can_approve: boolean; can_edit: boolean; receives_approval_requests: boolean }>(
      `select cu.user_id, u.full_name, u.email, cu.role, cu.can_approve, cu.can_edit, cu.receives_approval_requests
       from client_users cu join users u on u.id = cu.user_id where cu.client_id = $1 order by cu.role, u.full_name`,
      [clientId],
    ),
    managers: await db.query<{ user_id: string; full_name: string; is_primary: boolean }>(
      "select am.user_id, u.full_name, am.is_primary from account_managers am join users u on u.id = am.user_id where am.client_id = $1 order by am.is_primary desc",
      [clientId],
    ),
    staff: isAdmin
      ? await db.query<{ id: string; full_name: string }>("select id, full_name from users where platform_role = 'account_manager' and status = 'active' order by full_name")
      : [],
    limits: await db.query<{ platform: string; daily_opportunity_limit: number; daily_publish_limit: number; min_minutes_between_comments: number; monthly_ai_generation_limit: number }>(
      "select platform, daily_opportunity_limit, daily_publish_limit, min_minutes_between_comments, monthly_ai_generation_limit from usage_limits where client_id = $1 order by platform = 'all' desc, platform",
      [clientId],
    ),
    usage: await db.query<{ kind: string; n: number }>(
      "select kind, sum(quantity)::int as n from usage_events where client_id = $1 and created_at >= date_trunc('month', now()) group by kind",
      [clientId],
    ),
    accounts: (await db.one<{ n: number }>("select count(*)::int as n from social_accounts where client_id = $1 and status = 'connected'", [clientId]))!.n,
    audit: access.canManage
      ? await db.query<{ actor_name: string; action: string; created_at: Date; campaign: string | null; details: Record<string, unknown> }>(
          `select a.actor_name, a.action, a.created_at, ca.name as campaign, a.details from audit_logs a
           left join campaigns ca on ca.id = a.campaign_id where a.client_id = $1 order by a.created_at desc limit 30`,
          [clientId],
        )
      : [],
  }));
  const gbs = access.isGbsManager;
  const usage = Object.fromEntries(d.usage.map((u) => [u.kind, u.n]));
  const all = d.limits.find((l) => l.platform === "all");

  return (
    <>
      <PageHeader title="Settings" description="Approval rules, people, limits and usage for this client." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Approval" description="No comment is ever published without approval. This chooses who approves." />
          <CardBody>
            <ActionForm action={saveClientSettings.bind(null, clientId)} className="flex flex-col gap-4">
              <fieldset disabled={!gbs} className="flex flex-col gap-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Client name">
                    <input name="name" defaultValue={d.client.name} className={inputClass} />
                  </Field>
                  <Field label="Industry">
                    <input name="industry" defaultValue={d.client.industry ?? ""} className={inputClass} />
                  </Field>
                </div>
                {(Object.keys(APPROVAL_MODE_LABELS) as ApprovalMode[]).map((m) => (
                  <label key={m} className="flex items-start gap-3 rounded-2xl border-2 border-brand/25 bg-surface-2 px-3 py-2.5">
                    <input type="radio" name="approval_mode" value={m} defaultChecked={d.client.approval_mode === m} className="mt-1 accent-[var(--brand)]" />
                    <span>
                      <span className="block text-sm font-medium text-ink">{APPROVAL_MODE_LABELS[m].label}</span>
                      <span className="text-xs text-ink-3">{APPROVAL_MODE_LABELS[m].description}</span>
                    </span>
                  </label>
                ))}
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" name="publish_on_approval" defaultChecked={d.client.publish_on_approval} className="mt-1 accent-[var(--brand)]" />
                  <span>
                    Queue comments for publishing as soon as they&apos;re fully approved
                    <span className="block text-xs text-ink-3">Off by default. Approval is still required; this only skips the separate “Queue” click.</span>
                  </span>
                </label>
              </fieldset>
              {gbs ? <div><SubmitButton>Save</SubmitButton></div> : <p className="text-xs text-ink-3">Managed by GBS.</p>}
            </ActionForm>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Usage this month" description="Tracked per client for future billing." />
          <CardBody className="grid grid-cols-2 gap-4 text-sm">
            {[
              ["AI generations", usage.ai_generation ?? 0, all?.monthly_ai_generation_limit],
              ["Opportunities analysed", usage.opportunity_analyzed ?? 0],
              ["Comments generated", usage.comment_generated ?? 0],
              ["Comments published", usage.comment_published ?? 0],
              ["Connected accounts", d.accounts],
              ["API calls", (usage.api_call ?? 0) + (usage.hashtag_query ?? 0)],
            ].map(([label, n, cap]) => (
              <div key={label as string}>
                <div className="text-xs text-ink-3">{label}</div>
                <div className="tabular text-lg font-semibold text-ink">
                  {Number(n).toLocaleString("en-IN")}
                  {cap != null && <span className="text-xs font-normal text-ink-3"> / {Number(cap).toLocaleString("en-IN")}</span>}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Client users" description="People who sign in to this client's portal. They only ever see this client." />
          {d.members.length > 0 && (
            <ul className="divide-y divide-line">
              {d.members.map((m) => (
                <li key={m.user_id} className="px-5 py-3">
                  <ActionForm action={updateClientUser.bind(null, clientId, m.user_id)} className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="min-w-[160px] flex-1">
                      <span className="block font-medium text-ink">{m.full_name}</span>
                      <span className="text-xs text-ink-3">{m.email}</span>
                    </span>
                    <fieldset disabled={!gbs} className="flex flex-wrap items-center gap-3">
                      <select name="role" defaultValue={m.role} aria-label="Role" className="h-8 rounded-full border-2 border-brand/30 bg-surface-2 px-2 text-xs">
                        <option value="owner">Owner</option>
                        <option value="member">Team member</option>
                      </select>
                      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="can_approve" defaultChecked={m.can_approve} /> Approve</label>
                      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="can_edit" defaultChecked={m.can_edit} /> Edit</label>
                      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="receives_approval_requests" defaultChecked={m.receives_approval_requests} /> Notify</label>
                      {gbs && (
                        <>
                          <SubmitButton size="sm" variant="secondary" name="op" value="save">Save</SubmitButton>
                          <SubmitButton size="sm" variant="ghost" name="op" value="remove">Remove</SubmitButton>
                        </>
                      )}
                    </fieldset>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
          {gbs && (
            <CardBody>
              <ActionForm action={addClientUser.bind(null, clientId)} resetOnSuccess className="grid gap-3 md:grid-cols-2">
                <Field label="Name"><input name="full_name" required className={inputClass} /></Field>
                <Field label="Email"><input name="email" type="email" required className={inputClass} /></Field>
                <Field label="Role">
                  <select name="role" className={inputClass}>
                    <option value="owner">Owner — approves, edits, configures</option>
                    <option value="member">Team member — reviews and suggests edits</option>
                  </select>
                </Field>
                <Field label="Initial password" hint={isAdmin ? "Needed for new logins (10+ characters). Share it securely." : "Only super admins can create new logins."}>
                  <input name="password" type="password" minLength={10} autoComplete="new-password" className={inputClass} disabled={!isAdmin} />
                </Field>
                <div className="flex flex-wrap gap-4 text-sm md:col-span-2">
                  <label className="flex items-center gap-2"><input type="checkbox" name="can_approve" /> Team member can approve</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="can_edit" /> Team member can edit directly</label>
                </div>
                <div><SubmitButton>Add user</SubmitButton></div>
              </ActionForm>
            </CardBody>
          )}
        </Card>

        <Card>
          <CardHeader title="GBS account managers" />
          <CardBody>
            <ul className="mb-4 flex flex-wrap gap-2">
              {d.managers.map((m) => (
                <li key={m.user_id}>
                  <Badge tone={m.is_primary ? "brand" : "neutral"}>{m.full_name}{m.is_primary ? " · primary" : ""}</Badge>
                </li>
              ))}
              {d.managers.length === 0 && <li className="text-sm text-warn">No account manager assigned.</li>}
            </ul>
            {isAdmin && (
              <ActionForm action={assignAccountManager.bind(null, clientId)} className="flex flex-wrap items-end gap-2">
                <Field label="Account manager">
                  <select name="user_id" className={inputClass}>
                    {d.staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </Field>
                <SubmitButton size="md" name="op" value="add">Assign</SubmitButton>
                <SubmitButton size="md" variant="ghost" name="op" value="remove">Unassign</SubmitButton>
              </ActionForm>
            )}
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Engagement limits" description="Internal controls, applied on top of each platform's own API limits — never instead of them." />
          <CardBody className="flex flex-col gap-4">
            {(["all", "instagram", "facebook", "linkedin"] as const).map((p) => {
              const l = d.limits.find((x) => x.platform === p);
              return (
                <ActionForm key={p} action={saveLimits.bind(null, clientId)} className="grid items-end gap-3 md:grid-cols-[120px_repeat(4,1fr)_auto]">
                  <input type="hidden" name="platform" value={p} />
                  <div className="pb-2 text-sm font-medium text-ink">{p === "all" ? "All platforms" : p[0].toUpperCase() + p.slice(1)}</div>
                  <Field label="Daily opportunities"><input name="daily_opportunity_limit" type="number" min={0} max={500} defaultValue={l?.daily_opportunity_limit ?? 30} disabled={!gbs} className={inputClass} /></Field>
                  <Field label="Daily published"><input name="daily_publish_limit" type="number" min={0} max={100} defaultValue={l?.daily_publish_limit ?? 5} disabled={!gbs} className={inputClass} /></Field>
                  <Field label="Minutes between"><input name="min_minutes_between_comments" type="number" min={0} max={1440} defaultValue={l?.min_minutes_between_comments ?? 10} disabled={!gbs} className={inputClass} /></Field>
                  <Field label="AI generations / month"><input name="monthly_ai_generation_limit" type="number" min={0} defaultValue={l?.monthly_ai_generation_limit ?? 2000} disabled={!gbs} className={inputClass} /></Field>
                  {gbs ? <SubmitButton size="md" variant="secondary">Save</SubmitButton> : <span />}
                </ActionForm>
              );
            })}
          </CardBody>
        </Card>

        {access.canManage && (
          <Card className="xl:col-span-2">
            <CardHeader title="Activity" description="Audit log for this client" />
            <Table>
              <thead><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Campaign</Th></tr></thead>
              <tbody>
                {d.audit.map((a, i) => (
                  <tr key={i}>
                    <Td className="whitespace-nowrap text-xs">{formatDate(a.created_at, true)}</Td>
                    <Td>{a.actor_name}</Td>
                    <Td>{AUDIT_LABELS[a.action] ?? a.action}</Td>
                    <Td className="text-xs">{a.campaign ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        {gbs && (
          <Card className="xl:col-span-2 border-bad/30">
            <CardHeader title="Client status" />
            <CardBody className="flex flex-col gap-4">
              <ActionForm action={setClientStatus.bind(null, clientId)} className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-ink-2">Current: {d.client.status}</span>
                {d.client.status !== "active" && <SubmitButton size="sm" name="status" value="active">Activate</SubmitButton>}
                {d.client.status === "active" && <SubmitButton size="sm" variant="secondary" name="status" value="paused">Pause all activity</SubmitButton>}
                {isAdmin && d.client.status !== "archived" && <SubmitButton size="sm" variant="danger" name="status" value="archived">Archive</SubmitButton>}
              </ActionForm>
              {isAdmin && d.client.status === "archived" && (
                <ActionForm action={deleteClient.bind(null, clientId)} className="flex flex-col gap-2">
                  <Notice tone="bad">Deleting permanently removes this client&apos;s accounts, tokens, comments and analytics. The audit log is kept.</Notice>
                  <div className="flex flex-wrap items-end gap-2">
                    <Field label={`Type "${d.client.name}" to confirm`}><input name="confirm_name" className={inputClass} /></Field>
                    <SubmitButton variant="danger">Delete client</SubmitButton>
                  </div>
                </ActionForm>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
