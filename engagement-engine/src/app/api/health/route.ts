import { NextResponse } from "next/server";
import { systemRunner } from "@/lib/db";

export async function GET() {
  try {
    await systemRunner((db) => db.query("select 1"));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
