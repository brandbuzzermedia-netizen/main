"use client";

import { useState } from "react";
import { giveKudosAction } from "@/app/activity-actions";
import { C } from "./theme";
import { Glyph } from "./icons";

/** "Congratulate" with an optional short message; the teammate gets a celebration. */
export function KudosButton({ orgId, toId, name }: { orgId: string; toId: string; name: string }) {
  const [state, setState] = useState<"idle" | "open" | "sending" | "done" | string>("idle");
  const [msg, setMsg] = useState("");
  const send = async () => {
    setState("sending");
    const r = await giveKudosAction(orgId, toId, msg);
    setState("error" in r ? String(r.error) : "done");
  };
  const b = { border: `1px solid ${C.btnLine}`, borderRadius: 3, padding: "7px 12px", fontSize: 13, fontWeight: 600, color: C.ink, background: "#fff", cursor: "pointer" } as const;
  if (state === "done") return <span style={{ fontSize: 13, fontWeight: 600, color: "var(--co-btn)", alignSelf: "center" }}>Congratulated</span>;
  if (state === "idle") return <button type="button" onClick={() => setState("open")} style={{ ...b, display: "inline-flex", alignItems: "center", gap: 6 }}><Glyph name="clap" size={14} />Congratulate</button>;
  return (
    <span style={{ display: "flex", gap: 6, flex: "1 1 100%", flexWrap: "wrap" }}>
      <input value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={140} placeholder={`Say well done to ${name.split(/[\s@]/)[0]} (optional)`} aria-label="Message"
        style={{ flex: 1, minWidth: 160, border: `1px solid ${C.btnLine}`, borderRadius: 3, padding: "7px 10px", fontSize: 13 }} />
      <button type="button" disabled={state === "sending"} onClick={() => void send()} style={{ ...b, background: "var(--co-btn)", color: "#fff", border: 0 }}>{state === "sending" ? "Sending…" : "Send"}</button>
      {state !== "open" && state !== "sending" && <span style={{ fontSize: 12, color: C.red, flex: "1 1 100%" }}>{state}</span>}
    </span>
  );
}
