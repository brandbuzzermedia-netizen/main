// Claude features without a server. The report form posts screenshots to
// /api/extract; here that request is answered in the browser by the same
// extraction code the server uses, scoped to the chosen client and month.
import { extractFigures, type ExtractScope, type ImageInput } from "@/lib/ai/extract";
import { AiError } from "@/lib/ai/write";
import { monthLabel } from "@/lib/data/shared";
import { aiConfigured } from "./ai-client";
import * as db from "./store";

const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function extract(fd: FormData): Promise<Response> {
  if (!aiConfigured()) return json({ error: "Add your Anthropic API key in Settings to read screenshots with Claude." }, 503);
  const platform = fd.get("platform");
  if (platform !== "instagram" && platform !== "meta") return json({ error: "Unknown platform." }, 400);
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return json({ error: "Choose at least one screenshot first." }, 400);
  if (files.length > 6) return json({ error: "Read up to 6 screenshots at a time." }, 400);
  const images: ImageInput[] = [];
  for (const f of files) {
    if (!TYPES.has(f.type)) return json({ error: `${f.name} is not a PNG, JPG or WebP image.` }, 400);
    const b64 = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.readAsDataURL(f); });
    images.push({ mediaType: f.type as ImageInput["mediaType"], base64: b64 });
  }
  const client = db.getClient(String(fd.get("clientId") ?? ""));
  const start = String(fd.get("periodStart") ?? "");
  const scope: ExtractScope | undefined = client ? { clientName: client.name, handle: client.instagram, month: /^\d{4}-\d{2}-\d{2}$/.test(start) ? monthLabel(start) : null } : undefined;
  try {
    return json(await extractFigures(platform, images, scope));
  } catch (e) {
    if (e instanceof AiError) return json({ error: e.message }, 502);
    return json({ error: "The screenshots could not be read. Check your connection, or enter the figures by hand." }, 500);
  }
}

export function installLocalApi() {
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "/api/extract" && init?.body instanceof FormData) return extract(init.body);
    return real(input, init);
  };
}
