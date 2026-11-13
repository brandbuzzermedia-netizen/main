import { describe, expect, it } from "vitest";
import { safeFileName, sniffMime } from "@/lib/files";
import { toCsv } from "@/lib/csv";

const bytes = (...xs: number[]) => new Uint8Array([...xs, ...new Array(16).fill(0)]);
describe("sniffMime", () => {
  it("recognises allowed formats by their bytes", () => {
    expect(sniffMime(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe("application/pdf");
    expect(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
  });
  it("rejects anything else, whatever its name", () => {
    expect(sniffMime(bytes(0x4d, 0x5a))).toBeNull(); // Windows executable
    expect(sniffMime(new TextEncoder().encode("<html><script>"))).toBeNull();
  });
});
describe("safeFileName", () => {
  it("strips paths and odd characters", () => {
    expect(safeFileName("../../etc/passwd")).toBe("etc_passwd");
    expect(safeFileName("Bill #12 (Nov).pdf")).toBe("Bill_12_Nov_.pdf");
  });
});
describe("toCsv", () => {
  it("quotes and neutralises spreadsheet formulas", () => {
    expect(toCsv([["a,b", '=HYPERLINK("x")', "-12.5", "@cmd"]])).toBe('﻿"a,b","\'=HYPERLINK(""x"")",-12.5,\'@cmd\r\n');
  });
});
