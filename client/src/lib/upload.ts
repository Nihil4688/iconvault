// Rules for adding icons from files: which files are accepted, how a big selection is split into several requests, how the results of those requests are combined, and how a tag list typed by the user is read.
import type { UploadSummary } from "../api/types";

// The server accepts 200 files and 25 MB per file in one request; batches stay well inside that.
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const BATCH_SIZE = 100;

export type FileProblem = { file: string; message: string };

export function isSvgOrZip(file: { name: string }): boolean {
  return /\.(svg|zip)$/i.test(file.name);
}

// Splits chosen files into the ones to upload and the ones to report back to the user.
export function checkFiles(files: File[]): { accepted: File[]; problems: FileProblem[] } {
  const accepted: File[] = [];
  const problems: FileProblem[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (seen.has(key)) continue; // the same file chosen twice
    seen.add(key);
    if (!isSvgOrZip(file)) problems.push({ file: file.name, message: "Only .svg and .zip files can be added." });
    else if (file.size > MAX_FILE_BYTES) problems.push({ file: file.name, message: "Larger than 25 MB." });
    else if (file.size === 0) problems.push({ file: file.name, message: "The file is empty." });
    else accepted.push(file);
  }
  return { accepted, problems };
}

export function toBatches<T>(items: T[], size = BATCH_SIZE): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

export const EMPTY_SUMMARY: UploadSummary = { created: [], replaced: [], skipped: [], errors: [], foldersCreated: 0 };

export function mergeSummaries(summaries: UploadSummary[]): UploadSummary {
  return summaries.reduce<UploadSummary>(
    (total, next) => ({
      created: [...total.created, ...next.created],
      replaced: [...total.replaced, ...next.replaced],
      skipped: [...total.skipped, ...next.skipped],
      errors: [...total.errors, ...next.errors],
      foldersCreated: total.foldersCreated + next.foldersCreated,
    }),
    EMPTY_SUMMARY,
  );
}

// "UI, nav ,, ui" -> ["ui", "nav"] (lower-case, no blanks, no repeats, at most 50).
export function parseTags(text: string): string[] {
  const tags = text
    .split(",")
    .map((tag) => tag.trim().toLowerCase().slice(0, 40))
    .filter(Boolean);
  return [...new Set(tags)].slice(0, 50);
}
