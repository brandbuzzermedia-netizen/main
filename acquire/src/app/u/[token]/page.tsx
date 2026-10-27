import type { Metadata } from "next";
import { unsubscribe, unsubscribeTarget } from "@/lib/unsubscribe";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

export default async function UnsubscribePage({ params, searchParams }: PageProps<"/u/[token]">) {
  const { token } = await params;
  const { done } = await searchParams;
  const target = await unsubscribeTarget(token);

  async function confirm() {
    "use server";
    await unsubscribe(token);
    const { redirect } = await import("next/navigation");
    redirect(`/u/${encodeURIComponent(token)}?done=1`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 text-center">
        {!target.valid ? (
          <>
            <h1 className="text-lg font-semibold">This link is not valid</h1>
            <p className="mt-2 text-sm text-muted">Reply to the email and ask to be removed, and the sender must stop.</p>
          </>
        ) : done === "1" ? (
          <>
            <h1 className="text-lg font-semibold">You are unsubscribed</h1>
            <p className="mt-2 text-sm text-muted">{target.orgName} will not send you marketing email again.</p>
          </>
        ) : (
          <form action={confirm}>
            <h1 className="text-lg font-semibold">Unsubscribe from {target.orgName}?</h1>
            <p className="mt-2 mb-5 text-sm text-muted">You will stop receiving marketing email from them.</p>
            <button className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-ink">Unsubscribe</button>
          </form>
        )}
      </div>
    </main>
  );
}
