"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { ForbiddenError, inClient, optStr, parseList, str } from "@/lib/server-action";
import { extractDocumentText, normalizeText } from "@/lib/documents";

const LIST_FIELDS = [
  "products",
  "services",
  "brand_personality",
  "tone",
  "words_to_use",
  "words_to_avoid",
  "topics_to_avoid",
  "competitors",
  "claims_requiring_approval",
  "keywords",
  "hashtags",
] as const;

const TEXT_FIELDS: Record<string, number> = {
  website: 300,
  industry: 120,
  description: 3000,
  usp: 1000,
  target_market: 1000,
  location: 300,
};
const ENUMS = {
  business_model: z.enum(["b2b", "b2c", "both"]),
  comment_length: z.enum(["short", "medium", "long"]),
  cta_style: z.enum(["none", "soft", "direct"]),
  emoji_policy: z.enum(["none", "sparing", "allowed"]),
};

/**
 * Saves the brand fields present in the form (so wizard steps can save a subset).
 * With an `onboarding_step` field, marks that step complete and moves to the next.
 */
export async function saveBrand(clientId: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  let nextStep: number | null = null;
  try {
    const values: Record<string, unknown> = {};
    if (fd.has("company_name")) values.company_name = z.string().min(1, "Company name is required").max(120).parse(str(fd.get("company_name"), 120));
    if (fd.has("language")) values.language = str(fd.get("language"), 60) || "English";
    for (const [k, max] of Object.entries(TEXT_FIELDS)) if (fd.has(k)) values[k] = optStr(fd.get(k), max);
    if (values.website) z.string().url("Website must be a full URL, e.g. https://example.com").parse(values.website);
    for (const [k, schema] of Object.entries(ENUMS)) if (fd.has(k)) values[k] = schema.parse(fd.get(k));
    for (const k of LIST_FIELDS) {
      if (!fd.has(k)) continue;
      const xs = parseList(fd.get(k));
      values[k] = k === "hashtags" ? xs.map((h) => h.replace(/^#/, "")) : xs;
    }
    const step = fd.has("onboarding_step") ? z.coerce.number().int().min(1).max(12).parse(fd.get("onboarding_step")) : null;
    await inClient(clientId, async ({ db, user, access }) => {
      if (!access.canManage) throw new ForbiddenError("Only GBS and the client owner can edit the brand profile.");
      const cols = Object.keys(values);
      if (cols.length) {
        await db.query(
          `insert into brand_profiles (organization_id, client_id, company_name, updated_by)
           values ($1, $2, (select name from clients where id = $2), $3) on conflict (client_id) do nothing`,
          [user.organizationId, clientId, user.id],
        );
        await db.query(
          `update brand_profiles set ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")}, updated_by = $${cols.length + 2}, updated_at = now()
           where client_id = $1`,
          [clientId, ...Object.values(values), user.id],
        );
        if (fd.has("industry")) await db.query("update clients set industry = $2 where id = $1 and app.can_manage_client($1)", [clientId, values.industry]);
        await audit(db, { organizationId: user.organizationId, clientId, actorId: user.id, actorName: user.fullName, action: "brand.updated", entityType: "brand_profile", entityId: clientId, details: { fields: cols } });
      }
      if (step) {
        nextStep = Math.min(12, step + 1);
        await db.query(
          `update clients set onboarding_step = greatest(onboarding_step, $2),
             onboarding_completed_steps = case when $3 = any(onboarding_completed_steps) then onboarding_completed_steps else array_append(onboarding_completed_steps, $3) end
           where id = $1`,
          [clientId, nextStep, step],
        );
      }
    });
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath(`/clients/${clientId}`, "layout");
  if (nextStep) redirect(`/clients/${clientId}/onboarding?step=${nextStep}`);
  return { ok: true, message: "Brand profile saved. New comments will use it." };
}

export async function uploadDocument(clientId: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const kind = z.enum(["brand_guidelines", "company_profile", "product_catalog", "marketing"]).parse(fd.get("kind"));
    const title = z.string().min(1).max(160).parse(str(fd.get("title"), 160));
    const file = fd.get("file");
    let content = normalizeText(str(fd.get("content"), 200_000));
    let fileName = "pasted.txt";
    let mime = "text/plain";
    let note = "";
    if (file instanceof File && file.size > 0) {
      const doc = await extractDocumentText(file);
      content = doc.text;
      fileName = file.name.slice(0, 200);
      mime = doc.mime;
      if (doc.truncated) note = " It was long, so only the first 200,000 characters are kept.";
    }
    if (content.length < 20) throw new ForbiddenError("The document is empty. Upload a file or paste at least a paragraph.");
    await inClient(clientId, async ({ db, user, access }) => {
      if (!access.canManage) throw new ForbiddenError();
      const row = await db.one<{ id: string }>(
        `insert into brand_documents (organization_id, client_id, kind, title, file_name, mime_type, size_bytes, content_text, uploaded_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
        [user.organizationId, clientId, kind, title, fileName, mime, Buffer.byteLength(content), content, user.id],
      );
      await audit(db, {
        organizationId: user.organizationId,
        clientId,
        actorId: user.id,
        actorName: user.fullName,
        action: "document.uploaded",
        entityType: "brand_document",
        entityId: row!.id,
        details: { title, kind, file: fileName },
      });
    });
    revalidatePath(`/clients/${clientId}/brand`);
    return { ok: true, message: `Document added (${content.length.toLocaleString("en-IN")} characters of text). It's used as AI context for this client only.${note}` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteDocument(clientId: string, docId: string): Promise<ActionResult> {
  try {
    await inClient(clientId, async ({ db, user, access }) => {
      if (!access.canManage) throw new ForbiddenError();
      await db.query("delete from brand_documents where id = $1 and client_id = $2", [z.string().uuid().parse(docId), clientId]);
      await audit(db, { organizationId: user.organizationId, clientId, actorId: user.id, actorName: user.fullName, action: "document.deleted", entityType: "brand_document", entityId: docId });
    });
    revalidatePath(`/clients/${clientId}/brand`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
