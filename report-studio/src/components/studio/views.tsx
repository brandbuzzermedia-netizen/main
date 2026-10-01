// Shared studio building blocks: page header, stat row, status chip, report table.
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ReportSummary } from "@/lib/data/repo";
import { fDate } from "@/lib/format";
import type { ReportStatus } from "@/lib/report/types";

export function PageHeader({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="m-0 font-heading text-[34px] leading-[1.1] font-extrabold text-heading">{title}</h1>
        {sub ? <div className="mt-1 text-muted-foreground">{sub}</div> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function Stats({ items }: { items: [React.ReactNode, string][] }) {
  return (
    <div className="mb-[22px] grid grid-cols-4 rounded-[20px] border border-border bg-card max-[860px]:grid-cols-2">
      {items.map(([v, l], i) => (
        <div key={l} className={`px-[22px] py-[18px] ${i ? "border-l border-border" : ""} max-[860px]:[&:nth-child(3)]:border-l-0 max-[860px]:[&:nth-child(n+3)]:border-t`}>
          <b className="block font-heading text-[40px] leading-[1.05] font-bold text-heading">{v}</b>
          <span className="text-[12.5px] text-muted-foreground">{l}</span>
        </div>
      ))}
    </div>
  );
}

export function StatusChip({ status }: { status: ReportStatus }) {
  const variant = status === "Delivered" ? "ok" : status === "Ready for review" ? "bee" : status === "Pending" ? "warn" : "default";
  return <Badge variant={variant}>{status}</Badge>;
}

export function ReportsTable({ reports, showClient = true }: { reports: ReportSummary[]; showClient?: boolean }) {
  if (!reports.length) return <p className="text-muted-foreground">No reports yet.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showClient ? <TableHead>Client</TableHead> : null}
          <TableHead>Month</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reports.map((r) => (
          <TableRow key={r.id}>
            {showClient ? <TableCell><b>{r.clientName}</b></TableCell> : null}
            <TableCell>{r.month}</TableCell>
            <TableCell><StatusChip status={r.status} /></TableCell>
            <TableCell>{fDate(r.createdAt)}</TableCell>
            <TableCell>
              {r.available ? (
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm"><Link href={`/reports/${r.id}`}>View</Link></Button>
                  <Button asChild size="sm"><a href={`/api/reports/${r.id}/pdf`}>Download PDF</a></Button>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">No data uploaded yet</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Placeholder for studio areas scheduled in later build steps. */
export function ComingInStep({ title, step, children }: { title: string; step: number; children: React.ReactNode }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="rounded-[20px] border border-border bg-card p-5">
        <Badge>Build step {step}</Badge>
        <div className="mt-3 max-w-prose text-[13.5px] text-muted-foreground">{children}</div>
      </div>
    </>
  );
}
