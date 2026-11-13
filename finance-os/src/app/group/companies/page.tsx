import type { Metadata } from "next";
import { getGroupContext } from "@/lib/workspace";
import { BUSINESS_MODELS, COMPANY_TEMPLATES, CONSOLIDATION, LIFECYCLE, OWNERSHIP_TYPES } from "@/domain/registry";
import { Card, PageHeader, Table, Td } from "@/components/ui";
import { AddCompanyForm, AttachForm, TemplatesForm } from "../forms";
import { setRegistryAction } from "../actions";

export const metadata: Metadata = { title: "Businesses" };

export default async function CompaniesPage() {
  const g = await getGroupContext();
  const owner = g.group.role === "group_owner";
  const slugs = new Set(g.registry.map((c) => c.slug));
  const legacy = g.memberships.filter((m) => m.company.family_group_id === null && m.role === "owner");
  return (
    <>
      <PageHeader title="Businesses" description="The group's company registry. Ownership and consolidation decide what group totals include; access is granted per company." />
      <div className="flex flex-col gap-5">
        {g.registry.length > 0 && (
          <Table head={["Business", "Ownership", "Group totals", "Model", "Status", "Your role"]}>
            {g.registry.map((c) => (
              <tr key={c.id}>
                <Td><div className="font-medium">{c.name}</div><div className="text-xs text-muted">/c/{c.slug}{c.owner_label ? ` · ${c.owner_label}` : ""}</div></Td>
                <Td colSpan={owner ? 2 : 1}>
                  {owner ? (
                    <form action={setRegistryAction} className="flex flex-wrap gap-1.5">
                      <input type="hidden" name="org_id" value={c.id} />
                      <input type="hidden" name="owner_label" value={c.owner_label ?? ""} />
                      <select name="ownership_type" defaultValue={c.ownership_type} aria-label={`Ownership of ${c.name}`} className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs">
                        {Object.entries(OWNERSHIP_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <select name="consolidation" defaultValue={c.consolidation} aria-label={`Consolidation of ${c.name}`} className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs">
                        {Object.entries(CONSOLIDATION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <button className="rounded-md border border-line px-2 text-xs hover:bg-surface-2">Save</button>
                    </form>
                  ) : OWNERSHIP_TYPES[c.ownership_type]}
                </Td>
                {!owner && <Td>{CONSOLIDATION[c.consolidation]}</Td>}
                <Td>{BUSINESS_MODELS[c.business_model]}</Td>
                <Td>{LIFECYCLE[c.lifecycle_status]}</Td>
                <Td>{g.access.get(c.id)?.role ?? <span className="text-faint">No access</span>}</Td>
              </tr>
            ))}
          </Table>
        )}
        {owner && legacy.length > 0 && (
          <Card title="Bring in an existing workspace">
            <p className="mb-3 text-sm text-muted">These workspaces existed before the group (for example the original GBS Finance OS). Attaching keeps every invoice, payment and client as it is.</p>
            <AttachForm orgs={legacy.map((m) => ({ id: m.company.id, name: m.company.name }))} templates={COMPANY_TEMPLATES.filter((t) => !slugs.has(t.slug)).map((t) => ({ slug: t.slug, name: t.name }))} />
          </Card>
        )}
        {owner && (
          <Card title="Set up the businesses named in the brief">
            <p className="mb-3 text-sm text-muted">Creates empty workspaces with ownership as described, pipeline stages and brand colours. No figures, people or commission rates are created. Partner channels count only contracted commission; La Pino&apos;z waits for the agreed share.</p>
            <TemplatesForm templates={COMPANY_TEMPLATES.map((t) => ({ slug: t.slug, name: t.name, ownership: OWNERSHIP_TYPES[t.ownership_type], consolidation: CONSOLIDATION[t.consolidation], exists: slugs.has(t.slug) }))} />
          </Card>
        )}
        {owner && (
          <section id="add" className="scroll-mt-24">
            <Card title="Add a business">
              <AddCompanyForm />
            </Card>
          </section>
        )}
      </div>
    </>
  );
}
