// Uploaded files (screenshots, logos, cover images), stored on disk under
// DATA_DIR/files and served by /api/files/... to signed-in staff, or through
// a signed link on a client share page. Every file lives in its client's
// folder, so one client's files are never stored with another's:
//   <client>/brand/                    logo and cover image
//   <client>/<month-yyyy>/instagram/      Instagram Insights screenshots
//   <client>/<month-yyyy>/meta-ads/       Meta Ads Manager screenshots
//   <client>/<month-yyyy>/<platform>/     other platforms
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";

const ROOT = join(process.env.DATA_DIR || join(process.cwd(), "data"), "files");

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
export const CONTENT_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
export const ACCEPTED_IMAGES = Object.keys(TYPES).join(",");

export interface StoredFile {
  /** Path under the files root, e.g. "wudgres/september-2026/instagram/ab12….png". */
  path: string;
  url: string;
  hash: string;
  name: string;
}

export class UploadError extends Error {}

/** True for a real, non-empty file from a form (browsers send an empty one when nothing is picked). */
export const isFile = (v: FormDataEntryValue | null): v is File => typeof v === "object" && v !== null && v.size > 0;

/** Saves an image under `scope`. The file name is its content hash, so a re-upload is free. */
export async function saveImage(scope: string, file: File): Promise<StoredFile> {
  const ext = TYPES[file.type];
  if (!ext) throw new UploadError(`${file.name} is not a PNG, JPG or WebP image.`);
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError(`${file.name} is larger than 10 MB.`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  const path = `${scope}/${hash.slice(0, 24)}.${ext}`;
  const abs = resolveFile(path);
  if (!abs) throw new UploadError("Invalid upload location.");
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, bytes);
  return { path, url: fileUrl(path), hash, name: file.name.slice(0, 120) };
}

const FOLDERS: Record<string, string> = { meta: "meta-ads", google: "google-ads", linkedin: "linkedin-ads", ga: "google-analytics", gbp: "google-business-profile", yt: "youtube" };

/** Folder for one platform's screenshots in one client month. */
export const screenshotScope = (clientId: string, month: string, platform: string) => `${clientId}/${month}/${FOLDERS[platform] ?? platform}`;
export const brandScope = (clientId: string) => `${clientId}/brand`;

export const fileUrl = (path: string) => `/api/files/${path.split("/").map(encodeURIComponent).join("/")}`;

/** Absolute path for a stored file, or null if the path tries to leave the files root. */
export function resolveFile(path: string): string | null {
  const abs = normalize(join(ROOT, path));
  return abs.startsWith(ROOT + sep) ? abs : null;
}

export async function readStoredFile(path: string): Promise<{ bytes: Buffer; type: string } | null> {
  const abs = resolveFile(path);
  const type = CONTENT_TYPES[path.split(".").pop() ?? ""];
  if (!abs || !type) return null;
  try {
    return { bytes: await readFile(abs), type };
  } catch {
    return null;
  }
}

/** Deletes a client's whole folder, so a later client with the same id never inherits its files. */
export async function removeClientFiles(clientId: string) {
  const abs = resolveFile(clientId);
  if (abs && /^[a-z0-9-]+$/.test(clientId)) await rm(abs, { recursive: true, force: true });
}
