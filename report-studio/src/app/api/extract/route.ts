import { NextResponse, type NextRequest } from "next/server";
import { aiConfigured } from "@/lib/ai/client";
import { extractFigures, type ImageInput } from "@/lib/ai/extract";
import { AiError } from "@/lib/ai/write";
import { MAX_UPLOAD_BYTES, isFile } from "@/lib/data/files";
import { getSession } from "@/lib/data/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** POST /api/extract: platform + up to 6 screenshots in, figures with confidence out. Nothing is saved. */
export async function POST(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!aiConfigured()) return NextResponse.json({ error: "Claude is not set up on this server (ANTHROPIC_API_KEY)." }, { status: 503 });
  const fd = await request.formData();
  const platform = fd.get("platform");
  if (platform !== "instagram" && platform !== "meta") return NextResponse.json({ error: "Unknown platform." }, { status: 400 });
  const files = fd.getAll("files").filter(isFile);
  if (!files.length) return NextResponse.json({ error: "Choose at least one screenshot first." }, { status: 400 });
  if (files.length > 6) return NextResponse.json({ error: "Read up to 6 screenshots at a time." }, { status: 400 });
  const images: ImageInput[] = [];
  for (const f of files) {
    if (!TYPES.has(f.type)) return NextResponse.json({ error: `${f.name} is not a PNG, JPG or WebP image.` }, { status: 400 });
    if (f.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: `${f.name} is larger than 10 MB.` }, { status: 400 });
    images.push({ mediaType: f.type as ImageInput["mediaType"], base64: Buffer.from(await f.arrayBuffer()).toString("base64") });
  }
  try {
    return NextResponse.json(await extractFigures(platform, images));
  } catch (e) {
    if (e instanceof AiError) return NextResponse.json({ error: e.message }, { status: 502 });
    console.error("Extraction failed", e);
    return NextResponse.json({ error: "The screenshots could not be read. Enter the figures by hand." }, { status: 500 });
  }
}
