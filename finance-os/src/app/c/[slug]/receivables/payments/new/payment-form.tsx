"use client";

import { useActionState, useState } from "react";
import { recordPaymentAction, type PaymentFormState } from "../actions";
import { todayInBusinessTz } from "@/domain/dates";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { METHOD_LABEL } from "@/components/payment-status";

export function PaymentForm({ clients, defaultClient }: { clients: { id: string; name: string }[]; defaultClient?: string }) {
  const [state, action, pending] = useActionState<PaymentFormState, FormData>(recordPaymentAction, {});
  const [verified, setVerified] = useState(false);
  const [kind, setKind] = useState<"receipt" | "refund">("receipt");
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-6">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Card title="Payment">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" name="kind" error={e.kind}>
            <Select name="kind" value={kind} onChange={(ev) => setKind(ev.target.value as "receipt" | "refund")}>
              <option value="receipt">Money received from a client</option>
              <option value="refund">Refund paid back to a client</option>
            </Select>
          </Field>
          <Field label="Client" name="client_id" hint={kind === "receipt" ? "Leave blank if you don't know yet. It will wait in 'Unallocated'." : undefined} error={e.client_id}>
            <Select name="client_id" defaultValue={defaultClient ?? ""}>
              <option value="">Not sure yet</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Amount (₹)" name="amount_minor" error={e.amount_minor}>
            <Input name="amount_minor" inputMode="decimal" required />
          </Field>
          <Field label="Payment date" name="payment_date" hint="Date the money reached the bank" error={e.payment_date}>
            <Input name="payment_date" type="date" defaultValue={todayInBusinessTz()} required />
          </Field>
          <Field label="Reference" name="transaction_reference" hint="UTR / UPI RRN / cheque number, exactly as in the bank record" error={e.transaction_reference}>
            <Input name="transaction_reference" required />
          </Field>
          <Field label="Method" name="method" error={e.method}>
            <Select name="method" defaultValue="neft">
              {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Payer name" name="payer_name" error={e.payer_name}><Input name="payer_name" /></Field>
          <Field label="Notes" name="reconciliation_notes" error={e.reconciliation_notes}><Textarea name="reconciliation_notes" rows={1} /></Field>
        </div>
        {kind === "receipt" && (
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" name="auto_allocate" defaultChecked className="mt-0.5" />
            <span>Allocate to this client&rsquo;s invoices automatically (exact match first, then oldest due first). You can change it afterwards.</span>
          </label>
        )}
      </Card>
      <Card title="Verification">
        <p className="mb-3 text-sm text-muted">
          A client&rsquo;s message or screenshot is not proof of payment. Tick this only if you have seen the money in the bank
          account or a gateway settlement. Otherwise the payment waits as &ldquo;awaiting verification&rdquo; and does not reduce the balance.
        </p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="verified" checked={verified} onChange={(ev) => setVerified(ev.target.checked)} className="mt-0.5" />
          <span>I have seen this money in the bank / settlement record</span>
        </label>
        {verified && (
          <div className="mt-3 max-w-md">
            <Field label="Where did you see it?" name="verification_note" error={e.verification_note}>
              <Input name="verification_note" placeholder="e.g. HDFC current a/c statement, 18 Oct" required />
            </Field>
          </div>
        )}
      </Card>
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Record payment"}</Button></div>
    </form>
  );
}
