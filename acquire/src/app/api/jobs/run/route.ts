import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronSecret } from "@/lib/env";
import { runDueSequences } from "@/lib/sequences";

export const maxDuration = 60;

/** Scheduled job: sends due sequence steps. Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: NextRequest) {
  const secret = cronSecret();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const summary = await runDueSequences(createAdminClient());
  return NextResponse.json(summary, { status: summary.errors.length ? 207 : 200 });
}
