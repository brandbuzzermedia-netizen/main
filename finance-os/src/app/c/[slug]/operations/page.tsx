import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { designFor } from "@/domain/design";
import { formatDate, todayInBusinessTz } from "@/domain/dates";
import { Cta, PageHead } from "@/components/dp/shell";
import { Card, Grid } from "@/components/dp/ui";
import { C } from "@/components/dp/theme";
import { OperationsView } from "@/views/operations";
import { decideAdAction, listProductAction, verifyBisAction, verifyReraAction } from "./actions";

export const metadata: Metadata = { title: "Operations" };
const inp = { border: `1px solid ${C.btnLine}`, borderRadius: 7, padding: "5px 8px", fontSize: 12.5, background: "#fff" } as const;
const go = { ...inp, cursor: "pointer", fontWeight: 600 } as const;

export default async function OperationsPage({ params }: PageProps<"/c/[slug]/operations">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const d = designFor(slug);
  if (!d.ext.length || (!ctx.can("operations.read") && !ctx.can("dashboard.owner"))) notFound();
  const verify = ctx.can("compliance.verify");
  const today = todayInBusinessTz();
  const org = ctx.company.id;
  const [products, properties, ads, certs] = await Promise.all([
    ctx.supabase.from("products").select("id, sku, name, bis_status, bis_valid_until, listed").eq("organization_id", org).eq("requires_bis", true).limit(100),
    ctx.supabase.from("properties").select("id, title, rera_registration, rera_verified").eq("organization_id", org).limit(100),
    ctx.supabase.from("ad_approvals").select("id, headline, channel").eq("organization_id", org).in("status", ["draft", "submitted"]).limit(50),
    verify ? ctx.supabase.from("documents").select("id, file_name").eq("organization_id", org).eq("kind", "certificate").limit(100) : Promise.resolve({ data: [] }),
  ]);
  const ps = (products.data ?? []) as { id: string; sku: string; name: string; bis_status: string; bis_valid_until: string | null; listed: boolean }[];
  const pr = (properties.data ?? []) as { id: string; title: string; rera_registration: string | null; rera_verified: boolean }[];
  const ad = (ads.data ?? []) as { id: string; headline: string; channel: string }[];
  const cs = (certs.data ?? []) as { id: string; file_name: string }[];
  const row = { padding: "10px 0", borderTop: `1px solid ${C.line2}`, fontSize: 14 } as const;
  const below = (ps.length || pr.length || ad.length) ? (
    <Grid cols="repeat(auto-fit,minmax(min(360px,100%),1fr))" style={{ marginTop: 20 }}>
      {ps.length > 0 && (
        <Card title="BIS evidence">
          {ps.map((p) => {
            const ok = p.bis_status === "verified" && (p.bis_valid_until ?? "") >= today;
            return (
              <div key={p.id} style={row}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span>{p.sku} · {p.name}</span><b style={{ color: ok ? "#2F5D4C" : C.red }}>{ok ? `Verified to ${formatDate(p.bis_valid_until)}` : "Listing blocked"}</b></div>
                {verify && !ok && (cs.length ? (
                  <form action={verifyBisAction.bind(null, slug)} style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                    <input type="hidden" name="id" value={p.id} /><input name="certificate" required placeholder="Licence / certificate no." aria-label="Certificate" style={inp} />
                    <input type="date" name="valid_until" required aria-label="Valid until" style={inp} />
                    <select name="document_id" aria-label="Evidence" style={inp}>{cs.map((x) => <option key={x.id} value={x.id}>{x.file_name}</option>)}</select>
                    <button style={go}>Verify</button>
                  </form>
                ) : <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>Upload the certificate to the Vault (kind: certificate) to verify it here.</div>)}
                {ok && ctx.can("operations.write") && <form action={listProductAction.bind(null, slug)} style={{ marginTop: 6 }}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="listed" value={String(!p.listed)} /><button style={go}>{p.listed ? "Unlist" : "List for sale"}</button></form>}
              </div>
            );
          })}
        </Card>
      )}
      {pr.length > 0 && (
        <Card title="K-RERA">
          {pr.map((p) => (
            <div key={p.id} style={row}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span>{p.title}</span><b style={{ color: p.rera_verified ? "#2F5D4C" : C.red }}>{p.rera_verified ? p.rera_registration : "Ads blocked"}</b></div>
              {verify && !p.rera_verified && (
                <form action={verifyReraAction.bind(null, slug)} style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  <input type="hidden" name="id" value={p.id} /><input name="registration" required defaultValue={p.rera_registration ?? ""} placeholder="Registration no. checked on the K-RERA portal" aria-label="Registration" style={{ ...inp, flex: 1 }} />
                  <button style={go}>Verify</button>
                </form>
              )}
            </div>
          ))}
        </Card>
      )}
      {ad.length > 0 && (
        <Card title="Ads awaiting a decision">
          {ad.map((a) => (
            <div key={a.id} style={{ ...row, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <span>{a.headline} <span style={{ color: C.muted, fontSize: 12.5 }}>· {a.channel}</span></span>
              {verify && <form action={decideAdAction.bind(null, slug)} style={{ display: "flex", gap: 4 }}><input type="hidden" name="id" value={a.id} />
                <button name="status" value="approved" style={{ ...go, background: "var(--co-side)", color: "#fff", border: 0 }}>Approve</button><button name="status" value="rejected" style={go}>Reject</button></form>}
            </div>
          ))}
        </Card>
      )}
    </Grid>
  ) : null;
  const first = d.ext.find((x) => x.to?.startsWith("r/"));
  return (
    <>
      <PageHead own={d.own} treat={d.treat} title={d.ren.operations ?? "Operations"} right={first && ctx.can("operations.write") ? <Cta href={`/c/${slug}/${first.to}`}>+ Add</Cta> : undefined} />
      <OperationsView gate={d.gate} items={d.ext} base={`/c/${slug}`} below={below} />
    </>
  );
}
