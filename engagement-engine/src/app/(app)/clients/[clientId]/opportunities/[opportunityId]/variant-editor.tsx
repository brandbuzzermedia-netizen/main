"use client";

import { useState } from "react";
import { CommentEditor } from "@/components/client/comment-tools";

export function VariantEditor({ clientId, commentId, text }: { clientId: string; commentId: string; text: string }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <CommentEditor clientId={clientId} commentId={commentId} text={text} canEdit onDone={() => setEditing(false)} />;
  return (
    <div className="group relative">
      <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink">{text}</p>
      <button onClick={() => setEditing(true)} className="mt-1 text-xs text-brand hover:underline">
        ✎ Edit before submitting
      </button>
    </div>
  );
}
