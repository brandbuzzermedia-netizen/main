import { redirect } from "next/navigation";
import { homePath } from "@/lib/workspace";

/** Group members land on the Command Centre; everyone else on their first company. */
export default async function Root() {
  redirect(await homePath());
}
