"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Copies text; if the browser refuses, selects it so it can be copied by hand. */
export function CopyButton({ text, targetId }: { text: string; targetId?: string }) {
  const [done, setDone] = useState<string | null>(null);
  return (
    <Button
      type="button"
      size="sm"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => setDone("Copied"),
          () => {
            const el = targetId ? (document.getElementById(targetId) as HTMLInputElement | null) : null;
            el?.select();
            setDone("Press Ctrl+C to copy");
          },
        );
      }}
    >
      {done ?? "Copy link"}
    </Button>
  );
}
