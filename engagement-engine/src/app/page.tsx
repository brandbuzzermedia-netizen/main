import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/types";
import { withUser } from "@/lib/db";

export default async function Home() {
  const user = await requireUser();
  if (isStaff(user)) redirect("/dashboard");
  const first = await withUser(user.id, (db) => db.one<{ id: string }>("select id from clients where status <> 'archived' order by name limit 1"));
  if (!first) redirect("/notifications");
  redirect(`/clients/${first.id}/dashboard`);
}
