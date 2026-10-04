import { requireSuperAdmin } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { Card, CardBody, Field, PageHeader, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { createClient } from "@/app/actions/clients";

export const metadata = { title: "New client" };

export default async function NewClientPage() {
  const user = await requireSuperAdmin();
  const managers = await withUser(user.id, (db) =>
    db.query<{ id: string; full_name: string }>(`select id, full_name from users where platform_role = 'account_manager' and status = 'active' order by full_name`),
  );
  return (
    <>
      <PageHeader title="New client" description="Create the client workspace. The onboarding wizard opens next." />
      <Card className="max-w-xl">
        <CardBody>
          <ActionForm action={createClient} className="flex flex-col gap-4">
            <Field label="Client name" htmlFor="name">
              <input id="name" name="name" required minLength={2} maxLength={120} className={inputClass} placeholder="e.g. Wudgres" />
            </Field>
            <Field label="Industry" htmlFor="industry">
              <input id="industry" name="industry" maxLength={120} className={inputClass} placeholder="e.g. Luxury doors" />
            </Field>
            <Field label="Account manager" htmlFor="am" hint="Account managers only see clients they're assigned to.">
              <select id="am" name="account_manager_id" className={inputClass}>
                <option value="">Assign later</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </Field>
            <div>
              <SubmitButton pendingText="Creating…">Create and start onboarding</SubmitButton>
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
