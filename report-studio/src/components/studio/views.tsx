// Shared studio building blocks: page header, stat row, status chip, report table.
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ClientRow, ReportSummary } from "@/lib/data/repo";
import { fDate } from "@/lib/format";
import { CountUp } from "./count-up";
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
          <b className="block font-heading text-[40px] leading-[1.05] font-bold text-heading">{typeof v === "number" ? <CountUp value={v} /> : v}</b>
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
                  <Button asChild size="sm"><Link href={`/reports/${r.id}/edit`}>Edit data</Link></Button>
                  <Button asChild size="sm"><a href={`/api/reports/${r.id}/pdf`}>Download PDF</a></Button>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">No data entered yet</span>
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

/** Every client with their latest report, for the dashboard and the clients page. */
export function ClientsTable({ clients, reports }: { clients: ClientRow[]; reports: ReportSummary[] }) {
  if (!clients.length) return <p className="text-muted-foreground">No clients yet. Add your first client to start a report.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>Client</TableHead><TableHead>Industry</TableHead><TableHead>Reports</TableHead><TableHead>Last report</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {clients.map((c) => {
          const rs = reports.filter((r) => r.clientId === c.id).sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1));
          const last = rs[0];
          return (
            <TableRow key={c.id}>
              <TableCell>
                <Link href={`/clients/${c.id}`} className="flex items-center gap-2.5 font-bold">
                  <ClientSwatch client={c} />
                  {c.name}
                </Link>
              </TableCell>
              <TableCell>{c.industry ?? "—"}</TableCell>
              <TableCell>{rs.length}</TableCell>
              <TableCell>{last?.month ?? "—"}</TableCell>
              <TableCell>{last ? <StatusChip status={last.status} /> : <span className="text-xs text-muted-foreground">No reports yet</span>}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm"><Link href={`/clients/${c.id}`}>Open</Link></Button>
                  <Button asChild size="sm" variant="primary"><Link href={last?.available ? `/create?from=${last.id}` : `/create?client=${c.id}`}>+ Monthly report</Link></Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** The client's logo, or their two brand colours, as a small mark. */
export function ClientSwatch({ client, size = 28 }: { client: ClientRow; size?: number }) {
  const b = client.brand;
  if (b?.logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={b.logo} alt="" width={size} height={size} className="rounded-md border border-border bg-white object-contain p-0.5" style={{ width: size, height: size }} />;
  }
  return (
    <span aria-hidden="true" className="inline-flex overflow-hidden rounded-md border border-border" style={{ width: size, height: size }}>
      <span style={{ flex: 1, background: b?.primary ?? "#3B2A21" }} />
      <span style={{ flex: 1, background: b?.accent ?? "#C9974A" }} />
    </span>
  );
}
