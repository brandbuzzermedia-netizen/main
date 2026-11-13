import type { Metadata } from "next";
import { getGroupContext, ROLE_LABELS } from "@/lib/workspace";
import { dpGroupNav } from "@/lib/dp-nav";
import { groupApprovals, wsOptions } from "@/lib/dp-chrome";
import { groupTheme } from "@/components/dp/theme";
import { DemoBanner, DpShell } from "@/components/dp/shell";

export const metadata: Metadata = { title: { default: "Command Centre", template: "%s · Diwani Parivaar OS" } };

/** Group Command Centre frame. Requires a group membership; company figures still need company membership. */
export default async function GroupLayout({ children }: LayoutProps<"/group">) {
  const g = await getGroupContext();
  const { data } = await g.supabase.from("family_groups").select("disabled_modules").eq("id", g.group.id).maybeSingle();
  const approvals = await groupApprovals(g);
  return (
    <DpShell theme={groupTheme(g.group.name)} wsId={`group-${g.group.id}`} homeHref="/group"
      nav={dpGroupNav((data?.disabled_modules as string[] | undefined) ?? [], g.group.role === "group_owner", approvals)}
      stop={null}
      note={g.group.is_demo ? "Demo data only. Never mixed with production." : "Totals include only companies you are a member of."}
      switcher={{ options: wsOptions(g.group.name, g.memberships), current: "group" }}
      search={{ placeholder: `Search in ${g.group.name} only…`, action: "/group/search" }}
      bell={{ href: "/group/automation", count: approvals }}
      user={{ initials: g.initials, name: g.displayName, role: g.group.role === "group_owner" ? "Company owner" : ROLE_LABELS[g.group.role] }}
      banner={g.group.is_demo ? <DemoBanner /> : null}>
      {children}
    </DpShell>
  );
}
