import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Member = { id: string; user_id: string; role: string; name: string; email: string | null };

/** The company roster as the viewer may see it (RLS: members see their own company's roster). */
export async function loadMembers(supabase: SupabaseClient, orgId: string): Promise<Member[]> {
  const { data, error } = await supabase.from("memberships")
    .select("id, user_id, role, user:users(full_name, email)").eq("organization_id", orgId).order("created_at");
  if (error) throw new Error(`Could not load members: ${error.message}`);
  return ((data ?? []) as unknown as { id: string; user_id: string; role: string; user: { full_name: string | null; email: string | null } | null }[])
    .map((m) => ({ id: m.id, user_id: m.user_id, role: m.role, name: m.user?.full_name || m.user?.email || "Unknown", email: m.user?.email ?? null }));
}
