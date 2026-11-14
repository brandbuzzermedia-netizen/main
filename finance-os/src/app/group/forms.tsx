"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { BUSINESS_MODELS, CONSOLIDATION, LIFECYCLE, MODULES, OWNERSHIP_TYPES } from "@/domain/registry";
import {
  addCompanyAction, addGroupMemberAction, attachLegacyAction, createDemoGroupAction, createFromTemplatesAction, createGroupAction, type GroupFormState,
} from "./actions";

function Feedback({ s }: { s: GroupFormState }) {
  return s.error ? <Alert tone="danger">{s.error}</Alert> : s.ok ? <Alert tone="ok">{s.ok}</Alert> : null;
}

export function TemplatesForm({ templates }: { templates: { slug: string; name: string; ownership: string; consolidation: string; exists: boolean }[] }) {
  const [s, action, pending] = useActionState<GroupFormState, FormData>(createFromTemplatesAction, {});
  const pendingCount = templates.filter((t) => !t.exists).length;
  return (
    <form action={action} className="flex flex-col gap-3">
      <ul className="grid gap-2 sm:grid-cols-2">
        {templates.map((t) => (
          <li key={t.slug}>
            <label className="flex gap-3 rounded-lg border border-line px-3 py-2.5 text-sm has-[:disabled]:opacity-60">
              <input type="checkbox" name="template" value={t.slug} defaultChecked={!t.exists} disabled={t.exists} className="mt-1" />
              <span><span className="font-semibold">{t.name}</span>{t.exists && " · set up"}<br /><span className="text-xs text-muted">{t.ownership} · {t.consolidation}</span></span>
            </label>
          </li>
        ))}
      </ul>
      <Feedback s={s} />
      {pendingCount > 0 && <div><Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create selected workspaces"}</Button></div>}
    </form>
  );
}

export function AddCompanyForm() {
  const [s, action, pending] = useActionState<GroupFormState, FormData>(addCompanyAction, {});
  const f = s.fields ?? {};
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Business name" name="name" error={f.name}><Input name="name" required /></Field>
      <Field label="Address (slug)" name="slug" hint="Used in links: /c/your-slug" error={f.slug}><Input name="slug" required pattern="[a-z0-9][a-z0-9-]{1,47}" /></Field>
      <Field label="Ownership" name="ownership_type" error={f.ownership_type}>
        <Select name="ownership_type" defaultValue="unconfigured">{Object.entries(OWNERSHIP_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      </Field>
      <Field label="Group totals" name="consolidation" hint="Only “consolidated” adds into group totals." error={f.consolidation}>
        <Select name="consolidation" defaultValue="needs_confirmation">{Object.entries(CONSOLIDATION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      </Field>
      <Field label="Business model" name="business_model">
        <Select name="business_model" defaultValue="general">{Object.entries(BUSINESS_MODELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      </Field>
      <Field label="Status" name="lifecycle_status">
        <Select name="lifecycle_status" defaultValue="setup">{Object.entries(LIFECYCLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      </Field>
      <Field label="Owner (as described)" name="owner_label" hint="Descriptive only. Access is granted separately."><Input name="owner_label" /></Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 text-sm font-medium">Modules</legend>
        <div className="flex flex-wrap gap-2">
          {MODULES.filter((m) => !["home", "team", "settings"].includes(m.key)).map((m) => (
            <label key={m.key} className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-sm">
              <input type="checkbox" name="modules" value={m.key} defaultChecked={["pipeline", "meetings", "tasks", "finance"].includes(m.key)} />{m.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-3 sm:col-span-2"><Feedback s={s} /><div><Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add business"}</Button></div></div>
    </form>
  );
}

export function AttachForm({ orgs, templates }: { orgs: { id: string; name: string }[]; templates: { slug: string; name: string }[] }) {
  const [s, action, pending] = useActionState<GroupFormState, FormData>(attachLegacyAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field label="Existing workspace" name="org_id"><Select name="org_id">{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
      <Field label="It is" name="template"><Select name="template" defaultValue="gbs">{templates.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}</Select></Field>
      <Button type="submit" disabled={pending}>{pending ? "Attaching…" : "Attach to group"}</Button>
      <div className="sm:col-span-3"><Feedback s={s} /></div>
    </form>
  );
}

export function GroupMemberForm() {
  const [s, action, pending] = useActionState<GroupFormState, FormData>(addGroupMemberAction, {});
  const f = s.fields ?? {};
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
      <Field label="Email" name="email" error={f.email}><Input type="email" name="email" required /></Field>
      <Field label="Group role" name="role">
        <Select name="role" defaultValue="family_owner">
          <option value="family_owner">Family owner</option><option value="group_viewer">Group viewer</option><option value="group_owner">Group owner (super admin)</option>
        </Select>
      </Field>
      <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add"}</Button>
      <div className="sm:col-span-3"><Feedback s={s} /></div>
    </form>
  );
}

export function CreateGroupForm({ showDemo }: { showDemo: boolean }) {
  const [s, action, pending] = useActionState<GroupFormState, FormData>(createGroupAction, {});
  const [d, demo, demoPending] = useActionState<GroupFormState, FormData>(() => createDemoGroupAction(), {});
  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        <Field label="Family group name" name="name" hint="You become the group owner. Companies are added next.">
          <Input name="name" defaultValue="Diwani Parivaar" required />
        </Field>
        <Feedback s={s} />
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create group"}</Button>
      </form>
      {showDemo && (
        <form action={demo} className="border-t border-line pt-5">
          <p className="mb-3 text-sm text-muted">Development only: a separate demo group with every workspace and clearly labelled, made-up deals and invoices.</p>
          <Feedback s={d} />
          <Button type="submit" variant="secondary" disabled={demoPending}>{demoPending ? "Creating demo…" : "Create demo group"}</Button>
        </form>
      )}
    </div>
  );
}
