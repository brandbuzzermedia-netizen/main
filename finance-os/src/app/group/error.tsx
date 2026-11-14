"use client";

import { Alert, Button } from "@/components/ui";

/** Shown when a page or action fails. Production hides internal details; the action was not applied. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-xl">
      <Alert tone="danger" title="That did not go through">
        {process.env.NODE_ENV === "development" ? error.message : "Nothing was changed. Check you have access to this action, then try again."}
        {error.digest && <span className="mt-1 block text-xs">Reference: {error.digest}</span>}
      </Alert>
      <div className="mt-4"><Button variant="secondary" onClick={reset}>Try again</Button></div>
    </div>
  );
}
