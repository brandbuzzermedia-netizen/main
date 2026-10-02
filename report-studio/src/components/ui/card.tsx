import * as React from "react";
import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card" className={cn("rounded-[20px] border border-border bg-card p-5 text-card-foreground", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 data-slot="card-title" className={cn("mb-1 font-heading text-[15px] font-bold text-heading", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="card-description" className={cn("mb-3.5 text-[13px] text-muted-foreground", className)} {...props} />;
}

export { Card, CardTitle, CardDescription };
