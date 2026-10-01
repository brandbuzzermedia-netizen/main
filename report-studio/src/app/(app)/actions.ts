"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  addInternalNote, createClient, deleteClient, getSession, setResolution, updateClient, type Session,
} from "@/lib/data/repo";
import { DEMO_COOKIE, demoAllowed, supabaseEnv } from "@/lib/supabase/env";
import { supabaseServer } from "@/lib/supabase/server";
import { parseClientForm, type FieldErrors } from "@/lib/validation";

export interface FormState {
  error?: string;
  fields?: FieldErrors;
}

/** Only agency staff may change data. RLS enforces the same in the database. */
async function requireStaff(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role === "client_viewer") throw new Error("Client viewers cannot change studio data.");
  return s;
}

const safeNext = (v: FormDataEntryValue | null) => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : "/");

export async function signIn(_: FormState, fd: FormData): Promise<FormState> {
  const next = safeNext(fd.get("next"));
  if (supabaseEnv()) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.signInWithPassword({ email: String(fd.get("email") ?? ""), password: String(fd.get("password") ?? "") });
    if (error) return { error: "That email and password did not match. Try again." };
  } else if (demoAllowed()) {
    (await cookies()).set(DEMO_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  } else {
    return { error: "Sign-in is not configured. Set the Supabase environment variables." };
  }
  redirect(next);
}

export async function signOut() {
  if (supabaseEnv()) await (await supabaseServer()).auth.signOut();
  else (await cookies()).delete(DEMO_COOKIE);
  redirect("/login");
}

export async function saveClient(_: FormState, fd: FormData): Promise<FormState> {
  const session = await requireStaff();
  const parsed = parseClientForm(fd);
  if (!parsed.ok) return { fields: parsed.errors };
  const id = typeof fd.get("id") === "string" ? (fd.get("id") as string) : "";
  let target: string;
  try {
    if (id) {
      await updateClient(id, parsed.value);
      target = id;
    } else {
      target = await createClient(session, parsed.value);
    }
  } catch {
    return { error: "The client could not be saved. Try again." };
  }
  revalidatePath("/", "layout");
  redirect(`/clients/${target}`);
}

export async function removeClient(fd: FormData) {
  await requireStaff();
  await deleteClient(String(fd.get("id")));
  revalidatePath("/", "layout");
  redirect("/clients");
}

export async function addNote(fd: FormData) {
  const session = await requireStaff();
  const reportId = String(fd.get("reportId"));
  const text = String(fd.get("text") ?? "").trim().slice(0, 2000);
  if (text) await addInternalNote(session, reportId, text);
  revalidatePath(`/reports/${reportId}`);
}

export async function chooseResolution(fd: FormData) {
  await requireStaff();
  const reportId = String(fd.get("reportId"));
  const choice = fd.get("choice");
  await setResolution(reportId, String(fd.get("metric")), choice === "reported" || choice === "calculated" ? choice : null);
  revalidatePath(`/reports/${reportId}`);
}
