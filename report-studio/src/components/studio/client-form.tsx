"use client";
import Link from "next/link";
import { useActionState } from "react";
import { saveClient, type FormState } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClientRow } from "@/lib/data/repo";

const FIELDS: [keyof Omit<ClientRow, "id" | "slug" | "createdAt">, string, string][] = [
  ["name", "Client name", "Thrishank Doors"],
  ["industry", "Industry", "Doors and architectural hardware"],
  ["location", "Location", "Bengaluru, India"],
  ["website", "Website", "https://"],
  ["instagram", "Instagram handle", "thrishankdoors"],
];

export function ClientForm({ client }: { client?: ClientRow }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveClient, {});
  return (
    <form action={action} className="grid max-w-3xl gap-4" noValidate>
      {client ? <input type="hidden" name="id" value={client.id} /> : null}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3.5">
        {FIELDS.map(([k, label, ph]) => (
          <Label key={k}>
            {label}{k === "name" ? " (required)" : ""}
            <Input
              name={k}
              defaultValue={client?.[k] ?? ""}
              placeholder={ph}
              required={k === "name"}
              aria-invalid={!!state.fields?.[k]}
              aria-describedby={state.fields?.[k] ? `${k}-err` : undefined}
            />
            {state.fields?.[k] ? <span id={`${k}-err`} className="text-xs text-bad">{state.fields[k]}</span> : null}
          </Label>
        ))}
      </div>
      {state.error ? <p role="alert" className="text-sm text-bad">{state.error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : client ? "Save changes" : "Add client"}</Button>
        <Button asChild variant="ghost"><Link href={client ? `/clients/${client.id}` : "/clients"}>Cancel</Link></Button>
      </div>
    </form>
  );
}
