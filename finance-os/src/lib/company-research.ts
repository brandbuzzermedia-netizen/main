import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Facts about a prospect for a proposal, from two free sources: what the OS already knows (leads,
 * deals, clients) and the prospect's own website home page. Everything found here is untrusted
 * text; it is shown to a person and handed to the AI only as data.
 */

export type SiteFacts = { url: string; title: string; description: string; headings: string[]; text: string; emails: string[]; phones: string[]; social: string[] };
export type OsFacts = { contacts: { name: string; company: string; email: string | null; phone: string | null; social: string[] }[]; deals: { title: string; value: number; next: string | null }[]; client: string | null };

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return privateAddress(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** Normalises what a person typed ("acme.in", "www.acme.in/about") into an https URL, or null. */
export function normaliseUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password || !u.hostname.includes(".") || (u.port && !["80", "443"].includes(u.port))) return null;
    return u.toString();
  } catch { return null; }
}

async function safeFetch(url: string, hops = 0): Promise<Response | null> {
  const u = new URL(url);
  if (isIP(u.hostname)) return null; // only real domain names
  const addrs = await lookup(u.hostname, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some((a) => privateAddress(a.address))) return null;
  const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "user-agent": "Mozilla/5.0 (compatible; ProposalResearch/1.0)", accept: "text/html" } }).catch(() => null);
  if (!res) return null;
  if (res.status >= 300 && res.status < 400 && hops < 3) {
    const next = res.headers.get("location");
    const target = next ? normaliseUrl(new URL(next, u).toString()) : null;
    return target ? safeFetch(target, hops + 1) : null;
  }
  return res.ok ? res : null;
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const clean = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** Pure HTML reader (exported for tests). */
export function readHtml(html: string, url: string): SiteFacts {
  const meta = (name: string) => clean(html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i"))?.[1] ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, "i"))?.[1] ?? "");
  const body = html.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ");
  const headings = [...body.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((m) => clean(m[1])).filter((h) => h.length > 2 && h.length < 140);
  const paras = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => clean(m[1])).filter((p) => p.length > 40);
  const links = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
  const all = clean(body);
  return {
    url,
    title: clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 200),
    description: (meta("description") || meta("og:description")).slice(0, 400),
    headings: [...new Set(headings)].slice(0, 12),
    text: paras.join(" ").slice(0, 3000) || all.slice(0, 2000),
    emails: [...new Set(links.filter((l) => l.startsWith("mailto:")).map((l) => l.slice(7).split("?")[0]))].slice(0, 3),
    phones: [...new Set(links.filter((l) => l.startsWith("tel:")).map((l) => l.slice(4)))].slice(0, 3),
    social: [...new Set(links.filter((l) => /(instagram|facebook|linkedin|youtube|x)\.com\//i.test(l)).map((l) => l.split("?")[0]))].slice(0, 6),
  };
}

/** Reads the prospect's home page. Public addresses only, 8 seconds, 1.5 MB at most. */
export async function fetchWebsite(raw: string): Promise<SiteFacts | null> {
  const url = normaliseUrl(raw);
  if (!url) return null;
  const res = await safeFetch(url);
  if (!res || !(res.headers.get("content-type") ?? "").includes("html")) return null;
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < 1_500_000) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => undefined);
  return readHtml(new TextDecoder().decode(Buffer.concat(chunks)), res.url || url);
}

/** What the OS already holds about this company (leads, deals, clients), within what the viewer can read. */
export async function findInOs(db: SupabaseClient, org: string, company: string): Promise<OsFacts> {
  const q = `%${company.replace(/[%_,()]/g, " ").trim()}%`;
  const [{ data: contacts }, { data: deals }, { data: clients }] = await Promise.all([
    db.from("contacts").select("full_name, company_name, email, phone_e164, linkedin_url, facebook_url, instagram_handle").eq("organization_id", org).ilike("company_name", q).limit(5),
    db.from("deals").select("title, value_minor, next_action").eq("organization_id", org).ilike("account_name", q).limit(5),
    db.from("clients").select("legal_name").eq("organization_id", org).or(`legal_name.ilike.${q},trading_name.ilike.${q}`).limit(1),
  ]);
  return {
    contacts: (contacts ?? []).map((c) => ({ name: c.full_name, company: c.company_name, email: c.email, phone: c.phone_e164, social: [c.linkedin_url, c.facebook_url, c.instagram_handle ? `https://instagram.com/${c.instagram_handle}` : null].filter(Boolean) as string[] })),
    deals: (deals ?? []).map((d) => ({ title: d.title, value: Number(d.value_minor ?? 0) / 100, next: d.next_action })),
    client: clients?.[0]?.legal_name ?? null,
  };
}
