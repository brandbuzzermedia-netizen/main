import type { Metadata } from "next";
import { getUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/nav";
import { EnrollFlow, VerifyFlow } from "./forms";

export const metadata: Metadata = { title: "Two-step sign-in" };

/** Set up or use a second factor. Companies can require it for owner, admin and finance roles. */
export default async function MfaPage({ searchParams }: PageProps<"/mfa">) {
  const { supabase, email } = await getUser();
  const next = safeNextPath(String((await searchParams).next ?? ""), "/");
  const [{ data: aal }, { data: factors }, { data: req }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
    supabase.rpc("my_mfa_requirements"),
  ]);
  const verified = (factors?.totp ?? []).filter((f) => f.status === "verified");
  const required = ((req ?? []) as { satisfied: boolean }[]).length > 0;
  const done = aal?.currentLevel === "aal2";
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "48px 16px", background: "#F5F1E8" }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#fff", border: "1px solid #e2dcc9", borderRadius: 16, padding: 28 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: "#829487" }}>Diwani Parivaar OS</div>
        <h1 style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontSize: 30, fontWeight: 500, margin: "6px 0 8px" }}>Two-step sign-in</h1>
        <p style={{ fontSize: 14, color: "#55605a", lineHeight: 1.55, marginTop: 0 }}>
          {done ? `You are signed in with a second factor as ${email}.`
            : required ? "A company you belong to requires a code from an authenticator app for owner, admin and finance roles. Until then, only basic access is available."
            : "Add a code from an authenticator app on your phone to protect money and people settings."}
        </p>
        {done ? <a href={next} style={{ display: "block", textAlign: "center", background: "#173F32", color: "#fff", borderRadius: 10, padding: 12, fontWeight: 600, textDecoration: "none" }}>Continue</a>
          : verified.length ? <VerifyFlow factorId={verified[0].id} next={next} />
          : <EnrollFlow next={next} />}
        <form action="/auth/signout" method="post" style={{ marginTop: 14, textAlign: "center" }}><button style={{ border: 0, background: "transparent", color: "#6d7a70", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>Sign out</button></form>
      </div>
    </main>
  );
}
