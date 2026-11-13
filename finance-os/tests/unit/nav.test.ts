import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/nav";
import { dpCompanyNav } from "@/lib/dp-nav";
import { COMPANY_MODULES, COMPANY_TEMPLATES } from "@/domain/registry";

const gbs = COMPANY_TEMPLATES.find((t) => t.slug === "gbs")!;
const perms = (...p: string[]) => (x: string) => p.includes(x);
const OWNER = perms("company.view", "company.settings", "company.emergency_stop", "members.manage", "dashboard.owner", "finance.read", "finance.write",
  "crm.read_all", "crm.write", "crm.manage", "tasks.read_all", "tasks.write", "automation.manage", "documents.read", "documents.write", "operations.read", "audit.read");
const REP = perms("company.view", "crm.read_assigned", "crm.write", "tasks.write");

describe("dpCompanyNav (Company OS design menu)", () => {
  it("gives owners and employees different menus", () => {
    const owner = dpCompanyNav(gbs, OWNER).map((i) => i.key);
    const rep = dpCompanyNav(gbs, REP).map((i) => i.key);
    expect(owner).toEqual(["home", "leads", "pipeline", "outreach", "meetings", "customers", "operations", "automation", "marketing", "finance", "team", "reports", "vault", "settings"]);
    for (const k of ["finance", "automation", "settings", "team", "vault", "reports", "operations"]) expect(rep).not.toContain(k);
    expect(rep).toEqual(expect.arrayContaining(["home", "leads", "pipeline", "outreach", "meetings"]));
  });
  it("uses each company's own names from the design", () => {
    const labels = (slug: string) => dpCompanyNav({ slug, enabled_modules: COMPANY_MODULES }, OWNER).map((i) => i.label);
    expect(labels("gbs")).toEqual(expect.arrayContaining(["Delivery", "Campaigns"]));
    expect(labels("tan-o-fun")).toEqual(expect.arrayContaining(["Quotes & orders", "Dealers & buyers", "Catalogue & supply"]));
    expect(labels("demo-la-pinoz")).toEqual(expect.arrayContaining(["Order board", "Kitchen & stock"]));
  });
  it("only links to company pages and shows the approvals badge", () => {
    const items = dpCompanyNav(gbs, OWNER, { approvals: 2 });
    for (const i of items) expect(i.href).toMatch(/^\/c\/gbs(\/|$)/);
    expect(items.find((i) => i.key === "automation")?.badge).toBe("2");
  });
  it("hides switched-off modules and shows Finance to an accountant", () => {
    expect(dpCompanyNav({ slug: "gbs", enabled_modules: ["home", "leads", "settings"] }, OWNER).map((i) => i.key)).toEqual(["home", "leads", "settings"]);
    expect(dpCompanyNav(gbs, perms("company.view"), { role: "accountant" }).map((i) => i.key)).toContain("finance");
  });
});

describe("safeNextPath", () => {
  it.each(["https://evil.example", "//evil.example", "/\\evil", "javascript:alert(1)", "/ok\r\nSet-Cookie: x"])("rejects %j", (bad) => {
    expect(safeNextPath(bad, "/home")).toBe("/home");
  });
  it("keeps same-site paths", () => expect(safeNextPath("/invoices?view=overdue", "/")).toBe("/invoices?view=overdue"));
});
