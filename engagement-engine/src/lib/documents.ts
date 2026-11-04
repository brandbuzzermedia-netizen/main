/**
 * Turns an uploaded brand document into plain text for AI context. Runs on the server only.
 * Supported: PDF, Word (.docx), and text formats. The file type is checked by content
 * (magic bytes), not just by name.
 */
export const MAX_TEXT_FILE_BYTES = 1_000_000;
export const MAX_BINARY_FILE_BYTES = 10_000_000;
export const MAX_EXTRACTED_CHARS = 200_000;

export class DocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

export interface ExtractedDocument {
  text: string;
  mime: string;
  kind: "pdf" | "docx" | "text";
  truncated: boolean;
}

const TEXT_EXT = /\.(txt|md|markdown|csv|json)$/i;

function isPdf(b: Uint8Array) {
  return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
}
function isZip(b: Uint8Array) {
  return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04; // PK\x03\x04
}

export function normalizeText(s: string): string {
  return s
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractDocumentText(file: { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }): Promise<ExtractedDocument> {
  if (file.size === 0) throw new DocumentError("The file is empty.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;
  let kind: ExtractedDocument["kind"];
  let mime: string;

  if (isPdf(bytes)) {
    if (file.size > MAX_BINARY_FILE_BYTES) throw new DocumentError("PDFs must be under 10 MB.");
    const { extractText, getDocumentProxy } = await import("unpdf");
    try {
      const pdf = await getDocumentProxy(bytes);
      const r = await extractText(pdf, { mergePages: true });
      text = r.text;
    } catch {
      throw new DocumentError("This PDF couldn't be read. If it's password-protected, remove the password and try again.");
    }
    kind = "pdf";
    mime = "application/pdf";
    if (normalizeText(text).length < 20) throw new DocumentError("No text was found in this PDF. Scanned PDFs need to be converted to text first.");
  } else if (isZip(bytes) && /\.docx$/i.test(file.name)) {
    if (file.size > MAX_BINARY_FILE_BYTES) throw new DocumentError("Word files must be under 10 MB.");
    const mammoth = (await import("mammoth")).default;
    try {
      text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
    } catch {
      throw new DocumentError("This Word file couldn't be read. Save it as .docx and try again.");
    }
    kind = "docx";
    mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } else if (TEXT_EXT.test(file.name) || file.type.startsWith("text/") || file.type === "application/json") {
    if (file.size > MAX_TEXT_FILE_BYTES) throw new DocumentError("Text files must be under 1 MB.");
    text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    kind = "text";
    mime = file.type || "text/plain";
  } else {
    throw new DocumentError("Upload a PDF, Word (.docx), .txt, .md, .csv or .json file. Older .doc files need to be saved as .docx.");
  }

  const clean = normalizeText(text);
  const truncated = clean.length > MAX_EXTRACTED_CHARS;
  return { text: truncated ? clean.slice(0, MAX_EXTRACTED_CHARS) : clean, mime, kind, truncated };
}
