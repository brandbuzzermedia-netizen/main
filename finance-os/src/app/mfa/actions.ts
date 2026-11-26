"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/nav";

export type MfaState = { error?: string; factorId?: string; qr?: string; secret?: string };

/** Starts TOTP enrolment. Unfinished earlier attempts are cleared first so only one is pending. */
export async function enrollAction(): Promise<MfaState> {
  const { supabase } = await getUser();
  const { data: list } = await supabase.auth.mfa.listFactors();
  for (const f of list?.all ?? []) if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
  if (error) return { error: error.message };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Verifies a 6-digit code. On success the session is upgraded to aal2 and the person continues. */
export async function verifyAction(prev: MfaState, fd: FormData): Promise<MfaState> {
  const { supabase } = await getUser();
  const code = z.string().trim().regex(/^\d{6}$/).safeParse(fd.get("code"));
  if (!code.success) return { ...prev, error: "Enter the 6-digit code from your authenticator app." };
  const factorId = z.uuid().safeParse(fd.get("factor_id"));
  if (!factorId.success) return { ...prev, error: "Start again: the setup expired." };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factorId.data, code: code.data });
  if (error) return { ...prev, error: "That code did not match. Check the time on your phone and try the next code." };
  redirect(safeNextPath(String(fd.get("next") ?? ""), "/"));
}
