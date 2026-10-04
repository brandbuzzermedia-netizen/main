import type { DbRunner } from "@/lib/db";
import { escapeHtml, type EmailSender } from "@/lib/email";
import type { NotificationKind } from "./notify";

/** Kinds worth an email. Everything else stays in-app only. */
export const EMAIL_KINDS: NotificationKind[] = [
  "approval_required",
  "publishing_failed",
  "oauth_expired",
  "integration_disconnected",
  "manual_action_required",
  "daily_limit_reached",
  "daily_report",
];

interface Row {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  email: string;
  full_name: string;
  wants_email: boolean;
  active: boolean;
  client_name: string | null;
  brand_name: string | null;
  primary_color: string | null;
  email_sender: string | null;
}

/**
 * Emails pending notifications, each at most once. Rows are claimed with SKIP LOCKED so
 * several workers can run. Each email carries exactly one notification, which belongs to
 * one client and was addressed to this user by notifyClient, so nothing crosses clients.
 */
export async function processEmailOutbox(system: DbRunner, send: EmailSender, opts: { limit?: number; appUrl?: string; from?: string } = {}) {
  const appUrl = (opts.appUrl ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return system(async (db) => {
    const rows = await db.query<Row>(
      `select n.id, n.kind, n.title, n.body, n.link, u.email, u.full_name, u.email_notifications as wants_email,
              u.status = 'active' as active, c.name as client_name,
              o.branding->>'brand_name' as brand_name, o.branding->>'primary_color' as primary_color, o.branding->>'email_sender' as email_sender
       from notifications n
       join users u on u.id = n.user_id
       join organizations o on o.id = n.organization_id
       left join clients c on c.id = n.client_id
       where n.email_status is null and n.created_at > now() - interval '2 days'
       order by n.created_at
       limit $1
       for update of n skip locked`,
      [opts.limit ?? 50],
    );
    const counts = { sent: 0, skipped: 0, failed: 0 };
    for (const r of rows) {
      let status: "sent" | "skipped" | "failed" = "skipped";
      if (r.active && r.wants_email && EMAIL_KINDS.includes(r.kind)) {
        const from = opts.from ?? process.env.EMAIL_FROM ?? (r.email_sender ? `${r.brand_name ?? "GBS"} <${r.email_sender}>` : null);
        if (!from) {
          status = "failed";
        } else {
          try {
            await send(render(r, appUrl, from));
            status = "sent";
          } catch {
            status = "failed";
          }
        }
      }
      counts[status]++;
      await db.query(`update notifications set email_status = $2, emailed_at = case when $2 = 'sent' then now() end where id = $1`, [r.id, status]);
    }
    return counts;
  });
}

export function render(r: Pick<Row, "title" | "body" | "link" | "email" | "full_name" | "client_name" | "brand_name" | "primary_color">, appUrl: string, from: string) {
  const brand = r.brand_name ?? "Get Bee Seen";
  const color = /^#[0-9a-f]{6}$/i.test(r.primary_color ?? "") ? r.primary_color! : "#196144";
  const url = r.link && r.link.startsWith("/") ? `${appUrl}${r.link}` : `${appUrl}/notifications`;
  const subject = r.title.slice(0, 180);
  const text = [`Hi ${r.full_name},`, "", r.title, r.body ?? "", "", `Open: ${url}`, "", `${brand} Engagement Engine`].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f6f4ee;font-family:Arial,Helvetica,sans-serif;color:#191816">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e4e0d5;border-radius:10px" cellpadding="0" cellspacing="0">
<tr><td style="background:${color};color:#ffffff;padding:14px 20px;border-radius:10px 10px 0 0;font-weight:bold;font-size:14px">${escapeHtml(brand)}${r.client_name ? ` · ${escapeHtml(r.client_name)}` : ""}</td></tr>
<tr><td style="padding:20px">
<p style="margin:0 0 12px;font-size:14px;color:#4f4c45">Hi ${escapeHtml(r.full_name)},</p>
<p style="margin:0 0 8px;font-size:16px;font-weight:bold">${escapeHtml(r.title)}</p>
${r.body ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#4f4c45;white-space:pre-line">${escapeHtml(r.body)}</p>` : ""}
<a href="${escapeHtml(url)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:bold">Open in Engagement Engine</a>
</td></tr>
<tr><td style="padding:14px 20px;border-top:1px solid #e4e0d5;font-size:12px;color:#7c786e">You get these because email notifications are on in your account. Turn them off under Your account.</td></tr>
</table></td></tr></table></body></html>`;
  return { to: r.email, from, subject, html, text };
}
