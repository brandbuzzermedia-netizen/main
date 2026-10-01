"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hashPassword, newToken, verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, checkPassword, createSessionToken, shareCookieName, shareUnlockValue, signInConfigured } from "@/lib/auth/session";
import { UploadError, isFile, saveImage } from "@/lib/data/files";
import {
  DEFAULT_BRAND, ReportExistsError, addInternalNote, createClient, createReport, createShare, deleteClient, findSharedReport, getClient, getReportDoc, getShare, removeShare, setSharePassword,
  applyTexts, setSettings, getReportRecord, getSession, reportId, restoreVersion, saveVersion, setBlock, setClientBrand, setReportStatus, setResolution, updateClient, updateReport, type Session,
} from "@/lib/data/repo";
import { parseReportForm } from "@/lib/report/parse";
import { analyze } from "@/lib/analysis";
import { blockText, variantCount } from "@/lib/copy/generators";
import { expand, shorten } from "@/lib/copy/edit";
import { resolveData } from "@/lib/report/conflicts";
import { aiConfigured } from "@/lib/ai/client";
import { AiError, writeReportText } from "@/lib/ai/write";
import { PLATFORM_LABELS, type Platform, type ReportStatus, type SourceShot } from "@/lib/report/types";
import type { BrandFormState, FormState, ReportFormState } from "@/lib/forms";
import { parseClientForm } from "@/lib/validation";


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

// ------------------------------------------------------------------ client share links

export async function createShareLink(fd: FormData) {
  await requireStaff();
  const id = String(fd.get("reportId"));
  await createShare(id, newToken());
  revalidatePath(`/reports/${id}`);
}

export async function removeShareLink(fd: FormData) {
  await requireStaff();
  const id = String(fd.get("reportId"));
  await removeShare(id);
  revalidatePath(`/reports/${id}`);
}

export async function setShareLinkPassword(fd: FormData) {
  await requireStaff();
  const id = String(fd.get("reportId"));
  const pw = String(fd.get("password") ?? "").trim();
  await setSharePassword(id, fd.get("clear") ? null : pw.length >= 6 ? await hashPassword(pw) : (await getShare(id))?.passwordHash ?? null);
  revalidatePath(`/reports/${id}`);
}

/** The client's password form on a protected link. */
export async function unlockShare(_: { error?: string }, fd: FormData): Promise<{ error?: string }> {
  const [client, month, token] = ["client", "month", "token"].map((k) => String(fd.get(k) ?? ""));
  const found = await findSharedReport(client, month, token);
  if (!found?.share.passwordHash) return { error: "This link is not available." };
  if (!(await verifyPassword(String(fd.get("password") ?? ""), found.share.passwordHash))) {
    return { error: "That password is not right. Ask Get Bee Seen for the report password." };
  }
  (await cookies()).set(shareCookieName(token), shareUnlockValue(token, found.share.passwordHash), {
    httpOnly: true, sameSite: "lax", path: "/report", maxAge: 60 * 60 * 24 * 30, secure: process.env.NODE_ENV === "production",
  });
  redirect(`/report/${client}/${month}/${token}`);
}

// ------------------------------------------------------------------ report text

/** One copy block: save, shorten, expand, next wording, or reset to generated. */
export async function editBlock(fd: FormData) {
  await requireStaff();
  const reportId = String(fd.get("reportId")), id = String(fd.get("block")), op = String(fd.get("op"));
  const doc = await getReportDoc(reportId);
  if (!doc) return;
  const A = analyze(resolveData(doc).data);
  const current = String(fd.get("text") ?? "").trim() || blockText(doc, A, id);
  if (op === "save") await setBlock(reportId, id, { text: current.slice(0, 2000) });
  else if (op === "shorten") await setBlock(reportId, id, { text: shorten(current) });
  else if (op === "expand") await setBlock(reportId, id, { text: expand(id, current, A).slice(0, 2000) });
  else if (op === "next") await setBlock(reportId, id, { text: null, variant: ((doc.variant[id] ?? 0) + 1) % variantCount(id, A) });
  else if (op === "reset") await setBlock(reportId, id, { text: null, variant: 0 });
  revalidatePath(`/reports/${reportId}`, "layout");
  redirect(`/reports/${reportId}/text#${encodeURIComponent(id)}`);
}

export async function saveTextVersion(fd: FormData) {
  const session = await requireStaff();
  const reportId = String(fd.get("reportId"));
  await saveVersion(reportId, String(fd.get("label") ?? "").trim().slice(0, 80) || "Saved by hand", session.name);
  revalidatePath(`/reports/${reportId}`, "layout");
}

export async function restoreTextVersion(fd: FormData) {
  const session = await requireStaff();
  const reportId = String(fd.get("reportId"));
  await restoreVersion(reportId, Number(fd.get("v")), session.name);
  revalidatePath(`/reports/${reportId}`, "layout");
}

export async function resetAllText(fd: FormData) {
  const session = await requireStaff();
  const reportId = String(fd.get("reportId"));
  await applyTexts(reportId, {}, "Reset to template text", session.name, true);
  revalidatePath(`/reports/${reportId}`, "layout");
}

// ------------------------------------------------------------------ settings

export async function saveDefaultTemplate(fd: FormData) {
  await requireStaff();
  const t = String(fd.get("template"));
  if (t === "premium" || t === "minimal" || t === "dark") await setSettings({ defaultTemplate: t });
  revalidatePath("/", "layout");
}

// ------------------------------------------------------------------ Claude

/** Claude rewrites the report text; only blocks that pass the grounding check are saved. */
export async function writeWithClaude(fd: FormData) {
  const session = await requireStaff();
  const reportId = String(fd.get("reportId"));
  const doc = await getReportDoc(reportId);
  if (!doc) return;
  let notice: string;
  if (!aiConfigured()) notice = "Claude is not set up on this server (ANTHROPIC_API_KEY).";
  else {
    try {
      const r = await writeReportText(doc);
      const n = Object.keys(r.accepted).length;
      await saveVersion(reportId, "Before Claude rewrite", session.name);
      if (n) await applyTexts(reportId, r.accepted, "Written by Claude", session.name);
      notice = `Claude rewrote ${n} block${n === 1 ? "" : "s"}.` + (r.rejected.length
        ? ` ${r.rejected.length} kept their current text: ${r.rejected.map((x) => `${x.id} (${x.reason})`).join("; ")}.`
        : " Every figure matched the report data.");
    } catch (e) {
      if (e instanceof AiError) notice = e.message;
      else throw e;
    }
  }
  revalidatePath(`/reports/${reportId}`, "layout");
  redirect(`/reports/${reportId}/text?notice=${encodeURIComponent(notice)}`);
}
