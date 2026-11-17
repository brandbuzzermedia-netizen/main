import { NextResponse, type NextRequest } from "next/server";
import { getCompanyContext } from "@/lib/workspace";

/**
 * Plays an AI call recording inside the OS. The audio stays with the voice provider (ElevenLabs)
 * and is fetched on demand with the server-side key, so no recording link is ever public.
 * Only people who can read every lead, or the lead's own owner, can listen; nothing is cached.
 */
export async function GET(_request: NextRequest, { params }: RouteContext<"/c/[slug]/calls/[id]/audio">) {
  const { slug, id } = await params;
  const ctx = await getCompanyContext(slug);
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data: call } = await ctx.supabase.from("voice_calls").select("external_id, contact:contacts(owner_id)").eq("id", id).eq("organization_id", ctx.company.id).maybeSingle();
  const owner = (call?.contact as unknown as { owner_id: string | null } | null)?.owner_id;
  if (!call || !(ctx.can("crm.read_all") || owner === ctx.userId)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!call.external_id) return NextResponse.json({ error: "no_recording" }, { status: 404 });
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return NextResponse.json({ error: "Recordings need ELEVENLABS_API_KEY in the OS settings." }, { status: 503 });
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(call.external_id)}/audio`, { headers: { "xi-api-key": key }, cache: "no-store" });
  if (!res.ok || !res.body) return NextResponse.json({ error: "recording_unavailable" }, { status: res.status === 404 ? 404 : 502 });
  return new NextResponse(res.body, { headers: { "content-type": res.headers.get("content-type") ?? "audio/mpeg", "cache-control": "private, no-store" } });
}
