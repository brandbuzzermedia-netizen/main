"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/action-result";
import { buttonClass, cx, type ButtonVariant } from "@/components/ui";

type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  onSuccess,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (r: ActionResult) => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
    }
  }, [state, resetOnSuccess, onSuccess]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      <FormMessage state={state} />
    </form>
  );
}

export function FormMessage({ state }: { state: ActionResult }) {
  if (!state?.message) return null;
  return (
    <p role="status" className={cx("mt-2 text-sm", state.ok ? "text-good" : "text-bad")}>
      {state.message}
    </p>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  pendingText,
  className,
  name,
  value,
  disabled,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  pendingText?: string;
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending || disabled} className={cx(buttonClass(variant, size), className)} aria-busy={pending}>
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}
