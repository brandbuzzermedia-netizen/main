import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// GBS buttons are pills: gold primary, outlined default.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gbs-gold",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-card-foreground hover:border-gbs-green",
        primary: "border-primary bg-primary font-bold text-gbs-ink hover:border-gbs-ink",
        ghost: "border-transparent bg-transparent hover:border-border",
        destructive: "border-destructive bg-card text-destructive hover:bg-destructive hover:text-white",
        link: "border-transparent bg-transparent px-0 text-heading underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-[18px] text-[13px]",
        sm: "h-7 px-3 text-xs",
        lg: "h-11 px-5 text-sm",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
