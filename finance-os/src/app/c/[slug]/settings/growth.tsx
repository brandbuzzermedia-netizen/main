import type { CompanyContext } from "@/lib/workspace";
import type { Member } from "@/lib/people";
import { Card } from "@/components/dp/ui";
import { C } from "@/components/dp/theme";
import { addOnboardingStepAction, removeOnboardingStepAction, saveGrowthAction } from "./growth-actions";

const field = { border: `1px solid ${C.btnLine}`, borderRadius: 8, padding: "8px 10px", fontSize: 14, background: "#fff", color: C.ink, fontFamily: "inherit" } as const;
const btn = { border: `1px solid ${C.btnLine}`, background: "#fff", borderRadius: 8, padding: "7px 14px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" } as const;
const sub = { fontSize: 13, color: C.muted, lineHeight: 1.5 } as const;

/** Lead to delivery: meeting booking link, who gets new leads, and what happens after payment. */
export async function GrowthCard({ ctx, slug, members, note }: { ctx: CompanyContext; slug: string; members: Member[]; note?: string }) {
  const [{ data: g }, { data: steps }] = await Promise.all([
    ctx.supabase.from("growth_settings").select("booking_url, routing_enabled, routing_members, onboarding_on").eq("organization_id", ctx.company.id).maybeSingle(),
    ctx.supabase.from("onboarding_steps").select("id, title, due_after_days, assignee_id").eq("organization_id", ctx.company.id).order("position").order("created_at"),
  ]);
  const edit = ctx.can("crm.manage");
  const names = new Map(members.map((m) => [m.user_id, m.name]));
  const chosen = new Set((g?.routing_members ?? []) as string[]);
  return (
    <div id="growth">
      <Card title="Lead to delivery" aside={<span style={{ fontSize: 12.5, color: C.muted }}>Booking, routing, onboarding</span>}>
        {note && <div role="status" style={{ fontSize: 13.5, color: "var(--co-side)", fontWeight: 600, marginTop: 8 }}>{note}</div>}
        <form action={saveGrowthAction.bind(null, slug)} style={{ display: "flex", flexDirection: "column", gap: 14, borderTop: `1px solid ${C.line2}`, marginTop: 10, paddingTop: 12, fontSize: 14 }}>
          <fieldset disabled={!edit} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><b style={{ fontWeight: 600 }}>Meeting booking link</b>
              <span style={sub}>Your Cal.com (free) or Calendly page, connected to your Google Calendar. Use {"{{booking_link}}"} in campaign emails; AI calls offer it too. Bookings arrive in Meetings and stop that lead&apos;s campaigns.</span>
              <input name="booking_url" type="url" defaultValue={g?.booking_url ?? ""} placeholder="https://cal.com/your-name/15min" style={field} />
            </label>
            <div><b style={{ fontWeight: 600 }}>New leads go to</b>
              <div style={sub}>Each new lead without an owner is given to the next person in turn. Leave unticked to assign by hand.</div>
              <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0" }}><input type="checkbox" name="routing_enabled" defaultChecked={Boolean(g?.routing_enabled)} /> Share new leads in turn between:</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {members.map((m) => <label key={m.user_id} style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="routing_members" value={m.user_id} defaultChecked={chosen.has(m.user_id)} />{m.name}</label>)}
              </div>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><b style={{ fontWeight: 600 }}>Start client onboarding</b>
              <select name="onboarding_on" defaultValue={g?.onboarding_on ?? "first_payment"} style={field}>
                <option value="first_payment">When the first payment (advance) arrives</option>
                <option value="full_payment">When the invoice is fully paid</option>
              </select>
            </label>
            {edit && <div><button style={btn}>Save</button></div>}
          </fieldset>
        </form>
        <div style={{ borderTop: `1px solid ${C.line2}`, marginTop: 14, paddingTop: 12 }}>
          <b style={{ fontWeight: 600, fontSize: 14 }}>Onboarding steps</b>
          <div style={sub}>Created as tasks once, when a won deal&apos;s invoice is paid. Unassigned steps go to the deal owner.</div>
          {(steps ?? []).map((s, i) => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "8px 0", borderTop: i ? `1px solid ${C.line2}` : undefined, fontSize: 14 }}>
              <span>{i + 1}. {s.title} <span style={{ color: C.muted }}>· day {s.due_after_days} · {s.assignee_id ? names.get(s.assignee_id) ?? "former member" : "deal owner"}</span></span>
              {edit && <form action={removeOnboardingStepAction.bind(null, slug)}><input type="hidden" name="id" value={s.id} /><button style={{ ...btn, padding: "4px 10px", fontSize: 12.5 }}>Remove</button></form>}
            </div>
          ))}
          {!steps?.length && <div style={{ ...sub, padding: "8px 0" }}>No steps yet, e.g. &ldquo;Kick-off call&rdquo; day 0, &ldquo;Collect brand assets&rdquo; day 1, &ldquo;First delivery&rdquo; day 7.</div>}
          {edit && (
            <form action={addOnboardingStepAction.bind(null, slug)} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <input name="title" required minLength={2} maxLength={200} placeholder="Step, e.g. Kick-off call" aria-label="Step" style={{ ...field, flex: 1, minWidth: 180 }} />
              <input name="due_after_days" type="number" min={0} max={365} defaultValue={0} aria-label="Days after payment" title="Days after payment" style={{ ...field, width: 80 }} />
              <select name="assignee_id" defaultValue="" aria-label="Assignee" style={field}>
                <option value="">Deal owner</option>
                {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
              </select>
              <button style={btn}>Add step</button>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
