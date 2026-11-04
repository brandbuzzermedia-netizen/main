import { requireClientAccess } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, EmptyState, Field, PageHeader, PlatformIcon, Table, Td, Th, inputClass, textareaClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { ActionButton } from "@/components/client/comment-tools";
import { addTargetProfile, deleteSegment, deleteTargetProfile, saveSegment } from "@/app/actions/audience";

export const metadata = { title: "Audiences" };

interface Segment {
  id: string;
  name: string;
  description: string | null;
  industries: string[];
  job_titles: string[];
  locations: string[];
  interests: string[];
  keywords: string[];
  hashtags: string[];
  negatives: string[];
  campaigns: number;
}

function SegmentFields({ s }: { s?: Segment }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Segment name">
        <input name="name" required defaultValue={s?.name} className={inputClass} placeholder="Architects Bangalore" />
      </Field>
      <Field label="Description">
        <input name="description" defaultValue={s?.description ?? ""} className={inputClass} />
      </Field>
      <Field label="Industries">
        <input name="industries" defaultValue={s?.industries.join(", ")} className={inputClass} placeholder="Architecture, Interior design" />
      </Field>
      <Field label="Job titles">
        <input name="job_titles" defaultValue={s?.job_titles.join(", ")} className={inputClass} placeholder="Architect, Principal Architect" />
      </Field>
      <Field label="Locations">
        <input name="locations" defaultValue={s?.locations.join(", ")} className={inputClass} placeholder="Bangalore, Mysore" />
      </Field>
      <Field label="Interests">
        <input name="interests" defaultValue={s?.interests.join(", ")} className={inputClass} />
      </Field>
      <Field label="Keywords">
        <textarea name="keywords" rows={2} defaultValue={s?.keywords.join(", ")} className={textareaClass} placeholder="luxury villa, wooden door" />
      </Field>
      <Field label="Hashtags">
        <textarea name="hashtags" rows={2} defaultValue={s?.hashtags.map((h) => `#${h}`).join(", ")} className={textareaClass} />
      </Field>
      <Field label="Negative keywords" hint="Posts containing these are excluded">
        <input name="negative_keywords" defaultValue={s?.negatives.join(", ")} className={inputClass} placeholder="hiring, job opening" />
      </Field>
    </div>
  );
}

export default async function AudiencesPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { user, access } = await requireClientAccess(clientId);
  const { segments, targets } = await withUser(user.id, async (db) => ({
    segments: await db.query<Segment>(
      `select s.id, s.name, s.description, s.industries, s.job_titles, s.locations, s.interests,
              coalesce(array_agg(k.keyword) filter (where k.kind = 'keyword'), '{}') as keywords,
              coalesce(array_agg(k.keyword) filter (where k.kind = 'hashtag'), '{}') as hashtags,
              coalesce(array_agg(k.keyword) filter (where k.kind = 'negative'), '{}') as negatives,
              (select count(*)::int from campaign_segments cs where cs.segment_id = s.id) as campaigns
       from audience_segments s left join audience_keywords k on k.segment_id = s.id and k.client_id = s.client_id
       where s.client_id = $1 group by s.id order by s.name`,
      [clientId],
    ),
    targets: await db.query<{ id: string; platform: string; handle: string; display_name: string | null; priority: number; segment: string | null; notes: string | null }>(
      `select t.id, t.platform, t.handle, t.display_name, t.priority, s.name as segment, t.notes
       from target_profiles t left join audience_segments s on s.id = t.segment_id where t.client_id = $1 order by t.priority, t.handle`,
      [clientId],
    ),
  }));
  const can = access.canManage;

  return (
    <>
      <PageHeader title="Audiences" description="Unlimited segments per client. Campaigns run on one or more of them." />
      <div className="grid gap-4 lg:grid-cols-2">
        {segments.map((s) => (
          <Card key={s.id}>
            <CardHeader
              title={s.name}
              description={`${s.campaigns} campaign${s.campaigns === 1 ? "" : "s"}${s.description ? ` · ${s.description}` : ""}`}
              actions={
                can && (
                  <ActionButton run={deleteSegment.bind(null, clientId, s.id)} variant="ghost" confirm={{ title: `Delete "${s.name}"?`, body: "Campaigns using it will no longer target this segment.", label: "Delete" }}>
                    Delete
                  </ActionButton>
                )
              }
            />
            <CardBody className="flex flex-col gap-2 text-sm">
              {(
                [
                  ["Job titles", s.job_titles],
                  ["Industries", s.industries],
                  ["Locations", s.locations],
                  ["Keywords", s.keywords],
                  ["Hashtags", s.hashtags.map((h) => `#${h}`)],
                  ["Excluded", s.negatives],
                ] as const
              ).map(([label, xs]) =>
                xs.length ? (
                  <div key={label} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-20 shrink-0 text-xs text-ink-3">{label}</span>
                    {xs.map((x) => (
                      <Badge key={x} tone={label === "Excluded" ? "bad" : "neutral"}>
                        {x}
                      </Badge>
                    ))}
                  </div>
                ) : null,
              )}
              {can && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-brand">Edit segment</summary>
                  <ActionForm action={saveSegment.bind(null, clientId, s.id)} className="mt-3 flex flex-col gap-3">
                    <SegmentFields s={s} />
                    <div>
                      <SubmitButton size="sm">Save segment</SubmitButton>
                    </div>
                  </ActionForm>
                </details>
              )}
            </CardBody>
          </Card>
        ))}
        {segments.length === 0 && (
          <Card className="lg:col-span-2">
            <EmptyState title="No audience segments yet" description='Example: "Architects Bangalore" — Architecture · Architect, Principal Architect · Bangalore · luxury villa, wooden door.' />
          </Card>
        )}
      </div>

      {can && (
        <Card className="mt-6">
          <CardHeader title="New audience segment" />
          <CardBody>
            <ActionForm action={saveSegment.bind(null, clientId, null)} resetOnSuccess className="flex flex-col gap-3">
              <SegmentFields />
              <div>
                <SubmitButton>Create segment</SubmitButton>
              </div>
            </ActionForm>
          </CardBody>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader title="Target profiles" description="Specific accounts this client wants to engage with. On Instagram these are monitored via Business Discovery (business/creator accounts only)." />
        {targets.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>Profile</Th>
                <Th>Segment</Th>
                <Th>Priority</Th>
                <Th>Notes</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {targets.map((t) => (
                <tr key={t.id}>
                  <Td>
                    <span className="flex items-center gap-2">
                      <PlatformIcon platform={t.platform} size={18} />@{t.handle}
                      {t.display_name && <span className="text-xs text-ink-3">{t.display_name}</span>}
                    </span>
                  </Td>
                  <Td className="text-xs">{t.segment ?? "—"}</Td>
                  <Td>{["", "High", "Normal", "Low"][t.priority]}</Td>
                  <Td className="text-xs">{t.notes ?? ""}</Td>
                  <Td>{can && <ActionButton run={deleteTargetProfile.bind(null, clientId, t.id)} variant="ghost">Remove</ActionButton>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {can && (
          <CardBody>
            <ActionForm action={addTargetProfile.bind(null, clientId)} resetOnSuccess className="grid items-end gap-3 md:grid-cols-[140px_1fr_1fr_120px_auto]">
              <Field label="Platform">
                <select name="platform" className={inputClass}>
                  <option value="instagram">Instagram</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="facebook">Facebook</option>
                  <option value="youtube">YouTube</option>
                </select>
              </Field>
              <Field label="Handle">
                <input name="handle" required className={inputClass} placeholder="@studio.name" />
              </Field>
              <Field label="Segment">
                <select name="segment_id" className={inputClass}>
                  <option value="">—</option>
                  {segments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <select name="priority" defaultValue="2" className={inputClass}>
                  <option value="1">High</option>
                  <option value="2">Normal</option>
                  <option value="3">Low</option>
                </select>
              </Field>
              <SubmitButton size="md">Add</SubmitButton>
            </ActionForm>
          </CardBody>
        )}
      </Card>
    </>
  );
}
