"use client";

import { useFormStatus } from "react-dom";
import { Btn } from "@/components/dp/ui";

/** Submit button that says it is working: research and drafting take up to a minute. */
export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <Btn primary disabled={pending}>{pending ? "Researching and drafting… (up to a minute)" : children}</Btn>;
}
