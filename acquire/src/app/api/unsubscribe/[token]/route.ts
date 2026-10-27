import { NextResponse, type NextRequest } from "next/server";
import { unsubscribe } from "@/lib/unsubscribe";

/** RFC 8058 one-click unsubscribe (mail clients POST here). A GET shows the confirmation page. */
export async function POST(_request: NextRequest, { params }: RouteContext<"/api/unsubscribe/[token]">) {
  const { token } = await params;
  const r = await unsubscribe(token);
  return new NextResponse(r.ok ? "Unsubscribed" : "Invalid link", { status: r.ok ? 200 : 400 });
}

export async function GET(request: NextRequest, { params }: RouteContext<"/api/unsubscribe/[token]">) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/u/${encodeURIComponent(token)}`, request.nextUrl.origin));
}
