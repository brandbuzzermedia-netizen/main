import { NextResponse, type NextRequest } from "next/server";
import { analyze } from "@/lib/analysis";
import { getReportDoc, getSession } from "@/lib/data/repo";
import { renderPdf } from "@/lib/pdf/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** GET /api/reports/:id/pdf, the client report as an A4-landscape PDF. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await params;
  const doc = await getReportDoc(id);
  if (!doc) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  // Playwright loads the print page from this same server. Behind a proxy,
  // set PDF_RENDER_ORIGIN to the server's own address (e.g. http://127.0.0.1:3000).
  const origin = process.env.PDF_RENDER_ORIGIN || request.nextUrl.origin;
  try {
    const pdf = await renderPdf({
      url: `${origin}/print/reports/${encodeURIComponent(id)}`,
      cookies: request.cookies.getAll().map(({ name, value }) => ({ name, value })),
    });
    const month = analyze(doc.data).month.replace(" ", "-");
    const filename = `${fileSafe(doc.client.name)}_Monthly-Report_${month}_GBS.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("PDF render failed", e);
    return NextResponse.json(
      { error: "The PDF could not be generated. Use Print view and your browser's Save as PDF instead." },
      { status: 500 },
    );
  }
}
