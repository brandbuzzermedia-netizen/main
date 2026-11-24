"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/env";

export type LoginState = { error?: string; sent?: boolean; email?: string };

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");

/** Allowed when there is no allowlist, the email is on it, or an owner has an open invitation for it. */
async function allowed(email: string): Promise<boolean> {
  const list = (process.env.AUTH_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0 || list.includes(email)) return true;
  try {
    const { data } = await createAdminClient().rpc("invitation_open", { p_email: email });
    return data === true;
  } catch {
    return false;
  }
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

  if (!(await allowed(email))) {
    // Same response as success, so the form doesn't reveal which emails are allowed.
    return { sent: true, email };
  }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) return { error: /rate limit|security purposes/i.test(error.message)
    ? "Too many sign-in emails were sent in the last hour. Use the code from an email you already have, sign in with a password, or try again in an hour."
    : `Could not send the sign-in email: ${error.message}`, email };
  return { sent: true, email };
}

export type CodeState = { error?: string };

/**
 * Signs in with the code from the sign-in email. Works in any browser and in the installed iPhone app,
 * because nothing has to be opened from the email.
 */
export async function verifyCode(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  const token = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (!parsed.success || token.length < 6 || token.length > 10) return { error: "Enter the code from the email." };
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: parsed.data, token, type: "email" });
  if (error) return { error: "That code is wrong or has expired. Use the code from the latest email, or send a new one." };
  redirect(safeNext(formData.get("next")));
}
