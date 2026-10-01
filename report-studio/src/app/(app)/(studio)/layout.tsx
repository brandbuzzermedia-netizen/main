import { redirect } from "next/navigation";
import { signOut } from "@/app/(app)/actions";
import { SidebarNav } from "@/components/studio/sidebar";
import { getSession } from "@/lib/data/repo";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "client_viewer") {
    return (
      <main className="bg-hex grid min-h-screen place-items-center p-7 text-center text-gbs-cream">
        <div className="max-w-md space-y-4">
          <h1 className="font-heading text-3xl font-extrabold">Client access</h1>
          <p>Your account can view reports shared with you. Shared report links arrive in a later release.</p>
          <form action={signOut}><button className="rounded-full bg-gbs-gold px-5 py-2 font-bold text-gbs-ink">Sign out</button></form>
        </div>
      </main>
    );
  }
  return (
    <div className="grid min-h-screen grid-cols-[236px_minmax(0,1fr)] max-[860px]:grid-cols-1">
      <aside className="bg-hex sticky top-0 flex h-screen flex-col gap-1.5 overflow-auto px-3.5 py-[22px] text-sidebar-foreground max-[860px]:static max-[860px]:h-auto max-[860px]:p-2.5">
        <div className="px-2 pt-1.5 pb-[18px] max-[860px]:pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-stacked-white.png" alt="Get Bee Seen" className="block w-32 max-[860px]:w-20" />
        </div>
        <SidebarNav />
        <div className="flex-1 max-[860px]:hidden" />
        <div className="space-y-3 border-t border-gbs-cream/18 p-2.5 text-xs text-sidebar-muted max-[860px]:hidden">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/bee.png" alt="" className="h-[34px] w-auto" />
            <span>Making brands impossible to ignore.</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate" title={session.email}>{session.name}</span>
            <form action={signOut}><button className="font-semibold text-sidebar-foreground underline-offset-2 hover:underline">Sign out</button></form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-[34px] pt-7 pb-[60px] max-[860px]:px-3.5 max-[860px]:pt-[18px]">
        {session.mode === "demo" ? (
          <p className="mb-4 rounded-2xl border border-warn bg-muted px-3.5 py-2 text-[13px]">
            <b>Demo mode.</b> Supabase is not configured, so the studio runs on the seed fixture and changes are kept in memory until the server restarts.
          </p>
        ) : null}
        {children}
      </main>
    </div>
  );
}
