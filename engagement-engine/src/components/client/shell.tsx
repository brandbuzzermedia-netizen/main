"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cx } from "@/components/ui";

export interface ShellClient {
  id: string;
  name: string;
  status: string;
  pending: number;
}

interface NavItem {
  label: string;
  href: string;
  badge?: number;
}

const CLIENT_SECTIONS: [string, string][] = [
  ["Dashboard", "dashboard"],
  ["Opportunities", "opportunities"],
  ["Approvals", "approvals"],
  ["Comments", "comments"],
  ["Publishing", "publishing"],
  ["Campaigns", "campaigns"],
  ["Audiences", "audiences"],
  ["Brand profile", "brand"],
  ["Social accounts", "accounts"],
  ["Analytics", "analytics"],
  ["Reports", "reports"],
  ["Settings", "settings"],
];

const COOKIE = "gbs_client";

/** Remembers the selected client (a UI preference only; every request re-checks access). */
function rememberClient(id: string) {
  document.cookie = `${COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 90}; samesite=lax`;
}

function clientFromPath(pathname: string): { id: string; rest: string } | null {
  const m = pathname.match(/^\/clients\/([0-9a-f-]{36})(\/.*)?$/i);
  return m ? { id: m[1], rest: m[2] ?? "/dashboard" } : null;
}

export function AppShell({
  user,
  isStaff,
  isSuperAdmin,
  clients,
  initialClientId,
  brandName,
  unread,
  children,
}: {
  user: { name: string; email: string; role: string };
  isStaff: boolean;
  isSuperAdmin: boolean;
  clients: ShellClient[];
  initialClientId: string | null;
  brandName: string;
  unread: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const fromPath = clientFromPath(pathname);
  const selectedId = fromPath?.id ?? initialClientId ?? (clients.length === 1 ? clients[0].id : null);
  const selected = clients.find((c) => c.id === selectedId) ?? null;

  // Remember the client in context so global links (Engagement, Approvals…) follow it.
  useEffect(() => {
    if (fromPath?.id) rememberClient(fromPath.id);
  }, [fromPath?.id]);

  // Close the mobile drawer whenever the route changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  const base = selected ? `/clients/${selected.id}` : null;
  const gbsNav: NavItem[] = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Clients", href: "/clients" },
    { label: "Engagement", href: base ? `${base}/opportunities` : "/clients" },
    { label: "Approvals", href: base ? `${base}/approvals` : "/clients", badge: selected?.pending },
    { label: "Publishing", href: base ? `${base}/publishing` : "/clients" },
    { label: "Analytics", href: "/analytics" },
    { label: "Team", href: "/team" },
    { label: "Integrations", href: "/integrations" },
    ...(isSuperAdmin ? [{ label: "Settings", href: "/settings" }, { label: "Audit log", href: "/audit" }] : []),
  ];

  const clientNav: NavItem[] = base
    ? CLIENT_SECTIONS.map(([label, seg]) => ({ label, href: `${base}/${seg}`, badge: seg === "approvals" ? selected?.pending : undefined }))
    : [];

  const isActive = (href: string) => pathname === href || (href !== "/dashboard" && href !== "/clients" && pathname.startsWith(href + "/"));

  const sidebar = (
    <nav aria-label="Main" className="gbs-dots flex h-full flex-col gap-5 overflow-y-auto px-3 pb-6 pt-5">
      <Link href={isStaff ? "/dashboard" : base ? `${base}/dashboard` : "/"} className="flex items-center gap-3 px-2" aria-label={`${brandName} Engagement Engine`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/badge.svg" alt="" className="h-11 w-11 shrink-0" />
        <span className="min-w-0 leading-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/wordmark-cream.svg" alt={brandName} className="h-[22px] w-auto max-w-[150px]" />
          <span className="mt-1 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent">Engagement Engine</span>
        </span>
      </Link>

      {(isStaff || clients.length > 1) && <ClientSwitcher clients={clients} selectedId={selectedId} />}

      {isStaff && <NavGroup items={gbsNav} isActive={isActive} />}

      {selected && (
        <div>
          <div className="mb-1.5 flex items-center justify-between px-2">
            <span className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">{isStaff ? selected.name : "Workspace"}</span>
          </div>
          <NavGroup items={clientNav} isActive={isActive} />
        </div>
      )}

      <div className="mt-auto rounded-2xl border-2 border-sidebar-ink/15 bg-sidebar-2 px-3 py-3 text-xs">
        <div className="truncate text-[13px] font-bold text-sidebar-ink">{user.name}</div>
        <div className="truncate text-sidebar-ink-2">{user.role}</div>
        <Link href="/account" className="mt-2 inline-block text-sidebar-ink-2 underline-offset-2 hover:text-sidebar-ink hover:underline">
          Your account
        </Link>
        <form action="/logout" method="post" className="mt-2">
          <button className="text-sidebar-ink-2 underline-offset-2 hover:text-sidebar-ink hover:underline">Sign out</button>
        </form>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="hidden bg-sidebar lg:sticky lg:top-0 lg:block lg:h-screen">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="absolute inset-0 bg-black/40" aria-label="Close navigation" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-sidebar shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b-2 border-brand bg-surface/95 px-4 backdrop-blur sm:px-6">
          <button
            className="gbs-press grid h-10 w-10 place-items-center rounded-full border-2 border-brand bg-accent text-brand shadow-hard-sm lg:hidden"
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
          >
            ☰
          </button>
          <div className="min-w-0 flex-1 truncate text-sm text-ink-2">
            {selected ? (
              <span>
                <span className="text-ink-3">{isStaff ? "Client · " : ""}</span>
                <span className="font-display text-[18px] text-brand">{selected.name}</span>
              </span>
            ) : (
              <span className="font-medium text-ink">{brandName}</span>
            )}
          </div>
          <Link href="/notifications" className="gbs-press relative grid h-10 w-10 place-items-center rounded-full border-2 border-brand bg-surface shadow-hard-sm" aria-label={`Notifications (${unread} unread)`}>
            <span aria-hidden>🔔</span>
            {unread > 0 && (
              <span className="tabular absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-bad px-1 text-center text-[10px] font-semibold leading-[18px] text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function NavGroup({ items, isActive }: { items: NavItem[]; isActive: (href: string) => boolean }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((it) => {
        const active = isActive(it.href);
        return (
          <li key={it.label}>
            <Link
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex items-center justify-between rounded-full px-3 py-1.5 text-[13.5px] transition",
                active ? "bg-accent font-bold text-green-ink shadow-[2px_2px_0_rgba(0,0,0,0.25)]" : "text-sidebar-ink-2 hover:bg-white/10 hover:text-sidebar-ink",
              )}
            >
              <span>{it.label}</span>
              {!!it.badge && (
                <span className={cx("tabular rounded-full px-1.5 text-[10px] font-bold leading-[17px]", active ? "bg-brand text-accent" : "bg-accent text-green-ink")}>{it.badge}</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function ClientSwitcher({ clients, selectedId }: { clients: ShellClient[]; selectedId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return clients.filter((c) => c.status !== "archived" && (!needle || c.name.toLowerCase().includes(needle)));
  }, [clients, q]);

  function choose(id: string) {
    rememberClient(id);
    const cur = clientFromPath(pathname);
    // Keep the same screen when switching clients (approvals → approvals). Detail pages fall back to the list.
    const section = cur ? cur.rest.split("/").slice(0, 2).join("/") : "/dashboard";
    router.push(`/clients/${id}${section}`);
  }

  return (
    <div className="rounded-2xl border-2 border-white/10 bg-sidebar-2/80 p-2">
      <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-ink-2">Clients</div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search clients…"
        aria-label="Search clients"
        className="mb-1.5 h-9 w-full rounded-full border-2 border-white/15 bg-black/20 px-3 text-[13px] text-sidebar-ink placeholder:text-sidebar-ink-2 focus:border-accent focus:outline-none"
      />
      <ul className="max-h-56 overflow-y-auto" role="listbox" aria-label="Select client">
        {shown.map((c) => (
          <li key={c.id}>
            <button
              role="option"
              aria-selected={c.id === selectedId}
              onClick={() => choose(c.id)}
              className={cx(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]",
                c.id === selectedId ? "bg-white/10 font-semibold text-accent ring-1 ring-accent/50" : "text-sidebar-ink-2 hover:bg-white/5 hover:text-sidebar-ink",
              )}
            >
              <span aria-hidden className={cx("h-2 w-2 shrink-0 rounded-full", c.status === "active" ? "bg-[#4cc387]" : c.status === "paused" ? "bg-accent" : "bg-white/30")} />
              <span className="flex-1 truncate">{c.name}</span>
              {c.pending > 0 && <span className="tabular text-[11px] text-accent">{c.pending}</span>}
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="px-2 py-1.5 text-[12px] text-sidebar-ink-2">No matching clients</li>}
      </ul>
    </div>
  );
}
