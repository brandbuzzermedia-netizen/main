import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { PLATFORM_LABELS, type Platform } from "@/lib/platforms/types";

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

// ───────────── Layout ─────────────

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-3">{eyebrow}</div>}
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div className={cx("rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.03)]", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("px-5 py-4", className)}>{children}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-lg" aria-hidden>
        ◎
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="max-w-md text-sm text-ink-3">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ───────────── Buttons & links ─────────────

const BTN = {
  primary: "bg-brand text-brand-ink hover:opacity-90",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
  danger: "border border-bad/30 bg-surface text-bad hover:bg-bad-soft",
  accent: "bg-accent text-[#191816] hover:opacity-90",
} as const;

export type ButtonVariant = keyof typeof BTN;

export function buttonClass(variant: ButtonVariant = "secondary", size: "sm" | "md" = "md") {
  return cx(
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap",
    size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-3.5 text-sm",
    BTN[variant],
  );
}

export function Button({ variant = "secondary", size = "md", className, ...rest }: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button className={cx(buttonClass(variant, size), className)} {...rest} />;
}

export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cx(buttonClass(variant, size), className)}>
      {children}
    </Link>
  );
}

// ───────────── Badges ─────────────

const TONES = {
  neutral: "bg-sunken text-ink-2",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  brand: "bg-brand-soft text-brand",
  accent: "bg-accent-soft text-[#7a4b00]",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}

const STATUS: Record<string, { tone: Tone; label: string; icon: string }> = {
  // comments
  generated: { tone: "neutral", label: "Generated", icon: "○" },
  pending_approval: { tone: "warn", label: "Pending approval", icon: "◔" },
  approved: { tone: "good", label: "Approved", icon: "✓" },
  rejected: { tone: "bad", label: "Rejected", icon: "✕" },
  superseded: { tone: "neutral", label: "Superseded", icon: "–" },
  queued: { tone: "info", label: "Queued", icon: "◷" },
  publishing: { tone: "info", label: "Publishing", icon: "↻" },
  published: { tone: "brand", label: "Published", icon: "●" },
  failed: { tone: "bad", label: "Failed", icon: "!" },
  manual_required: { tone: "accent", label: "Manual action", icon: "✋" },
  cancelled: { tone: "neutral", label: "Cancelled", icon: "–" },
  // opportunities
  discovered: { tone: "neutral", label: "Discovered", icon: "○" },
  analyzed: { tone: "info", label: "Analyzed", icon: "◑" },
  comment_generated: { tone: "info", label: "Comments ready", icon: "✎" },
  dismissed: { tone: "neutral", label: "Dismissed", icon: "–" },
  // clients / campaigns / accounts
  active: { tone: "good", label: "Active", icon: "●" },
  paused: { tone: "warn", label: "Paused", icon: "❚❚" },
  onboarding: { tone: "info", label: "Onboarding", icon: "◔" },
  archived: { tone: "neutral", label: "Archived", icon: "▢" },
  connected: { tone: "good", label: "Connected", icon: "●" },
  expired: { tone: "bad", label: "Expired", icon: "!" },
  disconnected: { tone: "neutral", label: "Disconnected", icon: "○" },
  error: { tone: "bad", label: "Error", icon: "!" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { tone: "neutral" as Tone, label: status, icon: "○" };
  return (
    <Badge tone={s.tone}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </Badge>
  );
}

export function ScoreBadge({ score, label }: { score: number | null; label?: string | null }) {
  if (score == null) return <span className="text-ink-3">—</span>;
  const tone: Tone = score >= 80 ? "good" : score >= 60 ? "brand" : score >= 40 ? "warn" : "neutral";
  return (
    <span className="inline-flex items-center gap-2">
      <Badge tone={tone} className="tabular">
        {score}/100
      </Badge>
      {label && <span className="hidden text-xs text-ink-3 md:inline">{label}</span>}
    </span>
  );
}

export function QualityBadge({ score, passed }: { score: number | null; passed: boolean }) {
  if (score == null) return <span className="text-ink-3">—</span>;
  return (
    <Badge tone={passed ? (score >= 85 ? "good" : "warn") : "bad"} className="tabular">
      <span aria-hidden>{passed ? "✓" : "!"}</span>Quality {score}
    </Badge>
  );
}

const PLATFORM_STYLE: Record<Platform, { bg: string; short: string }> = {
  instagram: { bg: "linear-gradient(135deg,#f58529,#dd2a7b 50%,#8134af)", short: "IG" },
  facebook: { bg: "#1877f2", short: "f" },
  linkedin: { bg: "#0a66c2", short: "in" },
  youtube: { bg: "#ff0000", short: "▶" },
  x: { bg: "#111111", short: "X" },
  tiktok: { bg: "#111111", short: "♪" },
};

export function PlatformIcon({ platform, size = 20 }: { platform: string; size?: number }) {
  const p = PLATFORM_STYLE[platform as Platform] ?? { bg: "#777", short: "?" };
  return (
    <span
      title={PLATFORM_LABELS[platform as Platform] ?? platform}
      aria-label={PLATFORM_LABELS[platform as Platform] ?? platform}
      className="inline-grid shrink-0 place-items-center rounded-md font-bold text-white"
      style={{ background: p.bg, width: size, height: size, fontSize: size * 0.45 }}
    >
      {p.short}
    </span>
  );
}

export function PlatformList({ platforms }: { platforms: string[] }) {
  if (!platforms.length) return <span className="text-ink-3">None</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {platforms.map((p) => (
        <PlatformIcon key={p} platform={p} size={18} />
      ))}
      <span className="hidden text-xs text-ink-2 lg:inline">{platforms.map((p) => PLATFORM_LABELS[p as Platform] ?? p).join(" + ")}</span>
    </span>
  );
}

// ───────────── Data display ─────────────

export function Stat({ label, value, hint, href }: { label: string; value: ReactNode; hint?: ReactNode; href?: string }) {
  const body = (
    <>
      <div className="text-xs font-medium text-ink-3">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold tracking-tight text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-xl border border-line bg-surface px-4 py-3 transition hover:border-line-strong">
      {body}
    </Link>
  ) : (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">{body}</div>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex items-center gap-3" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Progress"}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full bg-brand" style={{ width: `${v}%` }} />
      </div>
      <span className="tabular w-10 text-right text-xs font-medium text-ink-2">{v}%</span>
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cx("border-b border-line px-4 py-2.5 text-left text-xs font-medium text-ink-3", className)}>{children}</th>;
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx("border-b border-line px-4 py-3 align-middle text-ink-2", className)}>{children}</td>;
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-ink-2">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

export const inputClass =
  "h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";
export const textareaClass =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "bad" | "good"; children: ReactNode }) {
  const t = { info: "border-info/20 bg-info-soft text-info", warn: "border-warn/25 bg-warn-soft text-warn", bad: "border-bad/25 bg-bad-soft text-bad", good: "border-good/25 bg-good-soft text-good" }[tone];
  return <div className={cx("rounded-lg border px-4 py-3 text-sm", t)}>{children}</div>;
}

export function formatDate(d: Date | string | null | undefined, withTime = false) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
    timeZone: "Asia/Kolkata",
  });
}

export function timeAgo(d: Date | string | null | undefined) {
  if (!d) return "—";
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-IN"));
export const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
