import { redirect } from "next/navigation";

/** Old bill links open the bill in the Finance → Expenses & bills tab. */
export default async function OldBill({ params }: PageProps<"/c/[slug]/bills/[id]">) {
  const { slug, id } = await params;
  redirect(`/c/${slug}/finance?tab=expenses&bill=${id}`);
}
