import type { Metadata } from "next";
import { SignInForm } from "@/components/studio/sign-in-form";
import { demoAllowed } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const demo = demoAllowed();
  return (
    <main className="bg-hex grid min-h-screen place-items-center p-7">
      <div className="grid w-full max-w-[420px] justify-items-center gap-[22px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-stacked-white.png" alt="Get Bee Seen" className="w-[170px]" />
        <SignInForm next={next ?? "/"} demo={demo} />
        <p className="text-center text-xs text-gbs-cream/80">
          Making brands impossible to ignore.
          {demo ? (
            <>
              <br />
              Demo mode: Supabase is not configured, so any details work.
            </>
          ) : null}
        </p>
      </div>
    </main>
  );
}
