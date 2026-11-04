import { PlatformApiError } from "./types";

export type FetchLike = typeof fetch;

export interface HttpOptions {
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  form?: Record<string, string>;
  headers?: Record<string, string>;
  bearer?: string;
}

/** Thin JSON client. Classifies platform errors; never retries on its own (the queue does, with back-off). */
export async function requestJson<T>(
  fetchImpl: FetchLike,
  url: string,
  opts: HttpOptions,
  classify: (status: number, body: unknown, headers: Headers) => PlatformApiError,
): Promise<T> {
  const u = new URL(url);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) u.searchParams.set(k, String(v));
  const headers: Record<string, string> = { Accept: "application/json", ...(opts.headers ?? {}) };
  if (opts.bearer) headers.Authorization = `Bearer ${opts.bearer}`;
  let body: string | undefined;
  if (opts.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(opts.form).toString();
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetchImpl(u.toString(), {
    method: opts.method ?? "GET",
    headers,
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) throw classify(res.status, parsed, res.headers);
  return parsed as T;
}

export function retryAfter(headers: Headers): number | null {
  const v = headers.get("retry-after");
  return v && /^\d+$/.test(v) ? Number(v) : null;
}

export function tokenize(text: string): string[] {
  return text.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}#@\s]/gu, " ").split(/\s+/).filter(Boolean);
}
