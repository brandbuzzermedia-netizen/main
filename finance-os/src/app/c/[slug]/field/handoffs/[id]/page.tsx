import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { designFor } from "@/domain/design";
import { PageHead } from "@/components/dp/shell";
import { bigPrimary } from "@/components/field/field-client";
import { saveHandoffAction } from "../../actions";
import { Box, FieldTabs } from "../../tabs";

export const metadata: Metadata = { title: "Delivery handoff" };
const inp = { width: "100%", minHeight: 46, border: "1px solid #E4E0D6", borderRadius: 10, padding: "10px 12px", fontSize: 16, background: "#fff", boxSizing: "border-box", fontFamily: "inherit" } as const;
const lbl = { fontSize: 13, color: "#6B6B6B", display: "grid", gap: 4 } as const;

/** What the delivery team needs: logo, colours, services, photos and the client contact. */
export default async function Handoff({ params, searchParams }: PageProps<"/c/[slug]/field/handoffs/[id]">) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write") && !ctx.can("tasks.write")) notFound();
  const { data: h } = await ctx.supabase.from("delivery_handoffs")
    .select("id, contact_id, status, due_on, services, brand_colours, contact_name, contact_phone, contact_email, logo_path, photo_paths, notes, contact:contacts(company_name, full_name)")
    .eq("id", id).eq("organization_id", ctx.company.id).maybeSingle();
  if (!h) notFound();
  const paths = [h.logo_path, ...(h.photo_paths as string[])].filter(Boolean) as string[];
  const { data: signed } = paths.length ? await ctx.supabase.storage.from("handoffs").createSignedUrls(paths, 600) : { data: [] };
  const url = new Map((signed ?? []).map((s) => [s.path ?? "", s.signedUrl ?? ""]));
  const c = h.contact as unknown as { company_name: string | null; full_name: string } | null;
  return (
    <>
      <PageHead own={designFor(slug).own} treat={`Handoff · due ${String(h.due_on).split("-").reverse().join("/")}`} title={c?.company_name || c?.full_name || "Client"} tag="For delivery." />
      <FieldTabs slug={slug} current="/handoffs" note={sp.note} />
      <Box title="Brand and contact" aside={<a href={`/c/${slug}/field/leads/${h.contact_id}`} style={{ fontSize: 13.5, fontWeight: 700 }}>Lead</a>}>
        <form action={saveHandoffAction.bind(null, slug, id)} style={{ display: "grid", gap: 12 }}>
          <label style={lbl}>Status<select name="status" defaultValue={h.status} style={inp}><option value="awaiting_details">Awaiting details</option><option value="ready">Ready to build</option><option value="in_progress">In progress</option><option value="done">Done</option></select></label>
          <div style={lbl}>Logo
            {h.logo_path && url.get(h.logo_path) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url.get(h.logo_path)} alt="Client logo" style={{ maxWidth: 160, maxHeight: 100, objectFit: "contain", background: "#F6F3EA", borderRadius: 8, padding: 6 }} />
            )}
            <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" style={{ fontSize: 15 }} />
          </div>
          <label style={lbl}>Brand colours<input name="brand_colours" maxLength={300} defaultValue={h.brand_colours ?? ""} placeholder="e.g. #0B3D91 blue, #FFC107 yellow" style={inp} /></label>
          <label style={lbl}>Services and prices<textarea name="services" rows={4} maxLength={2000} defaultValue={h.services ?? ""} placeholder="Ceramic coating ₹25,000, PPF from ₹60,000…" style={{ ...inp, minHeight: 96 }} /></label>
          <div style={lbl}>Photos (up to 12)
            {(h.photo_paths as string[]).length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(90px,1fr))", gap: 8 }}>
                {(h.photo_paths as string[]).map((p) => (
                  <label key={p} style={{ display: "grid", gap: 4, fontSize: 12 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {url.get(p) && <img src={url.get(p)} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8 }} />}
                    <span><input type="checkbox" name="remove_photo" value={p} /> Remove</span>
                  </label>
                ))}
              </div>
            )}
            <input type="file" name="photos" multiple accept="image/png,image/jpeg,image/webp" style={{ fontSize: 15 }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={lbl}>Contact name<input name="contact_name" maxLength={200} defaultValue={h.contact_name ?? ""} style={inp} /></label>
            <label style={lbl}>Contact phone<input name="contact_phone" type="tel" maxLength={40} defaultValue={h.contact_phone ?? ""} style={inp} /></label>
          </div>
          <label style={lbl}>Contact email<input name="contact_email" type="email" maxLength={200} defaultValue={h.contact_email ?? ""} style={inp} /></label>
          <label style={lbl}>Notes for the team<textarea name="notes" rows={3} maxLength={4000} defaultValue={h.notes ?? ""} style={{ ...inp, minHeight: 80 }} /></label>
          <button style={{ ...bigPrimary, width: "100%" }}>Save</button>
          <div style={{ fontSize: 12.5, color: "#6B6B6B" }}>Images up to 4 MB each (PNG, JPG, WebP). Marking Done also closes the delivery task.</div>
        </form>
      </Box>
    </>
  );
}
