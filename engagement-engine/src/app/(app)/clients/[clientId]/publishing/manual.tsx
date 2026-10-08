"use client";

import { useActionState, useState } from "react";
import { markPublished } from "@/app/actions/engagement";
import { buttonClass, inputClass } from "@/components/ui";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("secondary", "sm")}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied ✓" : "Copy comment"}
    </button>
  );
}

export function ManualPublishForm({ clientId, jobId }: { clientId: string; jobId: string }) {
  const [state, action, pending] = useActionState(markPublished.bind(null, clientId, jobId), null);
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className={buttonClass("accent", "sm")} onClick={() => setOpen(true)}>
        Mark as posted
      </button>
    );
  return (
    <form action={action} className="flex w-56 flex-col gap-1.5">
      <input name="url" type="url" required placeholder="Link to the posted comment" className={inputClass + " h-8 text-xs"} />
      <button className={buttonClass("primary", "sm")} disabled={pending}>
        {pending ? "Saving…" : "Record publication"}
      </button>
      {state?.message && <p className={state.ok ? "text-xs text-good" : "text-xs text-bad"}>{state.message}</p>}
    </form>
  );
}
