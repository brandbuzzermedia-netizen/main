import { NextResponse, type NextRequest } from "next/server";
import { fileSignatureValid } from "@/lib/auth/session";
import { readStoredFile } from "@/lib/data/files";
import { getSession } from "@/lib/data/repo";

export const runtime = "nodejs";

/** GET /api/files/..., an uploaded image: for signed-in staff, or with a valid signed link from a client share page. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const q = req.nextUrl.searchParams;
  const signed = fileSignatureValid(req.nextUrl.pathname, q.get("e"), q.get("s"));
  if (!signed && !(await getSession())) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const file = await readStoredFile((await params).path.join("/"));
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: { "Content-Type": file.type, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
