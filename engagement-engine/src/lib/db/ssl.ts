import type { ConnectionOptions } from "node:tls";

/**
 * TLS for hosted Postgres. Set DATABASE_CA_CERT to the provider's CA certificate (PEM, or
 * base64 of the PEM) to verify the server — e.g. Supabase's "SSL certificate" download.
 * Without it, the connection string's own sslmode applies.
 */
export function sslOptions(): ConnectionOptions | undefined {
  const raw = process.env.DATABASE_CA_CERT?.trim();
  if (!raw) return undefined;
  const ca = raw.includes("BEGIN CERTIFICATE") ? raw.replace(/\\n/g, "\n") : Buffer.from(raw, "base64").toString("utf8");
  return { ca, rejectUnauthorized: true };
}

/** pg lets sslmode in the URL override the ssl object, so drop it when a CA is supplied. */
export function connectionString(url: string): string {
  if (!process.env.DATABASE_CA_CERT) return url;
  try {
    const u = new URL(url);
    u.searchParams.delete("sslmode");
    return u.toString();
  } catch {
    return url;
  }
}
