import type { CompanyContext } from "@/lib/workspace";
import type { Member } from "@/lib/people";
import { addDays, todayInBusinessTz } from "@/domain/dates";
import { financialYear } from "@/domain/periods";
import { formatShort } from "@/domain/money";
import { C } from "./theme";
import { label } from "./ui";
import { BadgeRow } from "./activity";
import { badgesFor, loadPersonStats } from "@/lib/activity";

const initials = (n: string) => n.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join("");

/** One team, one goal (More of Us OS): each person's month against their target, and how they are working. */
export async function TeamTargets({ ctx, members }: { ctx: CompanyContext; members: Member[] }) {
  const personStats = await loadPersonStats(ctx.supabase, [ctx.company.id], members.map((m) => m.user_id), ctx.company.fy_start_month);
  const today = todayInBusinessTz();
  const month = `${today.slice(0, 7)}-01T00:00:00+05:30`;
  const fy = financialYear(today, ctx.company.fy_start_month);
  const fyStart = `${fy.start}T00:00:00+05:30`;
  const [{ data: deals }, { data: meets }, { data: tasks }, { data: targets }, { data: co }] = await Promise.all([
    ctx.supabase.from("deals").select("owner_id, value_minor, closed_at, stage:pipeline_stages(kind)").eq("organization_id", ctx.company.id).limit(10000),
    ctx.supabase.from("meetings").select("owner_id").eq("organization_id", ctx.company.id).gte("starts_at", `${addDays(today, -7)}T00:00:00+05:30`).limit(5000),
    ctx.supabase.from("tasks").select("assignee_id").eq("organization_id", ctx.company.id).in("status", ["open", "in_progress"]).limit(10000),
    ctx.supabase.from("member_targets").select("user_id, monthly_target_minor").eq("organization_id", ctx.company.id),
    ctx.supabase.from("company_targets").select("monthly_target_minor").eq("organization_id", ctx.company.id).maybeSingle(),
  ]);
  const D = ((deals ?? []) as unknown as { owner_id: string | null; value_minor: number; closed_at: string | null; stage: { kind: string } | null }[]);
  const tgt = new Map(((targets ?? []) as { user_id: string; monthly_target_minor: number }[]).map((t) => [t.user_id, Number(t.monthly_target_minor)]));
  const sum = (xs: typeof D) => xs.reduce((s, x) => s + Number(x.value_minor), 0);
  const wonMonth = D.filter((x) => x.stage?.kind === "won" && x.closed_at && x.closed_at >= month);
  const companyTarget = Number(co?.monthly_target_minor ?? 0);
  const box = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, padding: "18px 20px" } as const;
  return (
    <section aria-label="Team and targets" style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 14, color: C.body, marginBottom: 14 }}>
        <b>{formatShort(sum(wonMonth))}</b> won this month{companyTarget ? <> against a <b>{formatShort(companyTarget)}</b> target</> : ""} · set targets in <a href={`/c/${ctx.company.slug}/settings#sales`} style={{ color: C.ink, fontWeight: 600 }}>Settings</a>
      </div>
      <div className="dp-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
        {members.map((m) => {
          const mine = D.filter((x) => x.owner_id === m.user_id);
          const won = mine.filter((x) => x.stage?.kind === "won" && x.closed_at && x.closed_at >= month);
          const fyWon = mine.filter((x) => x.stage?.kind === "won" && x.closed_at && x.closed_at >= fyStart);
          const fyLost = mine.filter((x) => x.stage?.kind === "lost" && x.closed_at && x.closed_at >= fyStart);
          const open = mine.filter((x) => !x.closed_at && x.stage?.kind !== "won" && x.stage?.kind !== "lost");
          const target = tgt.get(m.user_id) ?? 0;
          const pct = target ? Math.min(100, Math.round((sum(won) / target) * 100)) : 0;
          const stat = (l: string, v: string | number) => <div><div style={label}>{l}</div><div style={{ fontFamily: "var(--font-tight)", fontWeight: 800, fontSize: 20, marginTop: 4 }}>{v}</div></div>;
          return (
            <article key={m.user_id} style={box}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ width: 40, height: 40, borderRadius: "50%", background: C.ink, color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13 }}>{initials(m.name)}</span>
                <div style={{ minWidth: 0 }}><div title={m.name} style={{ fontFamily: "var(--font-tight)", fontWeight: 800, fontSize: 18, letterSpacing: "-.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div><div style={{ fontSize: 12.5, color: C.muted }}>{target ? `Target ${formatShort(target)}/month` : "No target set"}</div></div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, margin: "14px 0 6px" }}><span>{formatShort(sum(won))} won this month</span><b>{target ? `${pct}%` : "—"}</b></div>
              <div style={{ height: 6, background: C.line2, borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: "var(--co-btn)" }} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 16 }}>
                {stat("Open", formatShort(sum(open)))}{stat("Win rate", fyWon.length + fyLost.length ? `${Math.round((fyWon.length / (fyWon.length + fyLost.length)) * 100)}%` : "—")}{stat("FY won", formatShort(sum(fyWon)))}
                {stat("Deals", open.length)}{stat("Mtgs / wk", ((meets ?? []) as { owner_id: string | null }[]).filter((x) => x.owner_id === m.user_id).length)}{stat("Follow-ups", ((tasks ?? []) as { assignee_id: string | null }[]).filter((x) => x.assignee_id === m.user_id).length)}
              </div>
              <div style={{ marginTop: 14 }}><BadgeRow badges={badgesFor(personStats.get(m.user_id)!)} compact /></div>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <a href={`/c/${ctx.company.slug}/pipeline?owner=${m.user_id}`} style={{ border: `1px solid ${C.btnLine}`, borderRadius: 3, padding: "7px 12px", fontSize: 13, fontWeight: 600, color: C.ink, textDecoration: "none", background: "#fff" }}>Their pipeline</a>
                <a href={`/c/${ctx.company.slug}/followups?owner=${m.user_id === ctx.userId ? "me" : "all"}`} style={{ border: `1px solid ${C.btnLine}`, borderRadius: 3, padding: "7px 12px", fontSize: 13, fontWeight: 600, color: C.ink, textDecoration: "none", background: "#fff" }}>Their follow-ups</a>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
