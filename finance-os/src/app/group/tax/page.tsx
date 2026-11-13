import type { Metadata } from "next";
import { GroupFinance } from "../finance/group-finance";

export const metadata: Metadata = { title: "Tax" };

export default async function Page({ searchParams }: PageProps<"/group/tax">) {
  return <GroupFinance tab="tax" tabs={false} add={Boolean((await searchParams).add)} />;
}
