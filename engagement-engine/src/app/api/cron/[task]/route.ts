import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { systemRunner } from "@/lib/db";
import { processDueJobs } from "@/lib/engine/publisher";
import { collectMetrics } from "@/lib/engine/metrics";
import { generateDailyReports } from "@/lib/engine/reports";
import { runDiscovery } from "@/lib/engine/discovery";

/** For serverless deployments: call with `Authorization: Bearer $CRON_SECRET`. */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || got.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

export async function POST(req: Request, { params }: { params: Promise<{ task: string }> }) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  const { task } = await params;
  switch (task) {
    case "publish":
      return NextResponse.json(await processDueJobs(systemRunner, { limit: 20, workerId: "cron" }));
    case "metrics":
      return NextResponse.json(await collectMetrics(systemRunner));
    case "reports":
      return NextResponse.json({ clients: await generateDailyReports(systemRunner) });
    case "discovery": {
      const due = await systemRunner((db) =>
        db.query<{ id: string; client_id: string }>(
          `select ca.id, ca.client_id from campaigns ca join clients cl on cl.id = ca.client_id
           where ca.status = 'active' and cl.status = 'active' and (ca.last_discovery_at is null or ca.last_discovery_at < now() - interval '2 hours')
           order by ca.last_discovery_at nulls first limit 10`,
        ),
      );
      const out = [];
      for (const c of due) {
        out.push(await runDiscovery(systemRunner, systemRunner, { clientId: c.client_id, campaignId: c.id, actor: { id: null, name: "Scheduler" } }).catch((e: Error) => ({ campaignId: c.id, error: e.message })));
      }
      return NextResponse.json(out);
    }
    default:
      return new NextResponse("Unknown task", { status: 404 });
  }
}
