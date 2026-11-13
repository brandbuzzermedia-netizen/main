import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { formatDateTime } from "@/domain/dates";
import { Alert, Badge, Card, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { UploadForm } from "./forms";

export const metadata: Metadata = { title: "Expenses & bills" };

export default async function BillsPage({ params, searchParams }: PageProps<"/c/[slug]/bills">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("documents.write") && !ctx.can("documents.read")) notFound();
  const { data } = await ctx.supabase.from("ocr_extractions")
    .select("id, status, is_mock, created_at, document:documents(id, file_name)").eq("organization_id", ctx.company.id).order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as unknown as { id: string; status: string; is_mock: boolean; created_at: string; document: { id: string; file_name: string } }[];
  const queue = rows.filter((r) => r.status === "extracted" || r.status === "failed");
  return (
    <>
      <PageHeader title="Expenses & bills" description="Upload a bill, check what was read beside the original, then submit it for approval. Nothing posts to the ledger without approval." />
      {(await searchParams).submitted && <div className="mb-4"><Alert tone="ok">Submitted for approval. An approver sees it on the Finance ledger.</Alert></div>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {ctx.can("documents.write") && <Card title="Upload a bill or receipt"><UploadForm slug={slug} /><p className="mt-3 text-xs text-muted">Batch: upload one after another; each lands in the review queue. Manual entry: upload the bill and type the fields, or add an expense directly on the <Link className="underline" href={`/c/${slug}/ledger`}>ledger</Link>.</p></Card>}
        <section className="min-w-0">
          <h2 className="mb-3 font-display text-2xl">Review queue · {queue.length}</h2>
          {rows.length === 0 ? <EmptyState title="No bills yet" /> : (
            <Table head={["Bill", "Uploaded", "Status", ""]}>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td>{r.document.file_name}{r.is_mock && <span className="ml-2 text-xs text-muted">(manual entry)</span>}</Td>
                  <Td className="whitespace-nowrap">{formatDateTime(r.created_at)}</Td>
                  <Td><Badge tone={r.status === "reviewed" ? "ok" : r.status === "rejected" ? "neutral" : "warn"}>{r.status === "extracted" ? "needs review" : r.status}</Badge></Td>
                  <Td><Link className="text-sm underline" href={`/c/${slug}/bills/${r.document.id}`}>{r.status === "extracted" || r.status === "failed" ? "Review" : "Open"}</Link></Td>
                </tr>
              ))}
            </Table>
          )}
        </section>
      </div>
    </>
  );
}
