"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWriter } from "@/lib/auth";
import { clientSchema, contactSchema, fieldErrors, newClientExtrasSchema, toE164, type FieldErrors } from "@/domain/schemas";

export type FormState = { error?: string; fieldErrors?: FieldErrors; ok?: boolean };

function friendly(message: string): string {
  if (message.includes("clients_organization_id_client_code_key")) return "Another client already uses that client code.";
  if (message.includes("billing_contacts_one_primary")) return "This client already has a primary contact.";
  return message;
}

export async function createClientAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireWriter();
  const raw = Object.fromEntries(formData);
  const client = clientSchema.safeParse(raw);
  const extras = newClientExtrasSchema.safeParse(raw);
  if (!client.success || !extras.success) {
    return { fieldErrors: { ...(client.error ? fieldErrors(client.error) : {}), ...(extras.error ? fieldErrors(extras.error) : {}) } };
  }
  const whatsapp = toE164(extras.data.contact_whatsapp);
  if (extras.data.contact_whatsapp && !whatsapp) return { fieldErrors: { contact_whatsapp: ["Enter a valid mobile number"] } };
  if (extras.data.contract_end_date && extras.data.contract_end_date < extras.data.contract_start_date) {
    return { fieldErrors: { contract_end_date: ["Contract ends before it starts"] } };
  }

  const { data: created, error } = await ctx.supabase
    .from("clients")
    .insert({ ...client.data, organization_id: ctx.org.id })
    .select("id")
    .single();
  if (error) return { error: friendly(error.message) };

  const { error: contractError } = await ctx.supabase.from("contracts").insert({
    organization_id: ctx.org.id,
    client_id: created.id,
    start_date: extras.data.contract_start_date,
    end_date: extras.data.contract_end_date,
    monthly_retainer_minor: client.data.monthly_retainer_minor,
    billing_frequency: client.data.billing_frequency,
    payment_terms_days: client.data.payment_terms_days,
    final_deadline_days: extras.data.final_deadline_days,
  });
  if (contractError) return { error: `Client saved, but the contract was not: ${contractError.message}` };

  if (extras.data.contact_name && (extras.data.contact_email || whatsapp)) {
    const { error: contactError } = await ctx.supabase.from("billing_contacts").insert({
      organization_id: ctx.org.id,
      client_id: created.id,
      name: extras.data.contact_name,
      email: extras.data.contact_email ?? null,
      whatsapp_e164: whatsapp,
      is_primary: true,
    });
    if (contactError) return { error: `Client saved, but the contact was not: ${contactError.message}` };
  }
  revalidatePath("/clients");
  redirect(`/clients/${created.id}`);
}

export async function updateClientAction(clientId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireWriter();
  const parsed = clientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { error } = await ctx.supabase
    .from("clients")
    .update({ ...parsed.data, trading_name: parsed.data.trading_name ?? null, gstin: parsed.data.gstin ?? null,
              invoice_day: parsed.data.invoice_day ?? null, account_owner_id: parsed.data.account_owner_id ?? null,
              notes: parsed.data.notes ?? null })
    .eq("id", clientId)
    .eq("organization_id", ctx.org.id);
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}

export async function addContactAction(clientId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireWriter();
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  if (v.is_primary) {
    await ctx.supabase.from("billing_contacts").update({ is_primary: false }).eq("client_id", clientId).eq("is_primary", true);
  }
  const { error } = await ctx.supabase.from("billing_contacts").insert({
    organization_id: ctx.org.id,
    client_id: clientId,
    name: v.name,
    email: v.email ?? null,
    whatsapp_e164: toE164(v.whatsapp),
    is_primary: v.is_primary,
    receives_reminders: v.receives_reminders,
    whatsapp_consent_at: v.whatsapp_consent ? new Date().toISOString() : null,
    whatsapp_consent_note: v.whatsapp_consent ? v.whatsapp_consent_note : null,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

export async function removeContactAction(clientId: string, contactId: string) {
  const ctx = await requireWriter();
  const { error } = await ctx.supabase.from("billing_contacts").delete().eq("id", contactId).eq("client_id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${clientId}`);
}
