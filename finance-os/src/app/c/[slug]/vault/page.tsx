import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { formatDateTime } from "@/domain/dates";
import { Badge, Card, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { VaultUpload } from "./upload";

export const metadata: Metadata = { title: "Vault" };

export default async function VaultPage({ params }: PageProps<"/c/[slug]/vault">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("documents.read") && !ctx.can("documents.write")) notFound();
  const { data } = await ctx.supabase.from("documents").select("id, file_name, kind, mime_type, size_bytes, restricted, created_at").eq("organization_id", ctx.company.id).order("created_at", { ascending: false }).limit(500);
  const rows = data ?? [];
  return (
    <>
      <PageHeader title="Vault" description="Private storage for this company only. Files open through short-lived links; originals are never deleted by the app. Never store passwords, OTPs or card details here." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {rows.length === 0 ? <EmptyState title="No documents yet" /> : (
          <Table head={["File", "Kind", "Size", "Uploaded", ""]}>
            {rows.map((d) => (
              <tr key={d.id as string}>
                <Td>{d.file_name as string} {d.restricted && <Badge tone="danger">Restricted</Badge>}</Td><Td><Badge>{d.kind as string}</Badge></Td>
                <Td numeric>{Math.max(1, Math.round(Number(d.size_bytes) / 1024))} KB</Td><Td className="whitespace-nowrap">{formatDateTime(d.created_at as string)}</Td>
                <Td><a className="text-sm underline" href={`/c/${slug}/documents/${d.id}`} target="_blank" rel="noreferrer">Open</a></Td>
              </tr>
            ))}
          </Table>
        )}
        {ctx.can("documents.write") && <Card title="Add a document"><VaultUpload slug={slug} canRestrict={ctx.can("finance.sensitive")} /></Card>}
      </div>
    </>
  );
}
