"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/action-result";
import { buttonClass, cx, type ButtonVariant } from "@/components/ui";

type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

const PendingContext = createContext<boolean | null>(null);

/**
 * Form bound to a server action. Unlike a plain `<form action>`, it does not clear the
 * user's input when the action fails — React resets uncontrolled forms after an action,
 * which would wipe a long form on a validation error. It resets only on success when asked.
 */
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
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => formAction(fd));
  }

  return (
    <PendingContext.Provider value={pending}>
      <form ref={ref} onSubmit={onSubmit} className={className}>
        {children}
        <FormMessage state={state} />
      </form>
    </PendingContext.Provider>
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
  const ctx = useContext(PendingContext);
  const status = useFormStatus();
  const pending = ctx ?? status.pending;
  return (
    <button type="submit" name={name} value={value} disabled={pending || disabled} className={cx(buttonClass(variant, size), className)} aria-busy={pending}>
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}
