import { describe, expect, it } from "vitest";
import { companyNav, safeNextPath } from "@/lib/nav";
import { COMPANY_TEMPLATES } from "@/domain/registry";

const gbs = COMPANY_TEMPLATES.find((t) => t.slug === "gbs")!;
const perms = (...p: string[]) => (x: string) => p.includes(x);
const OWNER = perms("company.view", "company.settings", "company.emergency_stop", "members.manage", "dashboard.owner", "finance.read", "finance.write",
  "crm.read_all", "crm.write", "crm.manage", "tasks.read_all", "tasks.write", "automation.manage", "documents.read", "documents.write", "operations.read");
const REP = perms("company.view", "crm.read_assigned", "crm.write", "tasks.write");

describe("companyNav", () => {
  it("gives owners and employees different menus", () => {
    const owner = companyNav(gbs, OWNER).map((i) => i.key);
    const rep = companyNav(gbs, REP).map((i) => i.key);
    expect(owner).toEqual(expect.arrayContaining(["finance", "automation", "settings", "team", "vault"]));
    for (const k of ["finance", "automation", "settings", "team", "vault", "receivables", "reports"]) expect(rep).not.toContain(k);
    expect(rep).toEqual(expect.arrayContaining(["home", "pipeline", "tasks", "outreach"]));
  });
  it("only links to built pages; nothing is a dead link", () => {
    for (const i of companyNav(gbs, OWNER)) expect(i.href).toMatch(/^\/(c\/gbs|switch)/);
  });
  it("shows tax to an accountant without finance access", () => {
    expect(companyNav(gbs, perms("company.view"), "accountant").map((i) => i.key)).toContain("tax");
  });
});

describe("safeNextPath", () => {
  it.each(["https://evil.example", "//evil.example", "/\\evil", "javascript:alert(1)", "/ok\r\nSet-Cookie: x"])("rejects %j", (bad) => {
    expect(safeNextPath(bad, "/home")).toBe("/home");
  });
  it("keeps same-site paths", () => expect(safeNextPath("/invoices?view=overdue", "/")).toBe("/invoices?view=overdue"));
});
