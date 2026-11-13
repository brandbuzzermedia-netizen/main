import type { Metadata } from "next";
import { GroupFinance } from "../finance/group-finance";

export const metadata: Metadata = { title: "Expenses" };

export default async function Page({ searchParams }: PageProps<"/group/expenses">) {
  return <GroupFinance tab="expenses" tabs={false} add={Boolean((await searchParams).add)} />;
}
