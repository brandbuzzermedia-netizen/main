"use client";

import { Alert, Button } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-12">
      <Alert tone="danger" title="Something went wrong loading this page">
        {error.message || "Unexpected error."} {error.digest && <span className="text-xs">(ref {error.digest})</span>}
      </Alert>
      <Button className="mt-4" variant="secondary" onClick={reset}>Try again</Button>
    </div>
  );
}
