import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublicForm } from "@/lib/forms";

export const metadata: Metadata = { title: "Contact", robots: { index: false } };

const ERRORS: Record<string, string> = {
  unavailable: "We could not take your details right now. Please try again later.",
  rate_limited: "Too many submissions from your connection. Please try again in a few minutes.",
  invalid: "Something was wrong with the form. Please try again.",
};

/** Hosted lead form: a link you can use in ads, social posts and QR codes. */
export default async function HostedFormPage({ params, searchParams }: PageProps<"/f/[key]">) {
  const { key } = await params;
  const { done, error } = await searchParams;
  const form = await loadPublicForm(key);
  if (!form) notFound();
  const err = typeof error === "string" ? (ERRORS[error] ?? error.slice(0, 200)) : null;
  const input = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";
  return (
    <main className="flex min-h-screen items-start justify-center px-4 py-10 sm:items-center">
      <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{form.org.name}</p>
        <h1 className="mt-1 text-xl font-semibold">{form.headline}</h1>
        {form.intro && <p className="mt-2 text-sm text-muted">{form.intro}</p>}
        {done === "1" ? (
          <p role="status" className="mt-6 rounded-lg bg-ok-soft px-4 py-3 text-sm text-ok">{form.thank_you}</p>
        ) : (
          <form action={`/api/forms/${key}`} method="post" className="mt-6 flex flex-col gap-4">
            {err && <p role="alert" className="rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger">{err}</p>}
            <label className="flex flex-col gap-1 text-sm font-medium">Name<input name="full_name" required maxLength={200} autoComplete="name" className={input} /></label>
            <label className="flex flex-col gap-1 text-sm font-medium">Email<input name="email" type="email" autoComplete="email" className={input} /></label>
            <label className="flex flex-col gap-1 text-sm font-medium">Phone<input name="phone" type="tel" autoComplete="tel" className={input} /></label>
            {form.ask_location && <label className="flex flex-col gap-1 text-sm font-medium">Preferred area<input name="preferred_location" maxLength={200} className={input} /></label>}
            {form.ask_budget && <label className="flex flex-col gap-1 text-sm font-medium">Budget ({form.org.default_currency})<input name="budget" inputMode="decimal" placeholder="e.g. 500k" className={input} /></label>}
            <label className="flex flex-col gap-1 text-sm font-medium">Anything else?<textarea name="message" rows={3} maxLength={2000} className={input} /></label>
            {/* Honeypot: hidden from people, filled by bots. */}
            <div aria-hidden="true" style={{ position: "absolute", left: "-10000px" }}><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
            {[["consent_email", form.consent_email], ["consent_sms", form.consent_sms], ["consent_call", form.consent_call]].filter(([, t]) => t).map(([name, text]) => (
              <label key={name} className="flex items-start gap-2 text-sm"><input type="checkbox" name={name!} className="mt-0.5 size-4" /><span>{text}</span></label>
            ))}
            <p className="text-xs text-muted">
              Ticking a box is optional and not a condition of any purchase. You can withdraw consent at any time.
              {form.privacy_url && <> See our <a href={form.privacy_url} className="underline" rel="noopener noreferrer" target="_blank">privacy notice</a>.</>}
            </p>
            <button className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-ink">Send</button>
          </form>
        )}
      </div>
    </main>
  );
}
