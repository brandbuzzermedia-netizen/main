import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { setActiveOrg } from "@/lib/auth";
import { getWorkspaceUser, homePath } from "@/lib/workspace";
import { safeNextPath } from "@/lib/nav";

/**
 * Explicit workspace switch: /switch?to=<company slug | "group">&next=<relative path>.
 * The target is accepted only if the signed-in user is a member; the active-company cookie
 * used by the finance pages is set here and nowhere else.
 */
export async function GET(request: NextRequest) {
  const to = request.nextUrl.searchParams.get("to") ?? "";
  const next = request.nextUrl.searchParams.get("next");
  const u = await getWorkspaceUser();
  if (to === "group") {
    redirect(u.groups.length ? "/group" : await homePath());
  }
  const m = u.memberships.find((x) => x.company.slug === to);
  if (!m) redirect(await homePath());
  await setActiveOrg(m.company.id);
  redirect(safeNextPath(next, `/c/${m.company.slug}`));
}
