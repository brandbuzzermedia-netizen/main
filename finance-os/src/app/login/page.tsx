import Image from "next/image";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const nextPath = typeof next === "string" ? next : "/";
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <Image src="/bee.svg" alt="" width={40} height={40} priority />
          <div>
            <h1 className="text-xl font-semibold">GBS Finance OS</h1>
            <p className="text-sm text-muted">Collections and cash flow for Get Bee Seen</p>
          </div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-6">
          {error === "link" && (
            <p className="mb-4 text-sm text-danger">That sign-in link is invalid or has expired. Request a new one.</p>
          )}
          <LoginForm next={nextPath} />
        </div>
      </div>
    </main>
  );
}
