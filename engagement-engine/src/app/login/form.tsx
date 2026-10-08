"use client";

import { useActionState } from "react";
import { login } from "./actions";
import { inputClass, buttonClass } from "@/components/ui";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-2">
        Email
        <input name="email" type="email" autoComplete="username" required defaultValue={typeof state?.data?.email === "string" ? state.data.email : ""} key={String(state?.data?.email ?? "")} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-2">
        Password
        <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </label>
      {state?.message && (
        <p role="alert" className="text-sm text-bad">
          {state.message}
        </p>
      )}
      <button className={buttonClass("primary") + " mt-2 h-11 w-full"} disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
