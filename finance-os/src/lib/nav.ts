export type NavItem = { key: string; label: string; icon: string; href?: string; disabledReason?: string; badge?: string };

/** Only same-site relative paths may be used as redirect targets. */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\r\n]/.test(next)) return fallback;
  return next;
}
