"use client";

import { useActionState, useState } from "react";
import { login, verifyCode, type CodeState, type LoginState } from "./actions";
import { Alert, Button, Field, Input } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const [withPassword, setWithPassword] = useState(false);
  const [codeState, codeAction, codePending] = useActionState<CodeState, FormData>(verifyCode, {});
  const [haveCode, setHaveCode] = useState(false);

  if (state.sent || haveCode) {
    return (
      <form action={codeAction} className="flex flex-col gap-4">
        {state.sent && (
          <Alert tone="ok" title="Check your inbox">
            If {state.email} has access, an email with a sign-in code is on its way. Type the code here (best on iPhone), or tap the link in the email.
          </Alert>
        )}
        <input type="hidden" name="next" value={next} />
        <Field label="Email" name="email">
          <Input name="email" type="email" autoComplete="email" required defaultValue={state.email} />
        </Field>
        <Field label="Code from the email" name="code">
          <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,12}" maxLength={12} required placeholder="8 digits" />
        </Field>
        {codeState.error && <Alert tone="danger">{codeState.error}</Alert>}
        <Button type="submit" disabled={codePending}>{codePending ? "Please wait…" : "Sign in with the code"}</Button>
        <button type="button" className="text-sm text-muted underline-offset-2 hover:underline" onClick={() => { setHaveCode(false); window.location.reload(); }}>
          Send a new email
        </button>
      </form>
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
        {pending ? "Please wait…" : withPassword ? "Sign in" : "Email me a sign-in code"}
      </Button>
      <button type="button" className="text-sm text-muted underline-offset-2 hover:underline" onClick={() => setWithPassword((v) => !v)}>
        {withPassword ? "Use an email code instead" : "Sign in with a password"}
      </button>
      {!withPassword && (
        <button type="button" className="text-sm text-muted underline-offset-2 hover:underline" onClick={() => setHaveCode(true)}>
          I already have a code
        </button>
      )}
    </form>
  );
}
