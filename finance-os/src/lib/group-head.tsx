import { PageHead } from "@/components/dp/shell";
import type { ReactNode } from "react";

/** Group screens share the design's "Group Command Centre · Authorised consolidated view" heading. */
export function GroupHead({ title, right, intro }: { title: string; right?: ReactNode; intro?: ReactNode }) {
  return <PageHead own="Group Command Centre" treat="Authorised consolidated view" title={title} right={right} intro={intro} />;
}
