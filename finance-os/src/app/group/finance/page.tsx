import type { Metadata } from "next";
import { GroupFinance } from "./group-finance";

export const metadata: Metadata = { title: "Finance" };

export default async function Page({ searchParams }: PageProps<"/group/finance">) {
  const sp = await searchParams;
  const tab = (["overview", "expenses", "rental", "tax"] as const).find((t) => t === sp.tab) ?? "overview";
  return <GroupFinance tab={tab} tabs add={Boolean(sp.add)} co={typeof sp.co === "string" ? sp.co : undefined} />;
}
