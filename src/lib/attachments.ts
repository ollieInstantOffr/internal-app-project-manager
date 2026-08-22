import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { HttpError } from "./auth";

/**
 * Where uploaded files live. A Docker volume in production; ./.attachments
 * locally. Paths are built by concatenation rather than path.join because
 * Next's tracer treats a path call on a dynamic base as a reason to bundle the
 * entire project into the standalone build.
 */
const ROOT = (process.env.ATTACHMENTS_DIR || `${process.cwd()}/.attachments`).replace(/\/+$/, "");

export const MAX_BYTES = 10 * 1024 * 1024;

/**
 * What may be uploaded, and whether a browser may render it inline. SVG is
 * deliberately absent: it can carry script, and serving one inline from our own
 * origin would be stored XSS.
 */
const TYPES: Record<string, { ext: string; inline: boolean }> = {
  "image/png": { ext: "png", inline: true },
  "image/jpeg": { ext: "jpg", inline: true },
  "image/gif": { ext: "gif", inline: true },
  "image/webp": { ext: "webp", inline: true },
  "application/pdf": { ext: "pdf", inline: false },
  "text/plain": { ext: "txt", inline: false },
  "text/csv": { ext: "csv", inline: false },
  "application/json": { ext: "json", inline: false },
  "application/zip": { ext: "zip", inline: false },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    ext: "docx",
    inline: false,
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    ext: "xlsx",
    inline: false,
  },
};

export const ALLOWED_TYPES = Object.keys(TYPES);

export function isAllowed(mimeType: string) {
  return mimeType in TYPES;
}

export function canRenderInline(mimeType: string) {
  return TYPES[mimeType]?.inline === true;
}

/** Keeps only characters that are safe in a path and in a header value. */
export function safeFilename(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "");
  return (cleaned || "file").slice(0, 120);
}

/**
 * Keys are generated, never derived from the filename, and nested two levels so
 * one directory doesn't accumulate every file ever uploaded.
 */
function makeKey(mimeType: string) {
  const id = randomBytes(16).toString("hex");
  const ext = TYPES[mimeType]?.ext ?? "bin";
  return `${id.slice(0, 2)}/${id.slice(2, 4)}/${id}.${ext}`;
}

/** Exactly the shape makeKey produces — nothing else is ever a valid key. */
const KEY_PATTERN = /^[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{32}\.[a-z0-9]{1,5}$/;

function resolve(storageKey: string) {
  // Checking the shape beats comparing resolved paths: a key that matches this
  // cannot contain "..", a leading slash, or anything else that would escape.
  if (!KEY_PATTERN.test(storageKey)) throw new HttpError(400, "Bad attachment path");
  return `${ROOT}/${storageKey}`;
}

export async function store(bytes: Buffer, mimeType: string) {
  if (!isAllowed(mimeType)) throw new HttpError(415, "That file type isn't allowed");
  if (bytes.byteLength > MAX_BYTES) throw new HttpError(413, "That file is over 10 MB");

  const storageKey = makeKey(mimeType);
  const full = resolve(storageKey);
  await mkdir(`${ROOT}/${storageKey.slice(0, storageKey.lastIndexOf("/"))}`, { recursive: true });
  await writeFile(full, bytes);

  return { storageKey, size: bytes.byteLength };
}

export async function load(storageKey: string) {
  return readFile(resolve(storageKey));
}

export async function remove(storageKey: string) {
  await unlink(resolve(storageKey)).catch(() => {});
}
