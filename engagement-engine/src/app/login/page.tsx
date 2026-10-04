import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSessionUser()) redirect("/");
  const { next } = await searchParams;
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-ink lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent font-black text-[#191816]">G</span>
          <span className="text-sm font-bold uppercase tracking-wide">Get Bee Seen</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight text-white">Engagement that sounds like each brand, approved by people.</h1>
          <p className="mt-4 text-sm text-sidebar-ink-2">
            Find relevant conversations through official platform APIs, draft thoughtful comments with AI, and publish only what your team and
            clients approve.
          </p>
        </div>
        <p className="text-xs text-sidebar-ink-2">Internal platform · Client data is isolated per client</p>
      </div>
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-ink-3">GBS team members and client users</p>
          <LoginForm next={next} />
        </div>
      </div>
    </div>
  );
}
