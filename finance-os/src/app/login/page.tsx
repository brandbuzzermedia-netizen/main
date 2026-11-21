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
        <div className="mb-6 text-center">
          <Image src="/logos/diwani.png" alt="Diwani Parivaar" width={240} height={160} priority className="mx-auto rounded-xl" />
          <h1 className="mt-3 font-display text-2xl">Diwani Parivaar OS</h1>
          <p className="text-sm text-muted">Private to the family group. Sign in with an approved email.</p>
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
