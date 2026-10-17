import { Sidebar } from "@/components/sidebar";
import { getContext } from "@/lib/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await getContext();
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar orgName={ctx.org.name} email={ctx.email} role={ctx.role} isDemo={ctx.org.is_demo} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        {ctx.org.is_demo && (
          <div className="mb-4 rounded-lg border border-warn/30 bg-warn-soft px-4 py-2 text-sm text-warn">
            You are viewing a <strong>demo workspace</strong> with made-up clients and invoices. None of these figures are real.
          </div>
        )}
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
