"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, checkPassword, createSessionToken, signInConfigured } from "@/lib/auth/session";
import {
  addInternalNote, createClient, deleteClient, getSession, setResolution, updateClient, type Session,
} from "@/lib/data/repo";
import { parseClientForm, type FieldErrors } from "@/lib/validation";

export interface FormState {
  error?: string;
  fields?: FieldErrors;
}

/** Every change requires a valid, signed session. */
async function requireStaff(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

const safeNext = (v: FormDataEntryValue | null) => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : "/");

export async function signIn(_: FormState, fd: FormData): Promise<FormState> {
  const next = safeNext(fd.get("next"));
  if (!signInConfigured()) return { error: "Sign-in is not configured. Set STUDIO_PASSWORD on the server." };
  if (!checkPassword(String(fd.get("password") ?? ""))) return { error: "That password is not right. Try again." };
  const name = String(fd.get("name") ?? "").trim().slice(0, 60) || "GBS team";
  const { value, maxAge } = createSessionToken(name);
  (await cookies()).set(SESSION_COOKIE, value, { httpOnly: true, sameSite: "lax", path: "/", maxAge, secure: process.env.NODE_ENV === "production" });
  redirect(next);
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function saveClient(_: FormState, fd: FormData): Promise<FormState> {
  await requireStaff();
  const parsed = parseClientForm(fd);
  if (!parsed.ok) return { fields: parsed.errors };
  const id = typeof fd.get("id") === "string" ? (fd.get("id") as string) : "";
  let target: string;
  try {
    if (id) {
      await updateClient(id, parsed.value);
      target = id;
    } else {
      target = await createClient(parsed.value);
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
