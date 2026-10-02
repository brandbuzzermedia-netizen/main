"use client";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import type { FormAction, FormState } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClientInput, ClientRow } from "@/lib/data/repo";
import { DEFAULT_BRAND } from "@/lib/data/shared";

const FIELDS: [keyof ClientInput, string, string][] = [
  ["name", "Client name", "Shown on every report page"],
  ["company", "Company name", "Registered or trading name"],
  ["industry", "Industry", "e.g. Furniture, Fashion retail"],
  ["location", "Location", "City, country"],
  ["contact", "Contact person", "Name of the person who receives reports"],
  ["website", "Website", "e.g. lykes.in"],
  ["instagram", "Instagram", "@handle or profile address"],
  ["facebook", "Facebook page", "facebook.com/yourpage or page name"],
];

export function ClientForm({ client, action: save }: { client?: ClientRow; action: FormAction<FormState> }) {
  const [state, action, saving] = useActionState<FormState, FormData>(save, {});
  const [starting, start] = useTransition();
  const pending = saving || starting;
  const [logoName, setLogoName] = useState<string | null>(null);
  const err = (k: string) => state.fields?.[k as keyof typeof state.fields];
  return (
    <form
      className="grid max-w-3xl gap-4"
      noValidate
      encType="multipart/form-data"
      // Submitting through a transition keeps every field, and the chosen logo, if something needs fixing.
      onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(() => action(fd)); }}
    >
      {client ? <input type="hidden" name="id" value={client.id} /> : null}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3.5">
        {FIELDS.map(([k, label, ph]) => (
          <Label key={k}>
            {label}{k === "name" ? " (required)" : ""}
            <Input
              name={k}
              defaultValue={(client?.[k] as string | null | undefined) ?? ""}
              placeholder={ph}
              required={k === "name"}
              aria-invalid={!!err(k)}
              aria-describedby={err(k) ? `${k}-err` : undefined}
            />
            {err(k) ? <span id={`${k}-err`} className="text-xs text-bad">{err(k)}</span> : null}
          </Label>
        ))}
        <Label>
          Report design
          <select name="template" defaultValue={client?.template ?? ""} className="h-9 w-full rounded-xl border border-input bg-card px-2.5 text-sm text-foreground">
            <option value="">Studio default</option>
            <option value="premium">Premium</option>
            <option value="minimal">Minimal</option>
            <option value="dark">Dark</option>
          </select>
        </Label>
      </div>
      {client ? null : (
        <fieldset className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3.5 rounded-[20px] border border-border bg-card p-4">
          <legend className="px-1 font-heading text-[15px] font-bold text-heading">Branding</legend>
          <Label>
            Logo
            <span className="inline-flex h-9 w-fit cursor-pointer items-center rounded-full border border-primary bg-primary px-4 text-[13px] font-bold text-gbs-ink hover:border-gbs-ink">
              {logoName ? "Change logo" : "Upload logo"}
            </span>
            {logoName ? <span className="truncate text-xs font-normal">{logoName}</span> : null}
            <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => setLogoName(e.target.files?.[0]?.name ?? null)} />
            <span className="text-[11.5px] font-normal">PNG with a transparent background, trimmed close to the logo: about 1200 × 400 px for a wide logo (at least 600 × 200 px), or 600 × 600 px for a square one. Under 1 MB.</span>
          </Label>
          <Label>
            Primary colour
            <input type="color" name="primary" defaultValue={DEFAULT_BRAND.primary} className="h-9 w-full rounded-xl border border-input bg-card" />
          </Label>
          <Label>
            Secondary colour
            <input type="color" name="accent" defaultValue={DEFAULT_BRAND.accent} className="h-9 w-full rounded-xl border border-input bg-card" />
            <span className="text-[11.5px] font-normal">Both can be changed later, or derived from the logo, on the client page.</span>
          </Label>
        </fieldset>
      )}
      <Label>
        Notes (internal, never shown in reports)
        <textarea name="notes" defaultValue={client?.notes ?? ""} rows={3} className="w-full rounded-xl border border-input bg-card px-2.5 py-2 text-sm text-foreground" />
      </Label>
      {state.error ? <p role="alert" className="text-sm text-bad">{state.error}</p> : null}
      {state.fields && Object.keys(state.fields).length ? (
        <p role="alert" className="rounded-2xl border border-bad bg-card px-4 py-2.5 text-sm text-bad">
          The client was not saved yet. Fix the field{Object.keys(state.fields).length > 1 ? "s" : ""} marked in red, then press {client ? "Save changes" : "Add client"} again. Everything else you entered is kept.
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : client ? "Save changes" : "Add client"}</Button>
        <Button asChild variant="ghost"><Link href={client ? `/clients/${client.id}` : "/clients"}>Cancel</Link></Button>
      </div>
    </form>
  );
}
