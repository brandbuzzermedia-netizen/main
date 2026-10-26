import { Sidebar } from "@/components/sidebar";
import { OrgSwitcher } from "@/components/org-switcher";
import { getContext } from "@/lib/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await getContext();
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar
        orgName={ctx.org.name}
        email={ctx.email}
        role={ctx.role}
        isDemo={ctx.org.is_demo}
        isPlatformAdmin={ctx.isPlatformAdmin}
        switcher={ctx.organizations.length > 1 ? <OrgSwitcher current={ctx.org.id} organizations={ctx.organizations} /> : undefined}
      />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        {ctx.org.is_demo && (
          <div className="mb-4 rounded-lg border border-warn/30 bg-warn-soft px-4 py-2 text-sm text-warn">
            You are viewing a <strong>demo workspace</strong> with made-up leads. None of these people or figures are real.
          </div>
        )}
        {ctx.org.status === "suspended" && (
          <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-2 text-sm text-danger">
            This organization is suspended. Records are read-only. Contact support to restore access.
          </div>
        )}
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
