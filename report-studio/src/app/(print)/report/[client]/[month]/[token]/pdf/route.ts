import { NextResponse, type NextRequest } from "next/server";
import { analyze } from "@/lib/analysis";
import { isShareUnlocked, shareCookieName } from "@/lib/auth/session";
import { findSharedReport } from "@/lib/data/repo";
import { renderPdf } from "@/lib/pdf/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The shared report as a PDF, for the client. Same checks as the share page. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ client: string; month: string; token: string }> }) {
  const p = await params;
  const found = await findSharedReport(p.client, p.month, p.token);
  if (!found) return NextResponse.json({ error: "This report link is not available." }, { status: 404 });
  if (!isShareUnlocked(request.cookies.get(shareCookieName(p.token))?.value, p.token, found.share.passwordHash)) {
    return NextResponse.redirect(new URL(`/report/${p.client}/${p.month}/${p.token}`, request.url));
  }
  const origin = process.env.PDF_RENDER_ORIGIN || request.nextUrl.origin;
  try {
    const pdf = await renderPdf({
      url: `${origin}/report/${p.client}/${p.month}/${p.token}?print=1`,
      cookies: request.cookies.getAll().map(({ name, value }) => ({ name, value })),
    });
    const filename = `${fileSafe(found.doc.client.name)}_Monthly-Report_${analyze(found.doc.data).month.replace(" ", "-")}_GBS.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    console.error("Shared PDF render failed", e);
    return NextResponse.json({ error: "The PDF could not be generated. Try again in a moment." }, { status: 500 });
  }
}
