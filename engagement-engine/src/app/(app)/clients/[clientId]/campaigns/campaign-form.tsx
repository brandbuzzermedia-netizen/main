import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Field, inputClass, textareaClass } from "@/components/ui";
import { saveCampaign } from "@/app/actions/campaigns";
import { enabledPlatforms } from "@/lib/env";
import { PLATFORM_LABELS, type Platform } from "@/lib/platforms/types";

export interface CampaignValues {
  id: string;
  name: string;
  objective: string | null;
  platforms: string[];
  keywords: string[];
  hashtags: string[];
  locations: string[];
  daily_opportunity_limit: number;
  daily_publish_limit: number;
  min_score: number;
  approval_mode: string | null;
  segment_ids: string[];
  target_ids: string[];
}

export function CampaignForm({
  clientId,
  campaign,
  segments,
  targets,
  isGbs,
}: {
  clientId: string;
  campaign?: CampaignValues;
  segments: { id: string; name: string }[];
  targets: { id: string; handle: string; platform: string }[];
  isGbs: boolean;
}) {
  const platforms = enabledPlatforms().filter((p) => ["instagram", "facebook", "linkedin", "youtube"].includes(p)) as Platform[];
  return (
    <ActionForm action={saveCampaign.bind(null, clientId, campaign?.id ?? null)} className="grid gap-5 md:grid-cols-2">
      <Field label="Campaign name" htmlFor="name">
        <input id="name" name="name" required defaultValue={campaign?.name} className={inputClass} placeholder="Architect Engagement Bangalore" />
      </Field>
      <Field label="Objective (optional)" htmlFor="objective">
        <input id="objective" name="objective" defaultValue={campaign?.objective ?? ""} className={inputClass} placeholder="Build visibility with Bangalore architects" />
      </Field>
      <fieldset className="md:col-span-2">
        <legend className="mb-1.5 text-xs font-medium text-ink-2">Platforms</legend>
        <div className="flex flex-wrap gap-3">
          {platforms.map((p) => (
            <label key={p} className="flex items-center gap-2 rounded-lg border border-line-strong px-3 py-2 text-sm">
              <input type="checkbox" name="platforms" value={p} defaultChecked={campaign?.platforms.includes(p)} className="accent-[var(--brand)]" />
              {PLATFORM_LABELS[p]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="md:col-span-2">
        <legend className="mb-1.5 text-xs font-medium text-ink-2">Audience segments</legend>
        {segments.length === 0 ? (
          <p className="text-sm text-ink-3">No segments yet — create one under Audiences.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {segments.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded-lg border border-line-strong px-3 py-2 text-sm">
                <input type="checkbox" name="segments" value={s.id} defaultChecked={campaign?.segment_ids.includes(s.id)} className="accent-[var(--brand)]" />
                {s.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <Field label="Keywords" hint="Comma or line separated">
        <textarea name="keywords" rows={3} defaultValue={campaign?.keywords.join(", ")} className={textareaClass} placeholder="luxury villa, wooden door" />
      </Field>
      <Field label="Hashtags" hint="Instagram allows 30 unique hashtag searches per account per 7 days">
        <textarea name="hashtags" rows={3} defaultValue={campaign?.hashtags.map((h) => `#${h}`).join(", ")} className={textareaClass} placeholder="#villadesign" />
      </Field>
      <Field label="Locations">
        <input name="locations" defaultValue={campaign?.locations.join(", ")} className={inputClass} placeholder="Bangalore, Mysore" />
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-ink-2">Target profiles</legend>
        {targets.length === 0 ? (
          <p className="text-sm text-ink-3">None — add them under Audiences.</p>
        ) : (
          <div className="flex max-h-32 flex-col gap-1 overflow-y-auto">
            {targets.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="targets" value={t.id} defaultChecked={campaign?.target_ids.includes(t.id)} className="accent-[var(--brand)]" />@{t.handle}{" "}
                <span className="text-xs text-ink-3">{t.platform}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <Field label="Daily opportunity limit">
        <input name="daily_opportunity_limit" type="number" min={0} max={500} defaultValue={campaign?.daily_opportunity_limit ?? 30} className={inputClass} />
      </Field>
      <Field label="Daily publishing limit" hint="Internal cap on approved comments published per day">
        <input name="daily_publish_limit" type="number" min={0} max={100} defaultValue={campaign?.daily_publish_limit ?? 5} className={inputClass} />
      </Field>
      <Field label="Minimum opportunity score" hint="Discovered posts below this are skipped">
        <input name="min_score" type="number" min={0} max={100} defaultValue={campaign?.min_score ?? 55} className={inputClass} />
      </Field>
      <Field label="Approval requirement" hint={isGbs ? "Approval is always required; this only chooses who approves." : "Set by GBS."}>
        <select name="approval_mode" defaultValue={campaign?.approval_mode ?? ""} disabled={!isGbs} className={inputClass}>
          <option value="">Use client default</option>
          <option value="manual">Client approval</option>
          <option value="gbs">GBS approval</option>
          <option value="dual">GBS + client approval</option>
        </select>
      </Field>
      <div className="md:col-span-2">
        <SubmitButton pendingText="Saving…">{campaign ? "Save campaign" : "Create campaign (paused)"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
