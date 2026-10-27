import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import { loadLeadContext } from "@/lib/leads";
import { STAGE_CATEGORIES } from "@/domain/labels";
import { Card, Input, Select } from "@/components/ui";
import { deleteStageAction, moveStageAction, updateStageAction } from "../actions";
import { AddDealStageForm, AddStageForm } from "../forms";
import { loadDealStages } from "@/lib/crm";
import { deleteDealStageAction, updateDealStageAction } from "../../crm-actions";
import { Badge } from "@/components/ui";
import { dealCategoryTone } from "@/domain/labels";

export const metadata: Metadata = { title: "Pipeline settings" };

export default async function PipelineSettingsPage() {
  const ctx = await getContext();
  const [{ stages }, dealStages] = await Promise.all([loadLeadContext(ctx), loadDealStages(ctx)]);
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
      {edit && <Card title="Add a lead stage"><AddStageForm /></Card>}

      <Card title="Deal stages">
        <p className="mb-4 text-sm text-muted">
          Deals move through these stages. The probability weights each open deal&apos;s commission on the dashboard. Closed won (100%) and Closed lost (0%) are fixed.
        </p>
        <ul className="flex flex-col divide-y divide-line">
          {dealStages.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
              {ctx.can.configureDeals ? (
                <form action={updateDealStageAction.bind(null, s.id)} className="flex flex-1 flex-wrap items-center gap-2">
                  <label htmlFor={`deal-name-${s.id}`} className="sr-only">Stage name</label>
                  <Input id={`deal-name-${s.id}`} name="name" defaultValue={s.name} maxLength={60} className="max-w-xs" />
                  <label htmlFor={`deal-prob-${s.id}`} className="sr-only">Probability</label>
                  <Input id={`deal-prob-${s.id}`} name="probability" type="number" min={0} max={100} defaultValue={s.probability} disabled={s.category !== "open"} className="w-20" />
                  {s.category !== "open" && <input type="hidden" name="probability" value={s.probability} />}
                  <span className="text-sm text-muted">%</span>
                  {s.category !== "open" && <Badge tone={dealCategoryTone[s.category]}>{s.category}</Badge>}
                  <button className="rounded-lg border border-line px-3 text-sm hover:bg-surface-2">Save</button>
                </form>
              ) : (
                <span className="flex-1">{s.name} <span className="text-xs text-muted">· {s.probability}%</span></span>
              )}
              {ctx.can.configureDeals && s.category === "open" && (
                <form action={deleteDealStageAction.bind(null, s.id)}><button className="text-xs text-muted hover:text-danger">Delete</button></form>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {ctx.can.configureDeals && <Card title="Add a deal stage"><AddDealStageForm /></Card>}
    </div>
  );
}
