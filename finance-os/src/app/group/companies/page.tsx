import { redirect } from "next/navigation";

/** The registry now lives in Settings, as in the Company OS design. */
export default function CompaniesPage() {
  redirect("/group/settings");
}
