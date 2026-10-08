"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { buttonClass, cx, textareaClass } from "@/components/ui";
import { approve, regenerateComment, reject, resolveSuggestion, saveCommentEdit, submitComment, generateComments, queueComment } from "@/app/actions/engagement";
import { ConfirmDialog } from "./confirm";

function Msg({ r }: { r: ActionResult }) {
  if (!r?.message) return null;
  return (
    <p role="status" className={cx("text-xs", r.ok ? "text-good" : "text-bad")}>
      {r.message}
    </p>
  );
}

/** Runs a server action from a button and shows its result. */
export function ActionButton({
  run,
  children,
  variant = "secondary",
  size = "sm",
  confirm,
}: {
  run: () => Promise<ActionResult>;
  children: React.ReactNode;
  variant?: Parameters<typeof buttonClass>[0];
  size?: "sm" | "md";
  confirm?: { title: string; body?: React.ReactNode; label?: string };
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const go = () =>
    start(async () => {
      setResult(await run());
      router.refresh();
    });
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" disabled={pending} className={buttonClass(variant, size)} onClick={() => (confirm ? setOpen(true) : go())}>
        {pending ? "Working…" : children}
      </button>
      {confirm && (
        <ConfirmDialog open={open} title={confirm.title} body={confirm.body} confirmLabel={confirm.label} confirmVariant={variant} onClose={() => setOpen(false)} onConfirm={go} />
      )}
      <Msg r={result} />
    </span>
  );
}

export function CommentEditor({
  clientId,
  commentId,
  text,
  canEdit,
  onDone,
}: {
  clientId: string;
  commentId: string;
  text: string;
  canEdit: boolean;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(saveCommentEdit.bind(null, clientId, commentId), null);
  const [value, setValue] = useState(text);
  return (
    <form action={action} className="flex flex-col gap-2">
      <textarea name="text" value={value} onChange={(e) => setValue(e.target.value)} rows={4} className={textareaClass} aria-label="Comment text" maxLength={5000} />
      {!canEdit && <input name="note" placeholder="Why this change? (optional)" className={textareaClass + " h-9"} maxLength={500} />}
      <div className="flex flex-wrap items-center gap-2">
        <button className={buttonClass("primary", "sm")} disabled={pending}>
          {pending ? "Saving…" : canEdit ? "Save edit" : "Suggest edit"}
        </button>
        {onDone && (
          <button type="button" className={buttonClass("ghost", "sm")} onClick={onDone}>
            Close
          </button>
        )}
        <span className="tabular text-xs text-ink-3">{value.length} chars</span>
      </div>
      <Msg r={state} />
      {canEdit && <p className="text-xs text-ink-3">Edits are kept with the original AI version, re-checked for quality, and used as feedback for this client&apos;s future drafts.</p>}
    </form>
  );
}

export function RejectForm({ clientId, commentId, onDone }: { clientId: string; commentId: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(reject.bind(null, clientId, commentId), null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input name="reason" placeholder="Reason (helps future drafts)" className={textareaClass + " h-9"} maxLength={500} />
      <div className="flex gap-2">
        <button className={buttonClass("danger", "sm")} disabled={pending}>
          {pending ? "Rejecting…" : "Reject comment"}
        </button>
        <button type="button" className={buttonClass("ghost", "sm")} onClick={onDone}>
          Cancel
        </button>
      </div>
      <Msg r={state} />
    </form>
  );
}

export function RegenerateForm({ clientId, commentId, opportunityId, onDone }: { clientId: string; commentId?: string; opportunityId?: string; onDone?: () => void }) {
  const fn = commentId ? regenerateComment.bind(null, clientId, commentId) : (generateComments.bind(null, clientId, opportunityId!) as (p: ActionResult, fd: FormData) => Promise<ActionResult>);
  const [state, action, pending] = useActionState(fn, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input name="note" placeholder="What should change? e.g. shorter, ask about hardware" className={textareaClass + " h-9"} maxLength={500} />
      <div className="flex gap-2">
        <button className={buttonClass("secondary", "sm")} disabled={pending}>
          {pending ? "Generating…" : "Regenerate"}
        </button>
        {onDone && (
          <button type="button" className={buttonClass("ghost", "sm")} onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
      <Msg r={state} />
    </form>
  );
}

export function ApproveButton({ clientId, commentId, label = "Approve" }: { clientId: string; commentId: string; label?: string }) {
  return (
    <ActionButton run={() => approve(clientId, commentId)} variant="primary">
      ✓ {label}
    </ActionButton>
  );
}

export function SubmitForApprovalButton({ clientId, commentId }: { clientId: string; commentId: string }) {
  return (
    <ActionButton run={() => submitComment(clientId, commentId)} variant="primary">
      Submit for approval
    </ActionButton>
  );
}

export function QueueButton({ clientId, commentId }: { clientId: string; commentId: string }) {
  return (
    <ActionButton run={() => queueComment(clientId, commentId)} variant="primary">
      Queue for publishing
    </ActionButton>
  );
}

export function SuggestionActions({ clientId, editId }: { clientId: string; editId: string }) {
  return (
    <span className="inline-flex gap-2">
      <ActionButton run={() => resolveSuggestion(clientId, editId, true)}>Apply</ActionButton>
      <ActionButton run={() => resolveSuggestion(clientId, editId, false)} variant="ghost">
        Dismiss
      </ActionButton>
    </span>
  );
}

export function GenerateButton({ clientId, opportunityId, label = "Generate comments" }: { clientId: string; opportunityId: string; label?: string }) {
  return (
    <ActionButton run={() => generateComments(clientId, opportunityId)} variant="primary" size="md">
      ✦ {label}
    </ActionButton>
  );
}
