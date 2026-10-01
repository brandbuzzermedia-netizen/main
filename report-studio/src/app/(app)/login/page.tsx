import type { Metadata } from "next";
import { SignInForm } from "@/components/studio/sign-in-form";
import { signInOpen } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const open = signInOpen();
  return (
    <main className="bg-hex grid min-h-screen place-items-center p-7">
      <div className="grid w-full max-w-[420px] justify-items-center gap-[22px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-stacked-white.png" alt="Get Bee Seen" className="w-[170px]" />
        <SignInForm next={next ?? "/"} open={open} />
        <p className="text-center text-xs text-gbs-cream/80">
          Making brands impossible to ignore.
          {open ? (
            <>
              <br />
              No studio password is set, so any password works (development only).
            </>
          ) : null}
        </p>
      </div>
    </main>
  );
}
