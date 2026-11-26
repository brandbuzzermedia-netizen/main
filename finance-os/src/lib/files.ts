/**
 * Upload checks. The browser's declared type is not trusted: the file's first bytes must match
 * an allowed format, and the size must be within the limit.
 */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export type AllowedMime = "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "image/heic";

export function sniffMime(b: Uint8Array): AllowedMime | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, j) => b[i + j] === x);
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf"; // %PDF-
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp"; // RIFF....WEBP
  if (at(4, 0x66, 0x74, 0x79, 0x70) && ["heic", "heix", "mif1", "msf1"].includes(String.fromCharCode(...b.slice(8, 12)))) return "image/heic";
  return null;
}

export function safeFileName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^[._]+/, "");
  return (cleaned || "file").slice(-120);
}
