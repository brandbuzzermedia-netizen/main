import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DocumentError, extractDocumentText, normalizeText } from "@/lib/documents";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string, type = "") => {
  const buf = readFileSync(path.join(here, "../fixtures", name));
  return new File([buf], name, { type });
};

describe("brand document extraction", () => {
  it("extracts text from a PDF", async () => {
    const d = await extractDocumentText(fixture("brand-guidelines.pdf", "application/pdf"));
    expect(d.kind).toBe("pdf");
    expect(d.text).toContain("Wudgres brand guidelines");
    expect(d.text).toContain("Never sell in comments");
  });

  it("extracts text from a Word document", async () => {
    const d = await extractDocumentText(fixture("company-profile.docx"));
    expect(d.kind).toBe("docx");
    expect(d.text).toContain("luxury doors for villas in Bangalore");
  });

  it("reads plain text and normalizes whitespace", async () => {
    const d = await extractDocumentText(new File(["Line one  \r\n\r\n\r\n\r\nLine two\u0000"], "notes.md", { type: "text/markdown" }));
    expect(d.text).toBe("Line one\n\nLine two");
    expect(normalizeText("  a \n\n\n\n b ")).toBe("a\n\n b");
  });

  it("checks the content, not just the file name", async () => {
    await expect(extractDocumentText(new File(["not really a pdf"], "fake.pdf", { type: "application/pdf" }))).rejects.toBeInstanceOf(DocumentError);
    await expect(extractDocumentText(new File([new Uint8Array([0x4d, 0x5a, 0x90, 0])], "tool.exe"))).rejects.toBeInstanceOf(DocumentError);
  });

  it("rejects oversized text files and empty files", async () => {
    await expect(extractDocumentText(new File(["x".repeat(1_000_001)], "big.txt", { type: "text/plain" }))).rejects.toThrow(/under 1 MB/);
    await expect(extractDocumentText(new File([], "empty.txt"))).rejects.toThrow(/empty/);
  });
});
