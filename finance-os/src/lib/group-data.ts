import "server-only";
import type { GroupContext, Permission, Company } from "@/lib/workspace";

/** Companies in the group where the viewer holds a permission (explicit membership only). */
export function companiesWith(g: GroupContext, p: Permission): Company[] {
  return g.registry.filter((c) => g.access.get(c.id)?.permissions.has(p));
}

export function nameMap(cs: Company[]) {
  return new Map(cs.map((c) => [c.id, c.short_name ?? c.name]));
}
