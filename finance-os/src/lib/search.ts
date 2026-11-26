import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Hit = { kind: string; title: string; sub?: string; org: string; href: string };

/** Drops characters that are LIKE wildcards or PostgREST filter syntax, so a query is matched literally. */
export const likeTerm = (q: string) => `%${q.replace(/[\\%_,()."*:]/g, " ").trim()}%`;

/** Searches records RLS lets this user read in the given companies. Each table query is permission-gated by the database. */
export async function searchRecords(sb: SupabaseClient, orgs: { id: string; slug: string }[], q: string): Promise<Hit[]> {
  const term = q.trim();
  if (likeTerm(term).length < 4 || !orgs.length) return [];
  const ids = orgs.map((o) => o.id);
  const slug = new Map(orgs.map((o) => [o.id, o.slug]));
  const t = likeTerm(term);
  const [deals, contacts, clients, tasks, docs] = await Promise.all([
    sb.from("deals").select("id, title, account_name, organization_id").in("organization_id", ids).or(`title.ilike.${t},account_name.ilike.${t}`).limit(15),
    sb.from("contacts").select("id, full_name, company_name, organization_id").in("organization_id", ids).or(`full_name.ilike.${t},company_name.ilike.${t}`).limit(15),
    sb.from("clients").select("id, legal_name, trading_name, organization_id").in("organization_id", ids).or(`legal_name.ilike.${t},trading_name.ilike.${t}`).limit(15),
    sb.from("tasks").select("id, title, organization_id").in("organization_id", ids).ilike("title", t).limit(15),
    sb.from("documents").select("id, file_name, organization_id").in("organization_id", ids).ilike("file_name", t).limit(15),
  ]);
  const out: Hit[] = [];
  const s = (o: string) => slug.get(o)!;
  for (const d of (deals.data ?? []) as { id: string; title: string; account_name: string | null; organization_id: string }[])
    out.push({ kind: "Deal", title: d.title, sub: d.account_name ?? undefined, org: d.organization_id, href: `/c/${s(d.organization_id)}/pipeline?deal=${d.id}` });
  for (const c of (contacts.data ?? []) as { id: string; full_name: string; company_name: string | null; organization_id: string }[])
    out.push({ kind: "Lead", title: c.full_name, sub: c.company_name ?? undefined, org: c.organization_id, href: `/c/${s(c.organization_id)}/leads` });
  for (const c of (clients.data ?? []) as { id: string; legal_name: string; trading_name: string | null; organization_id: string }[])
    out.push({ kind: "Customer", title: c.trading_name ?? c.legal_name, sub: c.trading_name ? c.legal_name : undefined, org: c.organization_id, href: `/c/${s(c.organization_id)}/customers` });
  for (const x of (tasks.data ?? []) as { id: string; title: string; organization_id: string }[])
    out.push({ kind: "Task", title: x.title, org: x.organization_id, href: `/c/${s(x.organization_id)}/meetings` });
  for (const x of (docs.data ?? []) as { id: string; file_name: string; organization_id: string }[])
    out.push({ kind: "Document", title: x.file_name, org: x.organization_id, href: `/c/${s(x.organization_id)}/vault` });
  return out;
}
