"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { approveDraftAction, draftAction, type DraftState } from "./actions";

export function Assistant({ slug, deals, enabled }: { slug: string; deals: { id: string; label: string }[]; enabled: boolean }) {
  const [s, draft, drafting] = useActionState<DraftState, FormData>(draftAction.bind(null, slug), {});
  const [a, approve, saving] = useActionState<DraftState, FormData>(approveDraftAction.bind(null, slug), {});
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form action={draft} className="flex flex-col gap-3">
        <Field label="Deal" name="deal_id"><Select name="deal_id">{deals.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</Select></Field>
        <Field label="Channel" name="channel"><Select name="channel" defaultValue="email"><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="linkedin">LinkedIn</option></Select></Field>
        <Field label="What is the message for?" name="purpose"><Input name="purpose" required placeholder="Follow up on the proposal sent last week" /></Field>
        {s.error && <Alert tone="warn">{s.error}</Alert>}
        <div><Button variant="company" disabled={drafting || !enabled || deals.length === 0}>{drafting ? "Drafting…" : "Draft with Claude"}</Button></div>
      </form>
      {s.draft && (
        <form action={approve} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
          <input type="hidden" name="usage_id" value={s.usageId ?? ""} /><input type="hidden" name="deal_id" value={s.dealId ?? ""} />
          <div className="text-xs font-semibold tracking-wider text-warn uppercase">AI draft · review before use</div>
          {s.draft.subject !== null && <Field label="Subject" name="subject"><Input name="subject" defaultValue={s.draft.subject} /></Field>}
          <Field label="Message" name="body"><Textarea name="body" rows={8} defaultValue={s.draft.body} /></Field>
          {s.draft.notes_for_reviewer && <Alert tone="info" title="Check before sending">{s.draft.notes_for_reviewer}</Alert>}
          {a.error && <Alert tone="danger">{a.error}</Alert>}{a.saved && <Alert tone="ok">{a.saved}</Alert>}
          <div><Button variant="company" disabled={saving}>Approve as follow-up task</Button></div>
        </form>
      )}
    </div>
  );
}
