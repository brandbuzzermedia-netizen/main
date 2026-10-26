"use client";

import { switchOrganization } from "@/app/(app)/actions";

export function OrgSwitcher({ current, organizations }: { current: string; organizations: { id: string; name: string }[] }) {
  return (
    <form action={switchOrganization}>
      <label htmlFor="org" className="sr-only">Organization</label>
      <select
        id="org"
        name="org"
        defaultValue={current}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
      >
        {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </form>
  );
}
