import { requireSuperAdmin } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { Card, CardBody, CardHeader, Field, PageHeader, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { saveOrgSettings } from "@/app/actions/admin";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireSuperAdmin();
  const org = await withUser(user.id, (db) =>
    db.one<{ name: string; branding: Record<string, string | null>; ai_settings: { model?: string; effort?: string } }>("select name, branding, ai_settings from organizations where id = $1", [user.organizationId]),
  );
  const b = org?.branding ?? {};
  const ai = org?.ai_settings ?? {};
  return (
    <>
      <PageHeader title="Platform settings" description="Organisation-wide settings. Client-specific settings live on each client." />
      <ActionForm action={saveOrgSettings} className="flex max-w-3xl flex-col gap-6">
        <Card>
          <CardHeader title="White-label" description="Prepared for offering the platform under another brand. Logo, colour and name show in the app shell; email sender and domain are used when email delivery and custom domains are enabled." />
          <CardBody className="grid gap-4 md:grid-cols-2">
            <Field label="Brand name"><input name="brand_name" required defaultValue={b.brand_name ?? org?.name} className={inputClass} /></Field>
            <Field label="Primary colour"><input name="primary_color" type="color" defaultValue={b.primary_color ?? "#196144"} className="h-9 w-20 rounded-lg border border-line-strong" /></Field>
            <Field label="Logo URL"><input name="logo_url" type="url" defaultValue={b.logo_url ?? ""} className={inputClass} /></Field>
            <Field label="Email sender"><input name="email_sender" type="email" defaultValue={b.email_sender ?? ""} className={inputClass} /></Field>
            <Field label="Custom domain"><input name="custom_domain" defaultValue={b.custom_domain ?? ""} placeholder="engage.example.com" className={inputClass} /></Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="AI" description="Each request carries one client's context only. The model and effort apply to every client." />
          <CardBody className="grid gap-4 md:grid-cols-2">
            <Field label="Model">
              <select name="model" defaultValue={ai.model ?? "claude-opus-5-5"} className={inputClass}>
                <option value="claude-opus-5-5">Claude Opus 5.5 (best quality)</option>
                <option value="claude-sonnet-5-5">Claude Sonnet 5.5 (faster, lower cost)</option>
                <option value="claude-haiku-4-5">Claude Haiku 4.5 (lowest cost)</option>
              </select>
            </Field>
            <Field label="Effort" hint="Higher effort = more careful drafts, more tokens">
              <select name="effort" defaultValue={ai.effort ?? "medium"} className={inputClass}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>
          </CardBody>
        </Card>
        <div><SubmitButton>Save settings</SubmitButton></div>
      </ActionForm>
    </>
  );
}
