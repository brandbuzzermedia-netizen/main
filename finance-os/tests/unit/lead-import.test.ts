import { describe, expect, it } from "vitest";
import { planImport, toE164 } from "@/lib/lead-import";

describe("lead import", () => {
  it("normalises Indian phone numbers", () => {
    expect(toE164("98450 12345")).toBe("+919845012345");
    expect(toE164("09845012345")).toBe("+919845012345");
    expect(toE164("+91 98450-12345, 080 1234")).toBe("+919845012345");
    expect(toE164("12345")).toBeNull();
  });
  it("maps Apollo-style columns, skips bad rows and in-file duplicates", () => {
    const p = planImport("First Name,Last Name,Title,Email,Company,Person Linkedin Url\nAsha,Rao,CEO,ASHA@x.com,Acme,http://www.linkedin.com/in/asha\nB,,,bad,,\nAsha,R,,asha@x.com,,\n");
    expect(p.rows).toEqual([{ full_name: "Asha Rao", email: "asha@x.com", phone_e164: null, company_name: "Acme", linkedin_url: "https://www.linkedin.com/in/asha" }]);
    expect(p.invalid).toBe(1); expect(p.duplicatesInFile).toBe(1); expect(p.ignored).toEqual(["Title"]);
  });
  it("uses the business name for D7-style lists", () => {
    const p = planImport("Business Name,Phone,Website\nSmile Dental,9845012345,https://s.in\n");
    expect(p.rows[0]).toMatchObject({ full_name: "Smile Dental", company_name: "Smile Dental", phone_e164: "+919845012345" });
  });
});
