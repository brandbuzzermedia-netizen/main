import type { Metadata } from "next";
import { getUser } from "@/lib/auth";
import { isDevelopment } from "@/lib/env";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your workspace" };

export default async function OnboardingPage() {
  const { email } = await getUser();
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6">
        <h1 className="text-xl font-semibold">Set up your workspace</h1>
        <p className="mt-1 mb-6 text-sm text-muted">Signed in as {email}. You are not a member of any workspace yet. If a colleague invited you, ask them to check the email they used.</p>
        <OnboardingForm showDemo={isDevelopment} />
      </div>
    </main>
  );
}
