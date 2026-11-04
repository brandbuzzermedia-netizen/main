import { requireClientAccess } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { buildDailyReport } from "@/lib/engine/reports";
import { Card, CardBody, CardHeader, PageHeader, Stat, fmt, formatDate } from "@/components/ui";
import Link from "next/link";

export const metadata = { title: "Daily report" };

export default async function ReportsPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ date?: string }> }) {
  const { clientId } = await params;
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : new Date().toISOString().slice(0, 10);
  const { user } = await requireClientAccess(clientId);
  const { report, history } = await withUser(user.id, async (db) => ({
    report: await buildDailyReport(db, clientId, date),
    history: await db.query<{ report_date: string }>(
      "select to_char(report_date, 'YYYY-MM-DD') as report_date from daily_reports where client_id = $1 order by report_date desc limit 14",
      [clientId],
    ),
  }));
  return (
    <>
      <PageHeader
        eyebrow={report.clientName.toUpperCase()}
        title="Today's engagement report"
        description={formatDate(date)}
        actions={
          <form className="flex gap-2">
            <input type="date" name="date" defaultValue={date} aria-label="Report date" className="h-9 rounded-full border-2 border-brand/30 bg-surface-2 px-3 text-sm" />
            <button className="gbs-press h-9 rounded-full border-2 border-brand bg-surface px-4 text-sm font-semibold text-brand shadow-hard-sm">View</button>
          </form>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Opportunities" value={fmt(report.opportunities)} />
        <Stat label="Comments generated" value={fmt(report.generated)} />
        <Stat label="Approved" value={fmt(report.approved)} />
        <Stat label="Published" value={fmt(report.published)} />
        <Stat label="Replies" value={fmt(report.replies)} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top opportunity" />
          <CardBody>
            {report.topOpportunity ? (
              <>
                <p className="text-sm font-medium text-ink">
                  {report.topOpportunity.author ? `@${report.topOpportunity.author}` : "Unknown author"} · {report.topOpportunity.score}/100
                </p>
                <p className="mt-1 text-sm text-ink-2">{report.topOpportunity.explanation}</p>
              </>
            ) : (
              <p className="text-sm text-ink-3">No opportunities on this day.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Top comment" description="Best-performing published comment in the last 7 days" />
          <CardBody>
            {report.topComment ? (
              <>
                <p className="text-[15px] leading-relaxed text-ink">“{report.topComment.text}”</p>
                <p className="mt-2 text-xs text-ink-3">
                  {report.topComment.platform} · {report.topComment.likes} likes · {report.topComment.replies} replies
                </p>
              </>
            ) : (
              <p className="text-sm text-ink-3">Nothing published recently.</p>
            )}
          </CardBody>
        </Card>
      </div>
      {history.length > 0 && (
        <p className="mt-6 text-xs text-ink-3">
          Saved reports:{" "}
          {history.map((h, i) => (
            <span key={h.report_date}>
              {i > 0 && " · "}
              <Link href={`?date=${h.report_date}`} className="text-brand hover:underline">
                {formatDate(h.report_date)}
              </Link>
            </span>
          ))}
        </p>
      )}
    </>
  );
}
