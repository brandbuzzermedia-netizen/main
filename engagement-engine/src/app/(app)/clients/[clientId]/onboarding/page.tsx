import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireClientAccess } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import type { BrandContext } from "@/lib/ai/context";
import { APPROVAL_MODE_LABELS, type ApprovalMode } from "@/lib/engine/approvals";
import { Card, CardBody, CardHeader, Field, LinkButton, Notice, PageHeader, ProgressBar, cx, inputClass, textareaClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { saveBrand } from "@/app/actions/brand";
import { saveSegment } from "@/app/actions/audience";
import { addClientUser, saveClientSettings, saveLimits, setOnboardingStep } from "@/app/actions/clients";

export const metadata = { title: "Client onboarding" };

const STEPS = [
  "Company information",
  "Industry",
  "Products & services",
  "Target audience",
  "Locations",
  "Keywords",
  "Competitors",
  "Brand voice",
  "Connect social accounts",
  "Approval users",
  "Engagement limits",
  "Complete",
];

export default async function Onboarding({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ step?: string }> }) {
  const { clientId } = await params;
  const sp = await searchParams;
  const { user, access } = await requireClientAccess(clientId);
  if (!access.canManage) notFound();
  const d = await withUser(user.id, async (db) => ({
    client: (await db.one<{ name: string; status: string; approval_mode: ApprovalMode; onboarding_step: number; done: number[] }>(
      "select name, status, approval_mode, onboarding_step, onboarding_completed_steps as done from clients where id = $1",
      [clientId],
    ))!,
    brand: await db.one<BrandContext>("select * from brand_profiles where client_id = $1", [clientId]),
    segments: (await db.one<{ n: number }>("select count(*)::int as n from audience_segments where client_id = $1", [clientId]))!.n,
    accounts: await db.query<{ platform: string; display_name: string | null }>("select platform, display_name from social_accounts where client_id = $1 and status = 'connected'", [clientId]),
    approvers: await db.query<{ full_name: string }>(
      "select u.full_name from client_users cu join users u on u.id = cu.user_id where cu.client_id = $1 and (cu.role = 'owner' or cu.can_approve)",
      [clientId],
    ),
    campaigns: (await db.one<{ n: number }>("select count(*)::int as n from campaigns where client_id = $1", [clientId]))!.n,
  }));
  const step = Math.min(12, Math.max(1, Number(sp.step) || d.client.onboarding_step || 1));
  const progress = Math.round((new Set(d.client.done).size / 12) * 100);
  const b = d.brand;
  const list = (xs?: string[]) => (xs ?? []).join(", ");

  const brandStep = (fields: ReactNode) => (
    <ActionForm action={saveBrand.bind(null, clientId)} className="flex flex-col gap-4">
      <input type="hidden" name="onboarding_step" value={step} />
      {fields}
      <Nav step={step} />
    </ActionForm>
  );

  const body: Record<number, ReactNode> = {
    1: brandStep(
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Company name"><input name="company_name" required defaultValue={b?.company_name || d.client.name} className={inputClass} /></Field>
        <Field label="Website"><input name="website" type="url" defaultValue={b?.website ?? ""} placeholder="https://" className={inputClass} /></Field>
        <div className="md:col-span-2"><Field label="What does the company do?"><textarea name="description" rows={4} defaultValue={b?.description ?? ""} className={textareaClass} /></Field></div>
      </div>,
    ),
    2: brandStep(
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Industry"><input name="industry" required defaultValue={b?.industry ?? ""} className={inputClass} /></Field>
        <Field label="Business model">
          <select name="business_model" defaultValue={b?.business_model ?? "b2b"} className={inputClass}><option value="b2b">B2B</option><option value="b2c">B2C</option><option value="both">Both</option></select>
        </Field>
        <div className="md:col-span-2"><Field label="Target market"><textarea name="target_market" rows={2} defaultValue={b?.target_market ?? ""} className={textareaClass} /></Field></div>
      </div>,
    ),
    3: brandStep(
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Products" hint="Comma or line separated"><textarea name="products" rows={3} defaultValue={list(b?.products)} className={textareaClass} /></Field>
        <Field label="Services"><textarea name="services" rows={3} defaultValue={list(b?.services)} className={textareaClass} /></Field>
        <div className="md:col-span-2"><Field label="What makes them different (USP)"><textarea name="usp" rows={2} defaultValue={b?.usp ?? ""} className={textareaClass} /></Field></div>
      </div>,
    ),
    4: (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-2">{d.segments ? `${d.segments} segment(s) defined. Add more now or later under Audiences.` : "Define who this client wants to engage with, e.g. “Architects Bangalore”."}</p>
        <ActionForm action={saveSegment.bind(null, clientId, null)} resetOnSuccess className="grid gap-3 md:grid-cols-2">
          <Field label="Segment name"><input name="name" required className={inputClass} placeholder="Architects Bangalore" /></Field>
          <Field label="Industries"><input name="industries" className={inputClass} placeholder="Architecture" /></Field>
          <Field label="Job titles"><input name="job_titles" className={inputClass} placeholder="Architect, Principal Architect, Interior Designer" /></Field>
          <Field label="Locations"><input name="locations" className={inputClass} placeholder="Bangalore" /></Field>
          <Field label="Keywords"><input name="keywords" className={inputClass} placeholder="luxury villa, interior design" /></Field>
          <Field label="Hashtags"><input name="hashtags" className={inputClass} placeholder="#architecture" /></Field>
          <div><SubmitButton variant="secondary">Add segment</SubmitButton></div>
        </ActionForm>
        <ContinueForm clientId={clientId} step={step} disabled={!d.segments} hint={!d.segments ? "Add at least one segment to continue, or skip." : undefined} />
      </div>
    ),
    5: brandStep(<Field label="Where is the client, and where are its customers?" hint="e.g. Bangalore, Mysore, Mumbai, Pune"><input name="location" defaultValue={b?.location ?? ""} className={inputClass} /></Field>),
    6: brandStep(
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Keywords"><textarea name="keywords" rows={3} defaultValue={list(b?.keywords)} className={textareaClass} placeholder="wooden doors, luxury doors, interior design" /></Field>
        <Field label="Hashtags"><textarea name="hashtags" rows={3} defaultValue={(b?.hashtags ?? []).map((h) => `#${h}`).join(", ")} className={textareaClass} /></Field>
      </div>,
    ),
    7: brandStep(<Field label="Competitors" hint="Never mentioned in comments; their own posts are excluded"><textarea name="competitors" rows={3} defaultValue={list(b?.competitors)} className={textareaClass} /></Field>),
    8: brandStep(
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Brand personality"><input name="brand_personality" defaultValue={list(b?.brand_personality)} placeholder="Professional, Technical, Insight-driven" className={inputClass} /></Field>
        <Field label="Tone"><input name="tone" defaultValue={list(b?.tone)} className={inputClass} /></Field>
        <Field label="Language"><input name="language" defaultValue={b?.language ?? "English"} className={inputClass} /></Field>
        <Field label="Preferred comment length">
          <select name="comment_length" defaultValue={b?.comment_length ?? "medium"} className={inputClass}><option value="short">Short</option><option value="medium">Medium</option><option value="long">Long</option></select>
        </Field>
        <Field label="CTA style">
          <select name="cta_style" defaultValue={b?.cta_style ?? "none"} className={inputClass}><option value="none">None</option><option value="soft">Soft</option><option value="direct">Direct</option></select>
        </Field>
        <Field label="Emoji">
          <select name="emoji_policy" defaultValue={b?.emoji_policy ?? "sparing"} className={inputClass}><option value="none">None</option><option value="sparing">Sparing</option><option value="allowed">Allowed</option></select>
        </Field>
        <Field label="Words to use"><input name="words_to_use" defaultValue={list(b?.words_to_use)} className={inputClass} /></Field>
        <Field label="Words to avoid"><input name="words_to_avoid" defaultValue={list(b?.words_to_avoid)} className={inputClass} /></Field>
        <Field label="Topics to avoid"><input name="topics_to_avoid" defaultValue={list(b?.topics_to_avoid)} className={inputClass} /></Field>
        <Field label="Claims that require approval"><input name="claims_requiring_approval" defaultValue={list(b?.claims_requiring_approval)} className={inputClass} /></Field>
      </div>,
    ),
    9: (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-2">
          {d.accounts.length ? `Connected: ${d.accounts.map((a) => `${a.platform} (${a.display_name})`).join(", ")}.` : "No accounts connected yet."} Accounts connect through each platform&apos;s official sign-in and belong only to this client.
        </p>
        <div><LinkButton href={`/clients/${clientId}/accounts`} variant="primary">Open social accounts</LinkButton></div>
        <ContinueForm clientId={clientId} step={step} />
      </div>
    ),
    10: (
      <div className="flex flex-col gap-4">
        {access.isGbsManager && (
          <ActionForm action={saveClientSettings.bind(null, clientId)} className="flex flex-col gap-2">
            <input type="hidden" name="name" value={d.client.name} />
            <input type="hidden" name="industry" value={b?.industry ?? ""} />
            {(Object.keys(APPROVAL_MODE_LABELS) as ApprovalMode[]).map((m) => (
              <label key={m} className="flex items-start gap-3 rounded-lg border border-line-strong px-3 py-2">
                <input type="radio" name="approval_mode" value={m} defaultChecked={d.client.approval_mode === m} className="mt-1" />
                <span className="text-sm"><span className="font-medium">{APPROVAL_MODE_LABELS[m].label}</span> <span className="text-xs text-ink-3">— {APPROVAL_MODE_LABELS[m].description}</span></span>
              </label>
            ))}
            <div><SubmitButton variant="secondary" size="sm">Save approval mode</SubmitButton></div>
          </ActionForm>
        )}
        <p className="text-sm text-ink-2">Approvers: {d.approvers.length ? d.approvers.map((a) => a.full_name).join(", ") : "none yet"}</p>
        {access.isGbsManager && (
          <ActionForm action={addClientUser.bind(null, clientId)} resetOnSuccess className="grid gap-3 md:grid-cols-2">
            <Field label="Name"><input name="full_name" required className={inputClass} /></Field>
            <Field label="Email"><input name="email" type="email" required className={inputClass} /></Field>
            <Field label="Role"><select name="role" className={inputClass}><option value="owner">Owner (approves)</option><option value="member">Team member</option></select></Field>
            <Field label="Initial password" hint="10+ characters; super admins only"><input name="password" type="password" minLength={10} autoComplete="new-password" className={inputClass} /></Field>
            <div><SubmitButton variant="secondary">Add approval user</SubmitButton></div>
          </ActionForm>
        )}
        {d.client.approval_mode !== "gbs" && d.approvers.length === 0 && <Notice tone="warn">This approval mode needs a client approver.</Notice>}
        <ContinueForm clientId={clientId} step={step} />
      </div>
    ),
    11: (
      <div className="flex flex-col gap-4">
        {access.isGbsManager ? (
          <ActionForm action={saveLimits.bind(null, clientId)} className="grid items-end gap-3 md:grid-cols-4">
            <input type="hidden" name="platform" value="all" />
            <Field label="Daily opportunities"><input name="daily_opportunity_limit" type="number" defaultValue={30} min={0} className={inputClass} /></Field>
            <Field label="Daily published comments"><input name="daily_publish_limit" type="number" defaultValue={5} min={0} className={inputClass} /></Field>
            <Field label="Minutes between comments"><input name="min_minutes_between_comments" type="number" defaultValue={10} min={0} className={inputClass} /></Field>
            <Field label="AI generations / month"><input name="monthly_ai_generation_limit" type="number" defaultValue={2000} min={0} className={inputClass} /></Field>
            <div><SubmitButton variant="secondary" size="sm">Save limits</SubmitButton></div>
          </ActionForm>
        ) : (
          <p className="text-sm text-ink-2">GBS sets the engagement limits for your account.</p>
        )}
        <p className="text-xs text-ink-3">These are internal controls on top of each platform&apos;s own limits.</p>
        <ContinueForm clientId={clientId} step={step} />
      </div>
    ),
    12: (
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col gap-2 text-sm">
          {STEPS.slice(0, 11).map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className={d.client.done.includes(i + 1) ? "text-good" : "text-ink-3"}>{d.client.done.includes(i + 1) ? "✓" : "○"}</span>
              <Link href={`?step=${i + 1}`} className="hover:underline">{s}</Link>
            </li>
          ))}
        </ul>
        {d.campaigns === 0 && <Notice tone="info">Next: create the first campaign to start finding opportunities.</Notice>}
        <ActionForm action={setOnboardingStep.bind(null, clientId)} className="flex flex-wrap gap-2">
          <input type="hidden" name="step" value={12} />
          <SubmitButton name="dir" value="next">{access.isGbsManager && d.client.status === "onboarding" ? "Finish and activate client" : "Finish setup"}</SubmitButton>
          <LinkButton href={`/clients/${clientId}/campaigns/new`}>Create first campaign</LinkButton>
        </ActionForm>
      </div>
    ),
  };

  return (
    <>
      <PageHeader title={`Set up ${d.client.name}`} description="A guided setup. Everything can be changed later." />
      <Card className="mb-6">
        <CardBody>
          <div className="mb-2 text-sm font-medium text-ink">Client setup</div>
          <ProgressBar value={progress} label="Client setup" />
        </CardBody>
      </Card>
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <ol className="flex gap-1 overflow-x-auto lg:flex-col">
          {STEPS.map((s, i) => (
            <li key={s} className="shrink-0">
              <Link
                href={`?step=${i + 1}`}
                aria-current={step === i + 1 ? "step" : undefined}
                className={cx("flex items-center gap-2 rounded-lg px-3 py-2 text-sm", step === i + 1 ? "bg-surface font-medium text-ink shadow-sm ring-1 ring-line" : "text-ink-2 hover:bg-surface")}
              >
                <span className={cx("tabular grid h-6 w-6 place-items-center rounded-full text-xs", d.client.done.includes(i + 1) ? "bg-good text-white" : step === i + 1 ? "bg-brand text-brand-ink" : "bg-sunken text-ink-3")}>
                  {d.client.done.includes(i + 1) ? "✓" : i + 1}
                </span>
                {s}
              </Link>
            </li>
          ))}
        </ol>
        <Card>
          <CardHeader title={`Step ${step} of 12 · ${STEPS[step - 1]}`} />
          <CardBody>{body[step]}</CardBody>
        </Card>
      </div>
    </>
  );
}

function Nav({ step }: { step: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
      {step > 1 && <LinkButton href={`?step=${step - 1}`} variant="ghost">← Back</LinkButton>}
      <SubmitButton>Save and continue →</SubmitButton>
      <Link href={`?step=${step + 1}`} className="text-xs text-ink-3 hover:underline">Skip for now</Link>
    </div>
  );
}

function ContinueForm({ clientId, step, disabled, hint }: { clientId: string; step: number; disabled?: boolean; hint?: string }) {
  return (
    <ActionForm action={setOnboardingStep.bind(null, clientId)} className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
      <input type="hidden" name="step" value={step} />
      {step > 1 && <SubmitButton variant="ghost" name="dir" value="back">← Back</SubmitButton>}
      <SubmitButton name="dir" value="next" disabled={disabled}>Continue →</SubmitButton>
      <SubmitButton variant="ghost" name="dir" value="skip">Skip for now</SubmitButton>
      {hint && <span className="text-xs text-ink-3">{hint}</span>}
    </ActionForm>
  );
}
