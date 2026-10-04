"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { approveSelected } from "@/app/actions/engagement";
import { Badge, PlatformIcon, QualityBadge, ScoreBadge, buttonClass, cx, timeAgo } from "@/components/ui";
import { ConfirmDialog } from "./confirm";
import { ApproveButton, CommentEditor, RegenerateForm, RejectForm, SuggestionActions } from "./comment-tools";
import type { CheckResult } from "@/lib/engine/quality";

export interface ApprovalItem {
  id: string;
  platform: string;
  commentType: string;
  text: string;
  originalText: string;
  isEdited: boolean;
  aiReasoning: string | null;
  qualityScore: number | null;
  qualityPassed: boolean;
  checks: CheckResult[];
  score: number | null;
  scoreLabel: string | null;
  explanation: string | null;
  postContent: string;
  postUrl: string | null;
  author: string | null;
  authorBio: string | null;
  campaign: string;
  createdAt: string;
  approvedSides: string[];
  requiredSides: string[];
  mySide: "gbs" | "client" | null;
  iApproved: boolean;
  publishCapability: "api" | "manual";
  replyToText: string | null;
  suggestions: { id: string; text: string; by: string; note: string | null }[];
}

const TYPE_LABEL: Record<string, string> = { insight: "Insight", conversation: "Conversation", expert: "Expert perspective" };

export function ApprovalQueue({
  clientId,
  items,
  canEdit,
  canRegenerate,
}: {
  clientId: string;
  items: ApprovalItem[];
  canEdit: boolean;
  canRegenerate: boolean;
}) {
  const router = useRouter();
  const bulkable = items.filter((i) => i.qualityPassed && i.mySide && !i.iApproved);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(approveSelected.bind(null, clientId), null);

  // After a successful bulk approval, clear the selection (once per result) and refresh the queue.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state?.ok) setSelected(new Set());
  }
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allSelected = bulkable.length > 0 && bulkable.every((i) => selected.has(i.id));

  return (
    <div>
      {bulkable.length > 0 && (
        <form id="bulk-approve" action={action} className="sticky top-14 z-20 mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 backdrop-blur">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(bulkable.map((i) => i.id)))}
              className="h-4 w-4 accent-[var(--brand)]"
            />
            Select all that passed quality checks ({bulkable.length})
          </label>
          <span className="tabular text-sm text-ink-3">{selected.size} selected</span>
          {[...selected].map((id) => (
            <input key={id} type="hidden" name="ids" value={id} />
          ))}
          <input type="hidden" name="confirmed_count" value={selected.size} />
          <button type="button" disabled={selected.size === 0 || pending} className={cx(buttonClass("primary"), "ml-auto")} onClick={() => setConfirming(true)}>
            {pending ? "Approving…" : `Approve selected (${selected.size})`}
          </button>
          <ConfirmDialog
            open={confirming}
            title="Confirm approval"
            body={
              <>
                You are approving <strong>{selected.size}</strong> comment{selected.size === 1 ? "" : "s"} for publication. Only comments that passed every quality
                check are included.
              </>
            }
            confirmLabel={`Approve ${selected.size}`}
            onClose={() => setConfirming(false)}
            onConfirm={() => (document.getElementById("bulk-approve") as HTMLFormElement).requestSubmit()}
          />
        </form>
      )}

      {state?.message && (
        <p role="status" className={cx("mb-4 rounded-lg border px-4 py-2 text-sm", state.ok ? "border-good/25 bg-good-soft text-good" : "border-bad/25 bg-bad-soft text-bad")}>
          {state.message}
        </p>
      )}
      <ul className="flex flex-col gap-4">
        {items.map((it) => (
          <ApprovalCard
            key={it.id}
            clientId={clientId}
            item={it}
            canEdit={canEdit}
            canRegenerate={canRegenerate}
            selectable={bulkable.some((b) => b.id === it.id)}
            selected={selected.has(it.id)}
            onToggle={() => toggle(it.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function ApprovalCard({
  clientId,
  item: it,
  canEdit,
  canRegenerate,
  selectable,
  selected,
  onToggle,
}: {
  clientId: string;
  item: ApprovalItem;
  canEdit: boolean;
  canRegenerate: boolean;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "reject" | "regenerate">("view");
  const issues = it.checks.filter((c) => c.status !== "pass");
  return (
    <li className={cx("rounded-xl border bg-surface", selected ? "border-brand ring-2 ring-brand/15" : "border-line")}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        {selectable ? (
          <input type="checkbox" checked={selected} onChange={onToggle} aria-label="Select for bulk approval" className="h-4 w-4 accent-[var(--brand)]" />
        ) : (
          <span className="w-4" />
        )}
        <PlatformIcon platform={it.platform} />
        <span className="text-sm font-medium text-ink">{it.author ? `@${it.author}` : "Unknown author"}</span>
        <span className="text-xs text-ink-3">· {it.campaign}</span>
        <span className="text-xs text-ink-3">· {timeAgo(it.createdAt)}</span>
        <span className="ml-auto flex items-center gap-2">
          <ScoreBadge score={it.score} label={it.scoreLabel} />
          <QualityBadge score={it.qualityScore} passed={it.qualityPassed} />
        </span>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-1 text-xs font-medium text-ink-3">Post</div>
          <blockquote className="max-h-40 overflow-y-auto whitespace-pre-line rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-2">{it.postContent}</blockquote>
          {it.replyToText && (
            <div className="mt-2 rounded-lg border-l-2 border-accent bg-accent-soft/50 px-3 py-2 text-sm text-ink-2">
              <span className="text-xs font-medium text-ink-3">Replying to comment: </span>
              {it.replyToText}
            </div>
          )}
          {it.authorBio && <p className="mt-2 text-xs text-ink-3">Author: {it.authorBio}</p>}
          {it.postUrl && (
            <a href={it.postUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-block text-xs text-brand hover:underline">
              Open post ↗
            </a>
          )}
          {it.explanation && (
            <p className="mt-3 text-xs text-ink-2">
              <span className="font-medium text-ink-3">Why this opportunity: </span>
              {it.explanation}
            </p>
          )}
        </div>

        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-ink-3">
            Suggested comment <Badge tone="brand">{TYPE_LABEL[it.commentType] ?? it.commentType}</Badge>
            {it.isEdited && <Badge tone="info">Edited</Badge>}
            {it.publishCapability === "manual" && <Badge tone="accent">Posted manually</Badge>}
          </div>
          {mode === "edit" ? (
            <CommentEditor clientId={clientId} commentId={it.id} text={it.text} canEdit={canEdit} onDone={() => setMode("view")} />
          ) : (
            <p className="whitespace-pre-line rounded-lg border border-line px-3 py-2 text-[15px] leading-relaxed text-ink">{it.text}</p>
          )}
          {it.isEdited && mode === "view" && (
            <details className="mt-1 text-xs text-ink-3">
              <summary className="cursor-pointer">Original AI version</summary>
              <p className="mt-1 whitespace-pre-line">{it.originalText}</p>
            </details>
          )}
          {it.aiReasoning && <p className="mt-2 text-xs text-ink-3">AI reasoning: {it.aiReasoning}</p>}

          <div className="mt-3">
            {issues.length === 0 ? (
              <p className="text-xs text-good">✓ Quality: no issues detected</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {issues.map((c) => (
                  <li key={c.check} className={cx("text-xs", c.status === "fail" ? "text-bad" : "text-warn")}>
                    {c.status === "fail" ? "✕" : "!"} {c.message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {it.suggestions.length > 0 && (
            <div className="mt-3 rounded-lg border border-info/20 bg-info-soft/60 p-3">
              <div className="mb-1 text-xs font-medium text-info">Suggested edits from the team</div>
              {it.suggestions.map((s) => (
                <div key={s.id} className="mt-2 text-sm">
                  <p className="text-ink">{s.text}</p>
                  <p className="text-xs text-ink-3">
                    — {s.by}
                    {s.note ? `: ${s.note}` : ""}
                  </p>
                  {canEdit && (
                    <div className="mt-1">
                      <SuggestionActions clientId={clientId} editId={s.id} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-2 border-t border-line bg-surface-2 px-4 py-3">
        <ApprovalProgress required={it.requiredSides} approved={it.approvedSides} />
        <div className="ml-auto flex flex-wrap items-start gap-2">
          {mode === "reject" ? (
            <RejectForm clientId={clientId} commentId={it.id} onDone={() => setMode("view")} />
          ) : mode === "regenerate" ? (
            <RegenerateForm clientId={clientId} commentId={it.id} onDone={() => setMode("view")} />
          ) : (
            <>
              {canRegenerate && (
                <button className={buttonClass("ghost", "sm")} onClick={() => setMode("regenerate")}>
                  ↻ Regenerate
                </button>
              )}
              <button className={buttonClass("secondary", "sm")} onClick={() => setMode(mode === "edit" ? "view" : "edit")}>
                ✎ {canEdit ? "Edit" : "Suggest edit"}
              </button>
              {it.mySide && (
                <button className={buttonClass("danger", "sm")} onClick={() => setMode("reject")}>
                  ✕ Reject
                </button>
              )}
              {it.mySide && !it.iApproved && <ApproveButton clientId={clientId} commentId={it.id} />}
              {it.iApproved && <Badge tone="good">✓ You approved · awaiting {it.requiredSides.filter((s) => !it.approvedSides.includes(s)).join(" & ")}</Badge>}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function ApprovalProgress({ required, approved }: { required: string[]; approved: string[] }) {
  return (
    <div className="flex items-center gap-2 text-xs text-ink-3">
      <span>Approvals:</span>
      {required.map((s) => (
        <Badge key={s} tone={approved.includes(s) ? "good" : "neutral"}>
          {approved.includes(s) ? "✓" : "○"} {s === "gbs" ? "GBS" : "Client"}
        </Badge>
      ))}
    </div>
  );
}
