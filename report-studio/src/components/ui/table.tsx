import * as React from "react";
import { cn } from "@/lib/utils";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table data-slot="table" className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}
const TableHeader = ({ className, ...props }: React.ComponentProps<"thead">) => <thead className={className} {...props} />;
const TableBody = ({ className, ...props }: React.ComponentProps<"tbody">) => <tbody className={cn("[&_tr:last-child_td]:border-0", className)} {...props} />;
const TableRow = ({ className, ...props }: React.ComponentProps<"tr">) => <tr className={cn("transition-colors duration-150 [tbody>&]:hover:bg-muted", className)} {...props} />;
const TableHead = ({ className, ...props }: React.ComponentProps<"th">) => (
  <th className={cn("whitespace-nowrap border-b border-border px-2.5 py-2 text-left text-xs font-semibold text-muted-foreground", className)} {...props} />
);
const TableCell = ({ className, ...props }: React.ComponentProps<"td">) => (
  <td className={cn("border-b border-border px-2.5 py-[11px] align-middle", className)} {...props} />
);

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
