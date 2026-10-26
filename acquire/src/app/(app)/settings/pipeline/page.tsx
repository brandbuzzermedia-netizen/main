import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import { loadLeadContext } from "@/lib/leads";
import { STAGE_CATEGORIES } from "@/domain/labels";
import { Card, Input, Select } from "@/components/ui";
import { deleteStageAction, moveStageAction, updateStageAction } from "../actions";
import { AddStageForm } from "../forms";

export const metadata: Metadata = { title: "Pipeline settings" };

export default async function PipelineSettingsPage() {
  const ctx = await getContext();
  const { stages } = await loadLeadContext(ctx);
  const edit = ctx.can.configurePipeline;
  return (
    <div className="flex flex-col gap-6">
      <Card title="Stages">
        <p className="mb-4 text-sm text-muted">
          The category decides how a stage counts in reports (for example, “qualified” or “won”). New and Opted out are built in:
          you can rename them, but automation relies on their category.
        </p>
        <ul className="flex flex-col divide-y divide-line">
          {stages.map((s, i) => (
            <li key={s.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
              {edit ? (
                <form action={updateStageAction.bind(null, s.id)} className="flex flex-1 flex-wrap gap-2">
                  <label htmlFor={`name-${s.id}`} className="sr-only">Stage name</label>
                  <Input id={`name-${s.id}`} name="name" defaultValue={s.name} maxLength={60} className="max-w-xs" />
                  <label htmlFor={`cat-${s.id}`} className="sr-only">Category</label>
                  <Select id={`cat-${s.id}`} name="category" defaultValue={s.category} disabled={s.is_system} className="w-36">
                    {STAGE_CATEGORIES.map((c) => <option key={c} value={c} disabled={c === "opted_out" && !s.is_system}>{c}</option>)}
                  </Select>
                  {s.is_system && <input type="hidden" name="category" value={s.category} />}
                  <button className="rounded-lg border border-line px-3 text-sm hover:bg-surface-2">Save</button>
                </form>
              ) : (
                <span className="flex-1">{s.name} <span className="text-xs text-muted">· {s.category}</span></span>
              )}
              {edit && (
                <div className="flex gap-3 text-xs text-muted">
                  {i > 0 && <form action={moveStageAction.bind(null, s.id, "up")}><button aria-label={`Move ${s.name} up`} className="hover:text-ink">↑ Up</button></form>}
                  {i < stages.length - 1 && <form action={moveStageAction.bind(null, s.id, "down")}><button aria-label={`Move ${s.name} down`} className="hover:text-ink">↓ Down</button></form>}
                  {!s.is_system && <form action={deleteStageAction.bind(null, s.id)}><button className="hover:text-danger">Delete</button></form>}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {edit && <Card title="Add a stage"><AddStageForm /></Card>}
    </div>
  );
}
