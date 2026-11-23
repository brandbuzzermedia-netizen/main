import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { formatMoney } from "@/domain/money";
import { designFor } from "@/domain/design";
import { PageHead } from "@/components/dp/shell";
import { AddressField, big, bigPrimary, CheckIn, StatusChip, type FieldLead } from "@/components/field/field-client";
import { FIELD_STATUSES, navigateUrl, OUTCOME_LABEL, placeUrl, SEGMENT_LABEL, SEGMENTS, SOURCES, STATUS_LABEL, toPoint, type Outcome } from "@/lib/field-sales";
import { LEAD_COLUMNS } from "@/lib/field-data";
import { loadMembers } from "@/lib/people";
import { checkInAction, saveLeadAction, setStatusAction } from "../../actions";
import { Box, FieldTabs } from "../../tabs";

export const metadata: Metadata = { title: "Field lead" };

const fieldStyle = { width: "100%", minHeight: 46, border: "1px solid #E4E0D6", borderRadius: 10, padding: "10px 12px", fontSize: 16, background: "#fff", boxSizing: "border-box", fontFamily: "inherit" } as const;
const lbl = { fontSize: 13, color: "#6B6B6B", display: "grid", gap: 4 } as const;

/** One field lead: call, WhatsApp, navigate, check in, change status, edit, and the visit history. "new" adds a lead. */
export default async function FieldLeadPage({ params, searchParams }: PageProps<"/c/[slug]/field/leads/[id]">) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) notFound();
  const isNew = id === "new";
  const [{ data: row }, { data: visits }, { data: handoff }, members] = await Promise.all([
    isNew ? Promise.resolve({ data: null }) : ctx.supabase.from("contacts").select(`${LEAD_COLUMNS}, source, notes, lost_reason, owner_id`).eq("id", id).eq("organization_id", ctx.company.id).maybeSingle(),
    isNew ? Promise.resolve({ data: [] }) : ctx.supabase.from("field_visits").select("id, visited_at, outcome, owner_back_at, amount_minor, note, lat, lng").eq("contact_id", id).order("visited_at", { ascending: false }).limit(50),
    isNew ? Promise.resolve({ data: null }) : ctx.supabase.from("delivery_handoffs").select("id, status, due_on").eq("contact_id", id).maybeSingle(),
    ctx.can("crm.manage") ? loadMembers(ctx.supabase, ctx.company.id) : Promise.resolve([]),
  ]);
  if (!isNew && !row) notFound();
  const l = (row ?? null) as (FieldLead & { source: string | null; notes: string | null; lost_reason: string | null; owner_id: string | null }) | null;
  const lat = l?.lat == null ? null : Number(l.lat), lng = l?.lng == null ? null : Number(l.lng);
  const d = designFor(slug);
  const title = isNew ? "New lead" : l!.company_name || l!.full_name;
  const digits = (p: string | null) => (p ?? "").replace(/\D/g, "");
  const time = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
  const edit = (
    <form action={saveLeadAction.bind(null, slug, id)} style={{ display: "grid", gap: 12 }}>
      <label style={lbl}>Business name *<input name="company_name" required maxLength={200} defaultValue={l?.company_name ?? ""} style={fieldStyle} /></label>
      <label style={lbl}>Owner name<input name="owner_name" maxLength={200} defaultValue={l && l.full_name !== l.company_name ? l.full_name : ""} style={fieldStyle} /></label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={lbl}>Phone<input name="phone" type="tel" inputMode="tel" defaultValue={l?.phone_e164 ?? ""} placeholder="98xxxxxxxx" style={fieldStyle} /></label>
        <label style={lbl}>WhatsApp<input name="whatsapp" type="tel" inputMode="tel" defaultValue={l?.whatsapp_e164 && l.whatsapp_e164 !== l.phone_e164 ? l.whatsapp_e164 : ""} placeholder="Same as phone" style={fieldStyle} /></label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={lbl}>Segment<select name="segment" defaultValue={l?.field_segment ?? "car_detailing"} style={fieldStyle}>{SEGMENTS.map((s) => <option key={s} value={s}>{SEGMENT_LABEL[s]}</option>)}</select></label>
        <label style={lbl}>Source<select name="source" defaultValue={(SOURCES as readonly string[]).includes(l?.source ?? "") ? l!.source! : "Walk-in"} style={fieldStyle}>{SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
      </div>
      <AddressField address={l?.address ?? ""} area={l?.area ?? ""} lat={lat} lng={lng} placeId={l?.place_id ?? ""} />
      <label style={lbl}>Next follow-up<input name="next_follow_up_on" type="date" defaultValue={l?.next_follow_up_on ?? ""} style={fieldStyle} /></label>
      {members.length > 0 && (
        <label style={lbl}>Assigned to<select name="owner_id" defaultValue={l?.owner_id ?? ctx.userId} style={fieldStyle}>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}</select></label>
      )}
      <label style={lbl}>Notes<textarea name="notes" rows={3} maxLength={4000} defaultValue={l?.notes ?? ""} style={{ ...fieldStyle, minHeight: 80 }} /></label>
      <button style={{ ...bigPrimary, width: "100%" }}>{isNew ? "Add lead" : "Save changes"}</button>
    </form>
  );
  if (isNew) {
    return (
      <>
        <PageHead own={d.own} treat="Field sales" title="New lead" tag="At the shop." />
        <FieldTabs slug={slug} current="/leads/new" note={sp.note} />
        <Box title="Lead details">{edit}</Box>
      </>
    );
  }
  const lead = l!;
  const pt = toPoint({ lat, lng });
  return (
    <>
      <PageHead own={d.own} treat={`Field sales · ${SEGMENT_LABEL[lead.field_segment ?? "other"]}${lead.area ? ` · ${lead.area}` : ""}`} title={title} tag={STATUS_LABEL[lead.field_status] + "."} />
      <FieldTabs slug={slug} current="/leads" note={sp.note} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12, fontSize: 14 }}>
        <StatusChip s={lead.field_status} />
        {lead.next_follow_up_on && <span>Follow up <b>{lead.next_follow_up_on.split("-").reverse().join("/")}</b></span>}
        {lead.owner_back_at && <span>Owner back <b>{time(lead.owner_back_at)}</b></span>}
        {lead.field_status === "lost" && lead.lost_reason && <span style={{ color: "#B42318" }}>Lost: {lead.lost_reason}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
        {lead.phone_e164 ? <a href={`tel:${lead.phone_e164}`} style={big}>Call</a> : <span style={{ ...big, color: "#AAA" }}>No phone</span>}
        {lead.whatsapp_e164 ? <a href={`https://wa.me/${digits(lead.whatsapp_e164)}`} target="_blank" rel="noopener noreferrer" style={big}>WhatsApp</a> : <span style={{ ...big, color: "#AAA" }}>No WhatsApp</span>}
        <a href={navigateUrl(lead)} target="_blank" rel="noopener noreferrer" style={bigPrimary}>Navigate</a>
      </div>
      <div style={{ marginBottom: 14 }}><CheckIn action={checkInAction.bind(null, slug, id)} startOpen={sp.checkin === "1"} /></div>
      {handoff && (
        <Box title="Delivery handoff">
          <a href={`/c/${slug}/field/handoffs/${handoff.id}`} style={{ ...big, width: "100%" }}>Open handoff · due {String(handoff.due_on).split("-").reverse().join("/")} · {String(handoff.status).replace("_", " ")}</a>
        </Box>
      )}
      <Box title="Visits">
        {(visits ?? []).length === 0 ? <div style={{ fontSize: 14, color: "#6B6B6B" }}>No visits yet. Tap Check in when you are at the shop.</div> : (visits ?? []).map((v) => (
          <div key={v.id} style={{ padding: "10px 0", borderTop: "1px solid #EFEBE1", fontSize: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{OUTCOME_LABEL[v.outcome as Outcome]}</b><span style={{ color: "#6B6B6B" }}>{time(v.visited_at)}</span></div>
            <div style={{ color: "#555", marginTop: 2 }}>{[v.amount_minor ? `Collected ${formatMoney(Number(v.amount_minor))}` : null, v.owner_back_at ? `Owner back ${time(v.owner_back_at)}` : null, v.note].filter(Boolean).join(" · ")}</div>
            {v.lat !== null && <a href={placeUrl({ lat: Number(v.lat), lng: Number(v.lng) })} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5 }}>Check-in location</a>}
          </div>
        ))}
      </Box>
      <Box title="Change status">
        <form action={setStatusAction.bind(null, slug, id)} style={{ display: "grid", gap: 8 }}>
          <select name="status" defaultValue={lead.field_status} aria-label="Status" style={fieldStyle}>{FIELD_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
          <input name="lost_reason" maxLength={300} placeholder="Reason (needed for Lost)" aria-label="Lost reason" style={fieldStyle} />
          <button style={{ ...big, width: "100%" }}>Update status</button>
        </form>
        <div style={{ fontSize: 12.5, color: "#6B6B6B", marginTop: 6 }}>Advance paid creates a delivery task for the execution team, due in 7 days.</div>
      </Box>
      <Box title="Edit details">{edit}</Box>
      {pt && <div style={{ fontSize: 12.5, color: "#6B6B6B", marginBottom: 20 }}><a href={placeUrl(pt)} target="_blank" rel="noopener noreferrer">Show the pin on Google Maps</a></div>}
    </>
  );
}
