import type { Metadata } from "next";
import { GroupFinance } from "../finance/group-finance";

export const metadata: Metadata = { title: "Expenses" };

export default async function Page({ searchParams }: PageProps<"/group/expenses">) {
  const sp = await searchParams;
  return <GroupFinance tab="expenses" tabs={false} add={Boolean(sp.add)} co={typeof sp.co === "string" ? sp.co : undefined} />;
}
