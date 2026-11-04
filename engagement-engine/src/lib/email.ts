/** Transactional email through Resend's HTTP API. Disabled unless RESEND_API_KEY is set. */
export interface OutgoingEmail {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailSender = (m: OutgoingEmail) => Promise<void>;

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export const resendSender: EmailSender = async (m) => {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: m.from, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Email provider returned ${res.status}`);
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
