import type { Metadata } from "next";
import { getGroupContext } from "@/lib/workspace";
import { GroupHead } from "@/lib/group-head";
import { financialYear } from "@/domain/periods";
import { todayInBusinessTz } from "@/domain/dates";
import { ListView, NOTES } from "@/views/list";

export const metadata: Metadata = { title: "Reports" };

export default async function GroupReports() {
  const g = await getGroupContext();
  const fy = financialYear(todayInBusinessTz(), g.group.fy_start_month);
  const [title, lines] = NOTES.reports;
  return (
    <>
      <GroupHead title="Reports" />
      <ListView vm={{
        chips: [{ l: "Export (logged)" }, { l: "CSV" }, { l: "PDF" }], head: ["REPORT", "PERIOD", "STATUS", "OWNER"],
        rows: [
          { a: "Owner pack: Command Centre", b: "Month", c: "Ready", d: "Group", href: "/group" },
          { a: "Group finance and company comparison", b: fy.label, c: "Ready", d: "Finance", href: "/group/finance" },
          { a: "Group pipeline", b: "Live", c: "Ready", d: "Sales", href: "/group/pipeline" },
          { a: "Rental statement by unit", b: fy.label, c: "Ready", d: "Finance", href: "/group/rental" },
          { a: "Filing status", b: fy.label, c: "Ready", d: "Finance", href: "/group/tax" },
          { a: "Automation health", b: "30 days", c: "Ready", d: "Operations", href: "/group/automation" },
        ],
        empty: "", noteTitle: title, noteLines: lines,
      }} />
    </>
  );
}
