import { requireClientAccess } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import type { BrandContext } from "@/lib/ai/context";
import { Card, CardBody, CardHeader, Field, PageHeader, Table, Td, Th, formatDate, inputClass, textareaClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { ActionButton } from "@/components/client/comment-tools";
import { deleteDocument, saveBrand, uploadDocument } from "@/app/actions/brand";

export const metadata = { title: "Brand profile" };

const DOC_KINDS = { brand_guidelines: "Brand guidelines", company_profile: "Company profile", product_catalog: "Product catalog", marketing: "Marketing document" } as const;

export default async function BrandPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { user, access } = await requireClientAccess(clientId);
  const { b, docs } = await withUser(user.id, async (db) => ({
    b: await db.one<BrandContext>("select * from brand_profiles where client_id = $1", [clientId]),
    docs: await db.query<{ id: string; kind: keyof typeof DOC_KINDS; title: string; file_name: string; size_bytes: number; created_at: Date }>(
      "select id, kind, title, file_name, size_bytes, created_at from brand_documents where client_id = $1 order by created_at desc",
      [clientId],
    ),
  }));
  const ro = !access.canManage;
  const list = (xs?: string[]) => (xs ?? []).join(", ");

  return (
    <>
      <PageHeader title="Brand profile" description="This client's own AI personality. It's used only for this client's comments — never for another client." />
      <ActionForm action={saveBrand.bind(null, clientId)} className="flex flex-col gap-6">
        <fieldset disabled={ro} className="contents">
          <Card>
            <CardHeader title="Company" />
            <CardBody className="grid gap-4 md:grid-cols-2">
              <Field label="Company name">
                <input name="company_name" required defaultValue={b?.company_name} className={inputClass} />
              </Field>
              <Field label="Website">
                <input name="website" type="url" defaultValue={b?.website ?? ""} className={inputClass} placeholder="https://" />
              </Field>
              <Field label="Industry">
                <input name="industry" defaultValue={b?.industry ?? ""} className={inputClass} />
              </Field>
              <Field label="Location">
                <input name="location" defaultValue={b?.location ?? ""} className={inputClass} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Description">
                  <textarea name="description" rows={3} defaultValue={b?.description ?? ""} className={textareaClass} />
                </Field>
              </div>
              <Field label="Products">
                <textarea name="products" rows={2} defaultValue={list(b?.products)} className={textareaClass} />
              </Field>
              <Field label="Services">
                <textarea name="services" rows={2} defaultValue={list(b?.services)} className={textareaClass} />
              </Field>
              <Field label="USP">
                <textarea name="usp" rows={2} defaultValue={b?.usp ?? ""} className={textareaClass} />
              </Field>
              <Field label="Target market">
                <textarea name="target_market" rows={2} defaultValue={b?.target_market ?? ""} className={textareaClass} />
              </Field>
              <Field label="Business model">
                <select name="business_model" defaultValue={b?.business_model ?? "b2b"} className={inputClass}>
                  <option value="b2b">B2B</option>
                  <option value="b2c">B2C</option>
                  <option value="both">Both</option>
                </select>
              </Field>
              <Field label="Brand keywords">
                <input name="keywords" defaultValue={list(b?.keywords)} className={inputClass} />
              </Field>
              <Field label="Brand hashtags">
                <input name="hashtags" defaultValue={(b?.hashtags ?? []).map((h) => `#${h}`).join(", ")} className={inputClass} />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Brand voice" description="e.g. Professional · Technical · Insight-driven, or Friendly · Casual · Conversational, or Luxury · Minimal · Premium" />
            <CardBody className="grid gap-4 md:grid-cols-3">
              <Field label="Brand personality">
                <input name="brand_personality" defaultValue={list(b?.brand_personality)} className={inputClass} placeholder="Professional, Technical, Insight-driven" />
              </Field>
              <Field label="Tone">
                <input name="tone" defaultValue={list(b?.tone)} className={inputClass} placeholder="Professional, warm" />
              </Field>
              <Field label="Language">
                <input name="language" defaultValue={b?.language ?? "English"} className={inputClass} />
              </Field>
              <Field label="Preferred comment length">
                <select name="comment_length" defaultValue={b?.comment_length ?? "medium"} className={inputClass}>
                  <option value="short">Short (1–2 sentences)</option>
                  <option value="medium">Medium (2–3 sentences)</option>
                  <option value="long">Long (up to a short paragraph)</option>
                </select>
              </Field>
              <Field label="CTA style">
                <select name="cta_style" defaultValue={b?.cta_style ?? "none"} className={inputClass}>
                  <option value="none">None — never promote</option>
                  <option value="soft">Soft — gentle mention allowed</option>
                  <option value="direct">Direct — needs explicit approval each time</option>
                </select>
              </Field>
              <Field label="Emoji">
                <select name="emoji_policy" defaultValue={b?.emoji_policy ?? "sparing"} className={inputClass}>
                  <option value="none">None</option>
                  <option value="sparing">Sparing</option>
                  <option value="allowed">Allowed</option>
                </select>
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Guard-rails" description="Checked on every comment by the quality engine." />
            <CardBody className="grid gap-4 md:grid-cols-2">
              <Field label="Words to use">
                <textarea name="words_to_use" rows={2} defaultValue={list(b?.words_to_use)} className={textareaClass} />
              </Field>
              <Field label="Words to avoid">
                <textarea name="words_to_avoid" rows={2} defaultValue={list(b?.words_to_avoid)} className={textareaClass} />
              </Field>
              <Field label="Topics to avoid">
                <textarea name="topics_to_avoid" rows={2} defaultValue={list(b?.topics_to_avoid)} className={textareaClass} />
              </Field>
              <Field label="Competitors" hint="Never mentioned; their posts are excluded">
                <textarea name="competitors" rows={2} defaultValue={list(b?.competitors)} className={textareaClass} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Claims that require approval" hint="Flagged for the approver if a comment makes them">
                  <textarea name="claims_requiring_approval" rows={2} defaultValue={list(b?.claims_requiring_approval)} className={textareaClass} placeholder="termite-proof, lifetime warranty" />
                </Field>
              </div>
            </CardBody>
          </Card>
        </fieldset>
        {!ro && (
          <div>
            <SubmitButton>Save brand profile</SubmitButton>
          </div>
        )}
      </ActionForm>

      <Card className="mt-6">
        <CardHeader title="Brand documents" description="Used as AI context for this client only." />
        {docs.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>Type</Th>
                <Th>File</Th>
                <Th>Added</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <Td className="font-medium text-ink">{d.title}</Td>
                  <Td>{DOC_KINDS[d.kind]}</Td>
                  <Td className="text-xs">
                    {d.file_name} · {Math.ceil(d.size_bytes / 1024)} KB
                  </Td>
                  <Td className="text-xs">{formatDate(d.created_at)}</Td>
                  <Td>{!ro && <ActionButton run={deleteDocument.bind(null, clientId, d.id)} variant="ghost" confirm={{ title: "Delete this document?", label: "Delete" }}>Delete</ActionButton>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {!ro && (
          <CardBody>
            <ActionForm action={uploadDocument.bind(null, clientId)} resetOnSuccess className="grid gap-3 md:grid-cols-2">
              <Field label="Title">
                <input name="title" required className={inputClass} placeholder="Brand guidelines 2026" />
              </Field>
              <Field label="Type">
                <select name="kind" className={inputClass}>
                  {Object.entries(DOC_KINDS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="File" hint="PDF or Word (.docx) up to 10 MB, or .txt, .md, .csv, .json up to 1 MB. Text is extracted; scanned PDFs need converting first.">
                <input name="file" type="file" accept=".pdf,.docx,.txt,.md,.markdown,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv,application/json" className="text-sm" />
              </Field>
              <Field label="…or paste the text">
                <textarea name="content" rows={3} className={textareaClass} />
              </Field>
              <div>
                <SubmitButton>Add document</SubmitButton>
              </div>
            </ActionForm>
          </CardBody>
        )}
      </Card>
    </>
  );
}
