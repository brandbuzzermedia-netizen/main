"use client";
import { useActionState } from "react";
import type { FormAction, FormState } from "@/lib/forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignInForm({ next, open, action: submit }: { next: string; open: boolean; action: FormAction<FormState> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(submit, {});
  return (
    <form action={action} className="grid w-full gap-3.5 rounded-[28px] bg-gbs-cream p-[30px] text-gbs-ink shadow-[0_30px_60px_-24px_rgba(0,0,0,.5)]">
      <div><Badge variant="bee">Client Report Studio</Badge></div>
      <h1 className="m-0 font-heading text-[32px] leading-[1.05] font-extrabold text-gbs-green">Sign in</h1>
      <input type="hidden" name="next" value={next} />
      <Label className="text-[#6B6558]">
        Your name
        <Input name="name" autoComplete="name" placeholder="Shown on internal notes" maxLength={60} className="border-[#EBDDBF] bg-white text-gbs-ink" />
      </Label>
      <Label className="text-[#6B6558]">
        Studio password
        <Input name="password" type="password" required={!open} autoComplete="current-password" className="border-[#EBDDBF] bg-white text-gbs-ink" />
      </Label>
      {state.error ? <p role="alert" className="text-[13px] font-medium text-[#B93815]">{state.error}</p> : null}
      <Button type="submit" variant="primary" size="lg" disabled={pending}>
        {pending ? "Signing in…" : "Enter studio"}
      </Button>
    </form>
  );
}
