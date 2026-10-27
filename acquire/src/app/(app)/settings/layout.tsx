import { getContext } from "@/lib/auth";
import { SettingsTabs } from "./tabs";

export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const ctx = await getContext();
  const tabs = [
    { href: "/settings", label: "Workspace" },
    { href: "/settings/team", label: "Team" },
    { href: "/settings/pipeline", label: "Pipeline" },
    { href: "/settings/sources", label: "Lead sources" },
    { href: "/settings/forms", label: "Lead forms" },
    ...(ctx.can.viewAudit ? [{ href: "/settings/audit", label: "Audit log" }] : []),
  ];
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Settings</h1>
      <SettingsTabs tabs={tabs} />
      {children}
    </>
  );
}
