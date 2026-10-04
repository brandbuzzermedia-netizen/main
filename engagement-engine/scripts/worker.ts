/**
 * Background worker: publishing queue, scheduled discovery, metrics and daily reports.
 * Usage: npm run worker            (loops)
 *        npm run worker -- --once  (one pass, for cron)
 */
import { systemRunner, getPool } from "../src/lib/db";
import { processDueJobs } from "../src/lib/engine/publisher";
import { runDiscovery } from "../src/lib/engine/discovery";
import { collectMetrics } from "../src/lib/engine/metrics";
import { generateDailyReports } from "../src/lib/engine/reports";

const once = process.argv.includes("--once");
const workerId = `worker-${process.pid}`;
let stopping = false;
let lastReportDate = "";

export async function discoveryPass() {
  // Active campaigns that haven't run in the last 2 hours, oldest first.
  const due = await systemRunner((db) =>
    db.query<{ id: string; client_id: string }>(
      `select ca.id, ca.client_id from campaigns ca join clients cl on cl.id = ca.client_id
       where ca.status = 'active' and cl.status = 'active'
         and (ca.last_discovery_at is null or ca.last_discovery_at < now() - interval '2 hours')
       order by ca.last_discovery_at nulls first limit 20`,
    ),
  );
  for (const c of due) {
    try {
      const r = await runDiscovery(systemRunner, systemRunner, { clientId: c.client_id, campaignId: c.id, actor: { id: null, name: "Scheduler" } });
      console.log(`[discovery] campaign ${c.id}: +${r.created} (${r.errors.join("; ") || "ok"})`);
    } catch (e) {
      console.error(`[discovery] campaign ${c.id}: ${(e as Error).message}`);
    }
  }
}

async function tick(n: number) {
  const published = await processDueJobs(systemRunner, { limit: 10, workerId });
  if (published.length) console.log(`[publish] ${published.map((p) => `${p.jobId}:${p.status}`).join(", ")}`);
  if (n % 60 === 0) await discoveryPass(); // every ~30 minutes
  if (n % 360 === 0) console.log("[metrics]", await collectMetrics(systemRunner)); // every ~3 hours
  // Daily reports once a day after 20:00 IST (14:30 UTC).
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (lastReportDate !== today && (now.getUTCHours() > 14 || (now.getUTCHours() === 14 && now.getUTCMinutes() >= 30))) {
    lastReportDate = today;
    console.log("[reports] generated for", await generateDailyReports(systemRunner, today), "clients");
  }
}

async function main() {
  process.on("SIGTERM", () => (stopping = true));
  process.on("SIGINT", () => (stopping = true));
  if (once) {
    await tick(0);
  } else {
    for (let n = 0; !stopping; n++) {
      try {
        await tick(n);
      } catch (e) {
        console.error("[worker]", (e as Error).message);
      }
      await new Promise((r) => setTimeout(r, 30_000));
    }
  }
  await getPool().end();
}

main();
