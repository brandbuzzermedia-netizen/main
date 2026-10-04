"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { ForbiddenError, inClient, optStr, parseList, str } from "@/lib/server-action";

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

export async function saveBrand(clientId: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const website = optStr(fd.get("website"), 300);
    if (website) z.string().url().parse(website);
    const enums = {
      business_model: z.enum(["b2b", "b2c", "both"]).parse(fd.get("business_model") ?? "b2b"),
      comment_length: z.enum(["short", "medium", "long"]).parse(fd.get("comment_length") ?? "medium"),
      cta_style: z.enum(["none", "soft", "direct"]).parse(fd.get("cta_style") ?? "none"),
      emoji_policy: z.enum(["none", "sparing", "allowed"]).parse(fd.get("emoji_policy") ?? "sparing"),
    };
    const lists = Object.fromEntries(LIST_FIELDS.map((k) => [k, parseList(fd.get(k))]));
    lists.hashtags = lists.hashtags.map((h) => h.replace(/^#/, ""));
    await inClient(clientId, async ({ db, user, access }) => {
      if (!access.canManage) throw new ForbiddenError("Only GBS and the client owner can edit the brand profile.");
      const values = {
        company_name: z.string().min(1).max(120).parse(str(fd.get("company_name"), 120)),
        website,
        industry: optStr(fd.get("industry"), 120),
        description: optStr(fd.get("description"), 3000),
        usp: optStr(fd.get("usp"), 1000),
        target_market: optStr(fd.get("target_market"), 1000),
        location: optStr(fd.get("location"), 200),
        language: str(fd.get("language"), 60) || "English",
        ...enums,
        ...lists,
      };
      const cols = Object.keys(values);
      await db.query(
        `insert into brand_profiles (organization_id, client_id, ${cols.join(", ")}, updated_by)
         values ($1, $2, ${cols.map((_, i) => `$${i + 3}`).join(", ")}, $${cols.length + 3})
         on conflict (client_id) do update set ${cols.map((c) => `${c} = excluded.${c}`).join(", ")}, updated_by = excluded.updated_by, updated_at = now()`,
        [user.organizationId, clientId, ...Object.values(values), user.id],
      );
      await audit(db, { organizationId: user.organizationId, clientId, actorId: user.id, actorName: user.fullName, action: "brand.updated", entityType: "brand_profile", entityId: clientId });
    });
    revalidatePath(`/clients/${clientId}/brand`);
    return { ok: true, message: "Brand profile saved. New comments will use it." };
  } catch (e) {
    return toActionError(e);
  }
}

const ALLOWED_TYPES = ["text/plain", "text/markdown", "text/csv", "application/json"];
const ALLOWED_EXT = /\.(txt|md|markdown|csv|json)$/i;
const MAX_BYTES = 1_000_000;

export async function uploadDocument(clientId: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const kind = z.enum(["brand_guidelines", "company_profile", "product_catalog", "marketing"]).parse(fd.get("kind"));
    const title = z.string().min(1).max(160).parse(str(fd.get("title"), 160));
    const file = fd.get("file");
    const pasted = str(fd.get("content"), 200_000);
    let content = pasted;
    let fileName = "pasted.txt";
    let mime = "text/plain";
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_BYTES) throw new ForbiddenError("Files must be under 1 MB.");
      if (!ALLOWED_EXT.test(file.name) && !ALLOWED_TYPES.includes(file.type)) {
        throw new ForbiddenError("Upload .txt, .md, .csv or .json. For PDFs or Word files, paste the text instead.");
      }
      content = (await file.text()).replace(/\u0000/g, "");
      fileName = file.name.slice(0, 200);
      mime = file.type || "text/plain";
    }
    if (content.trim().length < 20) throw new ForbiddenError("The document is empty. Upload a file or paste at least a paragraph.");
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
        details: { title, kind },
      });
    });
    revalidatePath(`/clients/${clientId}/brand`);
    return { ok: true, message: "Document added. It's used as AI context for this client only." };
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
