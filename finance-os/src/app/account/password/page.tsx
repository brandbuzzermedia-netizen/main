import type { Metadata } from "next";
import Link from "next/link";
import { getUser } from "@/lib/auth";
import { setPasswordAction } from "./actions";

export const metadata: Metadata = { title: "Password" };

const input = { width: "100%", boxSizing: "border-box", border: "1px solid #d9d2bf", borderRadius: 10, padding: "12px 14px", fontSize: 16, marginTop: 6 } as const;

/** Set a password so you can sign in with your email and password instead of an email link. */
export default async function PasswordPage({ searchParams }: PageProps<"/account/password">) {
  const { email } = await getUser();
  const sp = await searchParams;
  const done = sp.done === "1";
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "48px 16px", background: "#F5F1E8" }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#fff", border: "1px solid #e2dcc9", borderRadius: 16, padding: 28 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: "#829487" }}>Diwani Parivaar OS</div>
        <h1 style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontSize: 30, fontWeight: 500, margin: "6px 0 8px" }}>{done ? "Password saved" : "Set your password"}</h1>
        <p style={{ fontSize: 14, color: "#55605a", lineHeight: 1.55, marginTop: 0 }}>
          Your sign-in ID is your email: <b>{email}</b>.{" "}
          {done ? "From now on choose “Sign in with a password” on the sign-in page. The email link still works too." : "Set a password to sign in without waiting for an email link. Only you know it; admins cannot see it."}
        </p>
        {typeof sp.note === "string" && <div role="status" style={{ background: "#FDECEC", borderRadius: 10, padding: "10px 12px", fontSize: 14, marginBottom: 12 }}>{sp.note}</div>}
        {done ? <Link href="/" style={{ display: "block", textAlign: "center", background: "#173F32", color: "#fff", borderRadius: 10, padding: 12, fontWeight: 600, textDecoration: "none" }}>Continue</Link> : (
          <form action={setPasswordAction} style={{ display: "grid", gap: 12 }}>
            <input type="email" name="username" value={email ?? ""} autoComplete="username" readOnly hidden />
            <label style={{ fontSize: 13.5, color: "#55605a" }}>New password (at least 10 characters)<input type="password" name="password" required minLength={10} autoComplete="new-password" style={input} /></label>
            <label style={{ fontSize: 13.5, color: "#55605a" }}>Type it again<input type="password" name="again" required minLength={10} autoComplete="new-password" style={input} /></label>
            <button style={{ background: "#173F32", color: "#fff", border: 0, borderRadius: 10, padding: 13, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Save password</button>
          </form>
        )}
      </div>
    </main>
  );
}
