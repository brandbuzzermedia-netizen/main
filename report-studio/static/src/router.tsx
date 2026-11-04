// A small in-memory router. Links inside the studio keep their real paths
// (/clients/thrishank, /api/reports/x/pdf); clicks on them are caught here.
import { useSyncExternalStore } from "react";

let path = "/";
const subs = new Set<() => void>();
export const currentPath = () => path;
export function navigate(to: string) {
  // No server here: "Download PDF" opens the PDF pages and the browser's Save as PDF.
  const pdf = /^\/api\/reports\/([^/]+)\/pdf/.exec(to);
  path = pdf ? `/print/reports/${pdf[1]}?save=1` : to;
  subs.forEach((s) => s());
  window.scrollTo(0, 0);
}
export const usePath = () => useSyncExternalStore((s) => (subs.add(s), () => subs.delete(s)), () => path);

export function installLinkInterceptor() {
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const a = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
    const href = a?.getAttribute("href");
    if (!href || !href.startsWith("/")) return;
    e.preventDefault();
    navigate(href);
  });
}

/** Matches "/reports/:id/edit" style patterns; returns params or null. */
export function match(pattern: string, p: string): Record<string, string> | null {
  const [pathOnly] = p.split("?");
  const a = pattern.split("/"), b = pathOnly.split("/");
  if (a.length !== b.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) out[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return out;
}
export const query = (p: string) => new URLSearchParams(p.split("?")[1] ?? "");
