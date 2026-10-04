"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { buttonClass, type ButtonVariant } from "@/components/ui";

/** A modal confirmation built on <dialog>. Calls onConfirm only after explicit confirmation. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  confirmVariant = "primary",
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  confirmVariant?: ButtonVariant;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(92vw,460px)] rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/40"
    >
      <div className="px-5 pt-5">
        <h2 className="text-base font-semibold">{title}</h2>
        {body && <div className="mt-2 text-sm text-ink-2">{body}</div>}
        {children}
      </div>
      <div className="mt-5 flex justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">
        <button type="button" className={buttonClass("secondary")} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={buttonClass(confirmVariant)}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

/** A submit button that asks for confirmation before submitting its form. */
export function ConfirmSubmit({
  label,
  title,
  body,
  confirmLabel,
  variant = "secondary",
  size = "md",
  formId,
}: {
  label: ReactNode;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  formId?: string;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={btn} type="button" className={buttonClass(variant, size)} onClick={() => setOpen(true)}>
        {label}
      </button>
      <ConfirmDialog
        open={open}
        title={title}
        body={body}
        confirmLabel={confirmLabel}
        confirmVariant={variant === "danger" ? "danger" : "primary"}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          const form = formId ? (document.getElementById(formId) as HTMLFormElement | null) : btn.current?.closest("form");
          form?.requestSubmit();
        }}
      />
    </>
  );
}
