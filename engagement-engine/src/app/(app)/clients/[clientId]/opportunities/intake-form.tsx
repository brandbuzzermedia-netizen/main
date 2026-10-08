"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Field, inputClass, textareaClass } from "@/components/ui";
import { addOpportunity } from "@/app/actions/engagement";

export function ManualIntakeForm({ clientId, campaigns }: { clientId: string; campaigns: { id: string; name: string; platforms: string[] }[] }) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const platforms = campaigns.find((c) => c.id === campaignId)?.platforms ?? [];
  if (!campaigns.length) return <p className="text-sm text-ink-3">Create a campaign first.</p>;
  return (
    <ActionForm
      action={addOpportunity.bind(null, clientId)}
      resetOnSuccess
      onSuccess={(r) => r?.data?.id && router.push(`/clients/${clientId}/opportunities/${r.data.id}`)}
      className="flex flex-col gap-3"
    >
      <Field label="Campaign">
        <select name="campaign_id" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={inputClass}>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Platform">
        <select name="platform" className={inputClass}>
          {platforms.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Post URL">
        <input name="url" type="url" required className={inputClass} placeholder="https://…" />
      </Field>
      <Field label="Post text">
        <textarea name="content" required rows={4} className={textareaClass} placeholder="Paste what the post says" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Author handle">
          <input name="author_handle" className={inputClass} placeholder="@handle" />
        </Field>
        <Field label="Followers">
          <input name="author_followers" type="number" min={0} className={inputClass} />
        </Field>
      </div>
      <Field label="Author bio / title" hint="Helps audience matching, e.g. 'Principal Architect, Bangalore'">
        <input name="author_bio" className={inputClass} />
      </Field>
      <SubmitButton pendingText="Scoring…">Add and score</SubmitButton>
    </ActionForm>
  );
}
