import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getWorkspaceUser, homePath } from "@/lib/workspace";
import { isDevelopment } from "@/lib/env";
import { CreateGroupForm } from "@/app/group/forms";

export const metadata: Metadata = { title: "Set up" };

export default async function OnboardingPage() {
  const u = await getWorkspaceUser();
  if (u.groups.length) redirect(await homePath());
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-7">
        {/* eslint-disable-next-line @next/next/no-img-element -- small local brand asset */}
        <img src="/logos/diwani.png" alt="Diwani Parivaar" className="mx-auto mb-4 h-28 rounded-xl" />
        <h1 className="font-display text-2xl">Set up Diwani Parivaar OS</h1>
        <p className="mt-1 mb-6 text-sm text-muted">
          Signed in as {u.email}. {u.memberships.length
            ? "You already belong to a company workspace. Create the family group to bring it into the Command Centre."
            : "Create the family group first. If you were invited to a company, ask its owner to add you instead."}
        </p>
        <CreateGroupForm showDemo={isDevelopment} />
      </div>
    </main>
  );
}
