"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export type SwitchOption = { value: string; label: string };

/**
 * Explicit workspace switch. Navigates through /switch, which re-checks membership on the
 * server before changing anything; the list itself only contains the viewer's workspaces.
 */
export function WorkspaceSwitcher({ options, current, accent }: { options: SwitchOption[]; current: string; accent: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2.5 rounded-3xl border border-line bg-surface py-1.5 pr-2 pl-3.5">
      <span className="size-2.5 flex-none rounded-full" style={{ background: accent }} aria-hidden />
      <span className="sr-only">Workspace</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => start(() => router.push(`/switch?to=${encodeURIComponent(e.target.value)}`))}
        className="max-w-[230px] cursor-pointer border-0 bg-transparent text-[14.5px] font-semibold outline-0"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
