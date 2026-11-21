import { notFound, redirect } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";

/** Opens a vault document through a 60-second signed link, after RLS confirms the viewer may read it. */
export async function GET(_req: Request, { params }: RouteContext<"/c/[slug]/documents/[id]">) {
  const { slug, id } = await params;
  const ctx = await getCompanyContext(slug);
  const { data: doc } = await ctx.supabase.from("documents").select("storage_path").eq("id", id).eq("organization_id", ctx.company.id).maybeSingle();
  if (!doc) notFound();
  const { data } = await ctx.supabase.storage.from("documents").createSignedUrl(doc.storage_path as string, 60);
  if (!data?.signedUrl) notFound();
  redirect(data.signedUrl);
}
