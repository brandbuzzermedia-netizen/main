"use client";
import { useActionState } from "react";
import { unlockShare } from "@/app/(app)/actions";

export function UnlockForm({ client, month, token, title }: { client: string; month: string; token: string; title: string }) {
  const [state, action, pending] = useActionState<{ error?: string }, FormData>(unlockShare, {});
  return (
    <form action={action}>
      <h1>{title}</h1>
      <p>This report is password protected. Enter the password Get Bee Seen gave you.</p>
      <input type="hidden" name="client" value={client} />
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="token" value={token} />
      <label htmlFor="pw" style={{ fontWeight: 600, fontSize: 13 }}>Password</label>
      <input id="pw" name="password" type="password" required autoComplete="current-password" autoFocus />
      {state.error ? <span className="err" role="alert">{state.error}</span> : null}
      <button className="share-btn primary" type="submit" disabled={pending} style={{ justifyContent: "center" }}>{pending ? "Checking…" : "Open report"}</button>
    </form>
  );
}
