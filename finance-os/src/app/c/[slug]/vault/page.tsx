import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { designFor } from "@/domain/design";
import { formatDate } from "@/domain/dates";
import { Cta, PageHead } from "@/components/dp/shell";
import { Modal } from "@/components/dp/modal";
import { ListView, NOTES } from "@/views/list";
import { VaultUpload } from "./upload";

export const metadata: Metadata = { title: "Vault" };

export default async function VaultPage({ params, searchParams }: PageProps<"/c/[slug]/vault">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("documents.read") && !ctx.can("documents.write")) notFound();
  const d = designFor(slug);
  const base = `/c/${slug}/vault`;
  const { data } = await ctx.supabase.from("documents").select("id, file_name, kind, restricted, created_at").eq("organization_id", ctx.company.id).order("created_at", { ascending: false }).limit(300);
  const [title, lines] = NOTES.vault;
  return (
    <>
      <PageHead own={d.own} treat={d.treat} title="Vault" right={ctx.can("documents.write") ? <Cta href={`${base}?add=1`}>+ Add</Cta> : undefined} />
      <ListView vm={{
        head: ["FILE", "TYPE", "ACCESS", "UPDATED"],
        rows: ((data ?? []) as { id: string; file_name: string; kind: string; restricted: boolean; created_at: string }[]).map((x) => ({
          a: x.file_name, b: x.kind[0].toUpperCase() + x.kind.slice(1), c: x.restricted ? "Owner, Finance" : "Vault access", d: formatDate(x.created_at.slice(0, 10)), href: `/c/${slug}/documents/${x.id}`,
        })),
        empty: "No documents yet. Bills uploaded under Finance also appear here.", noteTitle: title, noteLines: lines,
      }} />
      {sp.add && ctx.can("documents.write") && <Modal title="Add a document" closeHref={base}><VaultUpload slug={slug} canRestrict={ctx.can("finance.sensitive")} /></Modal>}
    </>
  );
}
