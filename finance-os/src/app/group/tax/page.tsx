import type { Metadata } from "next";
import { GroupFinance } from "../finance/group-finance";

export const metadata: Metadata = { title: "Tax" };

export default async function Page({ searchParams }: PageProps<"/group/tax">) {
  const sp = await searchParams;
  return <GroupFinance tab="tax" tabs={false} add={Boolean(sp.add)} co={typeof sp.co === "string" ? sp.co : undefined} />;
}
