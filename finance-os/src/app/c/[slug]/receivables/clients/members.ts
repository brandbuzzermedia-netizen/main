import "server-only";
import type { AppContext } from "@/lib/auth";

export async function listMembers(ctx: AppContext) {
  const { data } = await ctx.supabase
    .from("memberships")
    .select("user_id, role, user:users(email, full_name)")
    .eq("organization_id", ctx.org.id);
  return ((data ?? []) as unknown as { user_id: string; role: string; user: { email: string | null; full_name: string | null } | null }[]).map(
    (m) => ({ id: m.user_id, label: `${m.user?.full_name || m.user?.email || m.user_id} (${m.role.replace("_", " ")})` }),
  );
}
