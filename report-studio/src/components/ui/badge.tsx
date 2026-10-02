import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold", {
  variants: {
    variant: {
      default: "border-border bg-muted text-muted-foreground",
      bee: "border-gbs-gold bg-gbs-gold text-gbs-ink",
      ok: "border-current bg-transparent text-ok",
      warn: "border-current bg-transparent text-warn",
      bad: "border-current bg-transparent text-bad",
    },
  },
  defaultVariants: { variant: "default" },
});

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
