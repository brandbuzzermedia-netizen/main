"use server";

import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";

/** Sets or changes the signed-in person's own password. Nobody else, including admins, can see it. */
export async function setPasswordAction(fd: FormData) {
  const { supabase } = await getUser();
  const pw = String(fd.get("password") ?? ""), again = String(fd.get("again") ?? "");
  const back = (note: string) => redirect(`/account/password?note=${encodeURIComponent(note)}`);
  if (pw.length < 10) back("Use at least 10 characters.");
  if (pw !== again) back("The two passwords do not match.");
  if (/^(.)\1+$/.test(pw) || /^(0123456789|1234567890|password\d*)$/i.test(pw)) back("That password is too easy to guess. Try three or four random words.");
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) back(error.message.includes("reauthentication") ? "For safety, sign in again with an email link, then set the password." : `Not saved: ${error.message}`);
  redirect("/account/password?done=1");
}
