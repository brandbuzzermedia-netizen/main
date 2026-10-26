import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import { loadLeadContext } from "@/lib/leads";
import { sourceKindLabel } from "@/domain/labels";
import { Badge, Card } from "@/components/ui";
import { toggleSourceAction } from "../actions";
import { AddSourceForm } from "../forms";

export const metadata: Metadata = { title: "Lead sources" };

export default async function SourcesPage() {
  const ctx = await getContext();
  const { sources } = await loadLeadContext(ctx);
  return (
    <div className="flex flex-col gap-6">
      <Card title="Lead sources">
        <p className="mb-4 text-sm text-muted">
          Every lead records where it came from. Record each source&apos;s provenance, so you can show why you are allowed to hold and contact these people.
        </p>
        <ul className="flex flex-col divide-y divide-line">
          {sources.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-4 py-2.5">
              <div>
                <div className="font-medium">{s.name} {!s.is_active && <Badge>Archived</Badge>}</div>
                <div className="text-xs text-muted">{sourceKindLabel[s.kind]}{s.provenance_note && ` · ${s.provenance_note}`}</div>
              </div>
              {ctx.can.configurePipeline && (
                <form action={toggleSourceAction.bind(null, s.id, !s.is_active)}>
                  <button className="text-xs text-muted hover:text-ink">{s.is_active ? "Archive" : "Restore"}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {ctx.can.configurePipeline && <Card title="Add a source"><AddSourceForm /></Card>}
    </div>
  );
}
