"use client";

import { useActionState } from "react";
import { enrollAction, verifyAction, type MfaState } from "./actions";

const input = { width: "100%", border: "1px solid #e2dcc9", borderRadius: 10, padding: "12px 14px", fontSize: 20, letterSpacing: ".3em", textAlign: "center" as const, background: "#fff" };
const primary = { width: "100%", background: "#173F32", color: "#fff", border: 0, borderRadius: 10, padding: "12px", fontWeight: 600, fontSize: 14.5, cursor: "pointer" };

function CodeForm({ factorId, next, state, action, pending }: { factorId: string; next: string; state: MfaState; action: (fd: FormData) => void; pending: boolean }) {
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input type="hidden" name="factor_id" value={factorId} /><input type="hidden" name="next" value={next} />
      <label style={{ fontSize: 13.5, color: "#55605a" }} htmlFor="code">6-digit code from your authenticator app</label>
      <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus style={input} />
      {state.error && <div role="alert" style={{ background: "#F5DADA", color: "#8C2F39", borderRadius: 8, padding: "9px 12px", fontSize: 13 }}>{state.error}</div>}
      <button disabled={pending} style={primary}>{pending ? "Checking…" : "Verify"}</button>
    </form>
  );
}

/** First-time setup: show the QR code and secret, then confirm with a code. */
export function EnrollFlow({ next }: { next: string }) {
  const [setup, start, starting] = useActionState<MfaState, FormData>(async () => enrollAction(), {});
  const [state, verify, pending] = useActionState<MfaState, FormData>(verifyAction, {});
  if (!setup.factorId) {
    return (
      <form action={start} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {setup.error && <div role="alert" style={{ background: "#F5DADA", color: "#8C2F39", borderRadius: 8, padding: "9px 12px", fontSize: 13 }}>{setup.error}</div>}
        <button disabled={starting} style={primary}>{starting ? "Preparing…" : "Set up an authenticator app"}</button>
      </form>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ fontSize: 13.5, color: "#55605a", margin: 0 }}>Scan this with Google Authenticator, Microsoft Authenticator, 1Password or similar.</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- QR code is an SVG data URI from Supabase */}
      <img src={setup.qr} alt="QR code for your authenticator app" width={180} height={180} style={{ alignSelf: "center", background: "#fff", padding: 8, borderRadius: 10 }} />
      <div style={{ fontSize: 12.5, color: "#6d7a70", textAlign: "center" }}>Cannot scan? Enter this key: <code style={{ fontSize: 12.5, wordBreak: "break-all" }}>{setup.secret}</code></div>
      <CodeForm factorId={setup.factorId} next={next} state={state} action={verify} pending={pending} />
    </div>
  );
}

/** Returning user with a verified factor: enter the current code. */
export function VerifyFlow({ factorId, next }: { factorId: string; next: string }) {
  const [state, verify, pending] = useActionState<MfaState, FormData>(verifyAction, {});
  return <CodeForm factorId={factorId} next={next} state={state} action={verify} pending={pending} />;
}
