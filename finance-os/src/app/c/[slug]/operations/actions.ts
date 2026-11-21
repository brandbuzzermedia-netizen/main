"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCompanyContext } from "@/lib/workspace";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
async function run(slug: string, fn: string, args: Record<string, unknown>) {
  const ctx = await getCompanyContext(slug);
  const { error } = await ctx.supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}/operations`);
}
export async function verifyBisAction(slug: string, fd: FormData) {
  await run(slug, "verify_bis", { p_product: z.uuid().parse(fd.get("id")), p_certificate: z.string().trim().min(4).parse(fd.get("certificate")),
    p_valid_until: date.parse(fd.get("valid_until")), p_document: z.uuid().parse(fd.get("document_id")) });
}
export async function verifyReraAction(slug: string, fd: FormData) {
  await run(slug, "verify_rera", { p_property: z.uuid().parse(fd.get("id")), p_registration: z.string().trim().min(6).parse(fd.get("registration")) });
}
export async function listProductAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  const { error } = await ctx.supabase.from("products").update({ listed: fd.get("listed") === "true" }).eq("id", z.uuid().parse(fd.get("id"))).eq("organization_id", ctx.company.id);
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}/operations`);
}
export async function decideAdAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  const { error } = await ctx.supabase.from("ad_approvals").update({ status: z.enum(["approved", "rejected"]).parse(fd.get("status")) }).eq("id", z.uuid().parse(fd.get("id"))).eq("organization_id", ctx.company.id);
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}/operations`);
}
