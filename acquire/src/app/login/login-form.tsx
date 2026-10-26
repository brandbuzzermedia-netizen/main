"use client";

import { useActionState, useState } from "react";
import { login, type LoginState } from "./actions";
import { Alert, Button, Field, Input } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const [withPassword, setWithPassword] = useState(false);

  if (state.sent) {
    return (
      <Alert tone="ok" title="Check your inbox">
        If {state.email} has access, a sign-in link is on its way. The link expires in one hour.
      </Alert>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Work email" name="email">
        <Input name="email" type="email" autoComplete="email" required defaultValue={state.email} />
      </Field>
      {withPassword && (
        <Field label="Password" name="password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
      )}
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" disabled={pending}>
        {pending ? "Please wait…" : withPassword ? "Sign in" : "Email me a sign-in link"}
      </Button>
      <button type="button" className="text-sm text-muted underline-offset-2 hover:underline" onClick={() => setWithPassword((v) => !v)}>
        {withPassword ? "Use a magic link instead" : "Sign in with a password"}
      </button>
    </form>
  );
}
