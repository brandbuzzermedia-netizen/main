import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in" };

/* eslint-disable @next/next/no-img-element */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSessionUser()) redirect("/");
  const { next } = await searchParams;
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="gbs-dots relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-ink lg:flex">
        <img src="/brand/wordmark-cream.svg" alt="Get Bee Seen" className="h-9 w-auto self-start" />
        <div className="relative max-w-lg">
          <div className="mb-8 grid h-40 w-40 place-items-center rounded-full bg-cream-disc">
            <img src="/brand/bee-yellow.svg" alt="" className="h-28 w-28" />
          </div>
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-accent">Engagement Engine</p>
          <h1 className="font-display text-[44px] font-normal leading-[1.02] text-sidebar-ink">Buzzing brands into the spotlight.</h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-sidebar-ink-2">
            Find the right conversations through official platform APIs, draft comments in each client&apos;s own voice, and publish only what your
            team and clients approve.
          </p>
        </div>
        <p className="text-xs text-sidebar-ink-2">Internal platform · Every client&apos;s data is kept separate</p>
      </div>
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/brand/badge.svg" alt="" className="h-12 w-12" />
            <img src="/brand/wordmark-green.svg" alt="Get Bee Seen" className="h-7 w-auto" />
          </div>
          <div className="rounded-[24px] border-2 border-brand bg-surface p-7 shadow-hard-lg">
            <h2 className="font-display text-[30px] font-normal leading-none text-brand">Sign in</h2>
            <p className="mt-2 text-sm text-ink-2">GBS team members and client users</p>
            <LoginForm next={next} />
          </div>
        </div>
      </div>
    </div>
  );
}
