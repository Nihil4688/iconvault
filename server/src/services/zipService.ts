// Reads SVG files out of an uploaded ZIP, and writes a ZIP for downloads. Reading is defensive: the number of files and their sizes are capped, and hidden or macOS metadata entries are ignored.
import { strToU8, unzipSync, zipSync } from "fflate";
import { BadRequestError } from "../lib/errors.js";
import { MAX_SVG_BYTES } from "./svgSanitizer.js";

export const ZIP_LIMITS = {
  maxSvgFiles: 500,
  maxTotalBytes: 50_000_000,
  maxEntryBytes: MAX_SVG_BYTES,
};

export type ZipSvgEntry = {
  // Folder names leading to the file, e.g. ["UI", "Arrows"] for "UI/Arrows/left.svg".
  folders: string[];
  fileName: string;
  data: Buffer;
};

export type ZipRead = {
  entries: ZipSvgEntry[];
  skipped: { path: string; reason: string }[];
};

export function readSvgsFromZip(buffer: Buffer): ZipRead {
  const skipped: ZipRead["skipped"] = [];
  let accepted = 0;
  let totalBytes = 0;

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buffer), {
      filter: (file) => {
        const path = file.name.replace(/\\/g, "/");
        if (path.endsWith("/")) return false; // a directory entry
        const parts = path.split("/");
        // macOS metadata and hidden files such as ._icon.svg
        if (parts[0] === "__MACOSX" || parts.some((part) => part.startsWith("."))) return false;
        if (!/\.svg$/i.test(path)) return false;

        if (accepted >= ZIP_LIMITS.maxSvgFiles) {
          skipped.push({ path, reason: `The ZIP has more than ${ZIP_LIMITS.maxSvgFiles} SVG files.` });
          return false;
        }
        if (file.originalSize > ZIP_LIMITS.maxEntryBytes) {
          skipped.push({ path, reason: "Larger than 1 MB." });
          return false;
        }
        if (totalBytes + file.originalSize > ZIP_LIMITS.maxTotalBytes) {
          skipped.push({ path, reason: "The ZIP expands to more than 50 MB." });
          return false;
        }
        accepted += 1;
        totalBytes += file.originalSize;
        return true;
      },
    });
  } catch {
    throw new BadRequestError("That file is not a valid ZIP archive.");
  }

  const entries: ZipSvgEntry[] = [];
  for (const [rawPath, data] of Object.entries(files)) {
    const path = rawPath.replace(/\\/g, "/");
    // The size in the header can be wrong; check what was really unpacked.
    if (data.byteLength > ZIP_LIMITS.maxEntryBytes) {
      skipped.push({ path, reason: "Larger than 1 MB." });
      continue;
    }
    const parts = path.split("/");
    entries.push({ folders: parts.slice(0, -1), fileName: parts[parts.length - 1] as string, data: Buffer.from(data) });
  }
  entries.sort((a, b) => [...a.folders, a.fileName].join("/").localeCompare([...b.folders, b.fileName].join("/")));
  return { entries, skipped };
}

// Builds a ZIP from text files. Names must already be unique.
export function buildZip(files: { name: string; content: string }[]): Buffer {
  const input: Record<string, Uint8Array> = {};
  for (const file of files) input[file.name] = strToU8(file.content);
  return Buffer.from(zipSync(input, { level: 6 }));
}
