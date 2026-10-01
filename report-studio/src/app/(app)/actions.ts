"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, checkPassword, createSessionToken, signInConfigured } from "@/lib/auth/session";
import { UploadError, isFile, saveImage } from "@/lib/data/files";
import {
  DEFAULT_BRAND, ReportExistsError, addInternalNote, createClient, createReport, deleteClient, getClient, getReportDoc,
  getReportRecord, getSession, reportId, setClientBrand, setReportStatus, setResolution, updateClient, updateReport, type Session,
} from "@/lib/data/repo";
import { parseReportForm, type FormErrors } from "@/lib/report/parse";
import { PLATFORM_LABELS, type Platform, type ReportStatus, type SourceShot } from "@/lib/report/types";
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

// ------------------------------------------------------------------ reports

export interface ReportFormState {
  errors?: FormErrors;
  error?: string;
}

const UPLOAD_PLATFORMS = Object.keys(PLATFORM_LABELS) as Platform[];

/** Creates a report (no "id" field) or replaces an existing report's data. */
export async function saveReport(_: ReportFormState, fd: FormData): Promise<ReportFormState> {
  await requireStaff();
  const get = (k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : null);
  const parsed = parseReportForm(get, get("content"), (k) => fd.getAll(k).filter((v): v is string => typeof v === "string"));
  if (!parsed.ok) return { errors: parsed.errors, error: "Some fields need attention. They are marked below." };

  const existingId = get("id");
  const clientId = existingId ? (await getReportRecord(existingId))?.clientId : get("clientId");
  if (!clientId || !(await getClient(clientId))) return { errors: { clientId: "Choose a client." } };
  const id = existingId || reportId(clientId, parsed.value.data.period.start);
  if (!existingId && (await getReportRecord(id))) {
    return { errors: { periodStart: "This client already has a report for that month. Open it from Reports to edit it." } };
  }

  // Screenshots: keep the ones still ticked, add new ones, skip exact duplicates.
  const before = existingId ? (await getReportDoc(existingId))?.uploads ?? {} : {};
  const uploads: Partial<Record<Platform, SourceShot[]>> = {};
  const seen = new Set<string>();
  let dupes = 0;
  try {
    for (const p of UPLOAD_PLATFORMS) {
      const keep = new Set(fd.getAll(`keep.${p}`).map(String));
      const list = (before[p] ?? []).filter((f) => f.hash && keep.has(f.hash));
      list.forEach((f) => seen.add(f.hash!));
      for (const file of fd.getAll(`shots.${p}`)) {
        if (!isFile(file)) continue;
        const saved = await saveImage(`reports/${id}/${p}`, file);
        if (seen.has(saved.hash)) { dupes++; continue; }
        seen.add(saved.hash);
        list.push({ name: saved.name, url: saved.url, hash: saved.hash });
      }
      if (list.length) uploads[p] = list;
    }
  } catch (e) {
    if (e instanceof UploadError) return { error: e.message };
    throw e;
  }

  try {
    if (existingId) await updateReport(id, parsed.value, uploads);
    else await createReport({ clientId, ...parsed.value }, uploads);
  } catch (e) {
    if (e instanceof ReportExistsError) return { errors: { periodStart: "This client already has a report for that month." } };
    throw e;
  }
  revalidatePath("/", "layout");
  redirect(`/reports/${id}${dupes ? `?duplicates=${dupes}` : ""}`);
}

const STATUSES: ReportStatus[] = ["Draft", "Pending", "Ready for review", "Delivered"];

export async function changeStatus(fd: FormData) {
  await requireStaff();
  const id = String(fd.get("reportId"));
  const status = String(fd.get("status")) as ReportStatus;
  if (STATUSES.includes(status)) await setReportStatus(id, status);
  revalidatePath("/", "layout");
}

// ------------------------------------------------------------------ client branding

export interface BrandFormState {
  error?: string;
  saved?: boolean;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function saveBrand(_: BrandFormState, fd: FormData): Promise<BrandFormState> {
  await requireStaff();
  const id = String(fd.get("clientId"));
  const client = await getClient(id);
  if (!client) return { error: "Client not found." };
  const primary = String(fd.get("primary") ?? ""), accent = String(fd.get("accent") ?? "");
  if (!HEX.test(primary) || !HEX.test(accent)) return { error: "Choose both brand colours." };
  const current = client.brand ?? DEFAULT_BRAND;
  const brand = { ...current, primary, accent };
  try {
    const logo = fd.get("logo"), cover = fd.get("cover");
    if (isFile(logo)) brand.logo = (await saveImage(`clients/${id}`, logo)).url;
    else if (fd.get("removeLogo")) brand.logo = null;
    if (isFile(cover)) brand.cover = (await saveImage(`clients/${id}`, cover)).url;
    else if (fd.get("removeCover")) brand.cover = null;
  } catch (e) {
    if (e instanceof UploadError) return { error: e.message };
    throw e;
  }
  await setClientBrand(id, brand);
  revalidatePath("/", "layout");
  return { saved: true };
}
