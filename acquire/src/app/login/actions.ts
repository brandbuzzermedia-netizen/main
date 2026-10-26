"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/env";

export type LoginState = { error?: string; sent?: boolean; email?: string };

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");

function allowed(email: string): boolean {
  const list = (process.env.AUTH_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length === 0 || list.includes(email);
}

function safeNext(next: FormDataEntryValue | null): string {
  const v = typeof next === "string" ? next : "/";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const email = parsed.data;
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  const supabase = await createClient();

  if (password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: "Email or password is incorrect.", email };
    redirect(next);
  }

  if (!allowed(email)) {
    // Same response as success, so the form doesn't reveal which emails are allowed.
    return { sent: true, email };
  }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) return { error: `Could not send the sign-in link: ${error.message}`, email };
  return { sent: true, email };
}
