import type { Metadata } from "next";
import { GroupFinance } from "../finance/group-finance";

export const metadata: Metadata = { title: "Rental" };

export default async function Page({ searchParams }: PageProps<"/group/rental">) {
  return <GroupFinance tab="rental" tabs={false} add={Boolean((await searchParams).add)} />;
}
