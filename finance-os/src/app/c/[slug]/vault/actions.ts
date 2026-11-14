"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCompanyContext } from "@/lib/workspace";
import { MAX_UPLOAD_BYTES, safeFileName, sniffMime } from "@/lib/files";

export type VaultState = { error?: string; ok?: string };

export async function uploadDocumentAction(slug: string, _p: VaultState, fd: FormData): Promise<VaultState> {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("documents.write")) return { error: "Not allowed" };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "Files must be 15 MB or smaller." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime) return { error: "Only PDF and image files are accepted." };
  const kind = z.enum(["agreement", "lease", "certificate", "tax", "receipt", "other"]).catch("other").parse(fd.get("kind"));
  const restricted = fd.get("restricted") === "on" && ctx.can("finance.sensitive");
  const id = randomUUID();
  const path = `${ctx.company.id}/${id}/${safeFileName(file.name)}`;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const up = await ctx.supabase.storage.from("documents").upload(path, bytes, { contentType: mime });
  if (up.error) return { error: up.error.message };
  const { error } = await ctx.supabase.from("documents").insert({ id, organization_id: ctx.company.id, storage_path: path, file_name: file.name.slice(0, 200), mime_type: mime, size_bytes: file.size, sha256, kind, restricted, uploaded_by: ctx.userId });
  if (error) return { error: error.code === "23505" ? "This exact file is already in the vault." : error.message };
  revalidatePath(`/c/${slug}/vault`);
  return { ok: "Stored privately." };
}
