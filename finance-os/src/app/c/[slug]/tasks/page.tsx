import { redirect } from "next/navigation";

/** Follow-ups now live on the Meetings screen, as in the design. */
export default async function TasksRedirect({ params }: PageProps<"/c/[slug]/tasks">) {
  redirect(`/c/${(await params).slug}/meetings`);
}
