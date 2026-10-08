import { requireUser } from "@/lib/auth/session";
import { withSystem } from "@/lib/db";
import { Card, CardBody, CardHeader, Field, PageHeader, formatDate, inputClass, timeAgo } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { ActionButton } from "@/components/client/comment-tools";
import { changePassword, saveProfile, signOutOtherSessions } from "@/app/actions/account";

export const metadata = { title: "Your account" };

export default async function AccountPage() {
  const user = await requireUser();
  // Own row and own sessions only, keyed by the signed-in user's id.
  const { me, sessions } = await withSystem(async (db) => ({
    me: (await db.one<{ full_name: string; email: string; email_notifications: boolean; created_at: Date }>(
      "select full_name, email, email_notifications, created_at from users where id = $1",
      [user.id],
    ))!,
    sessions: await db.query<{ id: string; created_at: Date; user_agent: string | null; ip: string | null }>(
      "select id, created_at, user_agent, ip from sessions where user_id = $1 and expires_at > now() order by created_at desc",
      [user.id],
    ),
  }));
  const device = (ua: string | null) =>
    !ua ? "Unknown device" : `${/iphone|android/i.test(ua) ? "Phone" : /ipad|tablet/i.test(ua) ? "Tablet" : "Computer"} · ${/edg\//i.test(ua) ? "Edge" : /chrome/i.test(ua) ? "Chrome" : /firefox/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : "Browser"}`;

  return (
    <>
      <PageHeader title="Your account" description={`${me.email} · member since ${formatDate(me.created_at)}`} />
      <div className="grid max-w-4xl gap-6">
        <Card>
          <CardHeader title="Profile" />
          <CardBody>
            <ActionForm action={saveProfile} className="flex flex-col gap-4">
              <Field label="Name" htmlFor="full_name">
                <input id="full_name" name="full_name" required defaultValue={me.full_name} className={inputClass} />
              </Field>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="email_notifications" defaultChecked={me.email_notifications} className="mt-1 accent-[var(--brand)]" />
                <span>
                  Email me important notifications
                  <span className="block text-xs text-ink-3">Approvals waiting for you, publishing failures, expired connections and daily reports. Everything also appears under Notifications.</span>
                </span>
              </label>
              <div><SubmitButton>Save profile</SubmitButton></div>
            </ActionForm>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Change password" description="At least 10 characters. Changing it signs you out everywhere else." />
          <CardBody>
            <ActionForm action={changePassword} resetOnSuccess className="grid gap-4 md:grid-cols-3">
              <Field label="Current password" htmlFor="current_password">
                <input id="current_password" name="current_password" type="password" required autoComplete="current-password" className={inputClass} />
              </Field>
              <Field label="New password" htmlFor="new_password">
                <input id="new_password" name="new_password" type="password" required minLength={10} autoComplete="new-password" className={inputClass} />
              </Field>
              <Field label="Repeat new password" htmlFor="confirm_password">
                <input id="confirm_password" name="confirm_password" type="password" required minLength={10} autoComplete="new-password" className={inputClass} />
              </Field>
              <div className="md:col-span-3"><SubmitButton>Change password</SubmitButton></div>
            </ActionForm>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Signed-in devices" actions={sessions.length > 1 && <ActionButton run={signOutOtherSessions}>Sign out other devices</ActionButton>} />
          <ul className="divide-y divide-line">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span>
                  <span className="font-medium text-ink">{device(s.user_agent)}</span>
                  {s.id === user.sessionId && <span className="ml-2 text-xs text-good">This device</span>}
                  <span className="block text-xs text-ink-3">Signed in {timeAgo(s.created_at)}{s.ip ? ` · ${s.ip}` : ""}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
