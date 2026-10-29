// Request body schemas (zod) for projects, folders and icons. A failed parse throws a ZodError, which the error handler turns into a 400. Unknown keys are rejected so a typo or a forbidden field (such as changing a project's purpose) never passes silently.
import { z } from "zod";
import { isFontCodepoint } from "./codepoint.js";

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, "must be a valid id");

const projectName = z.string().trim().min(1, "is required").max(100);
const description = z.string().trim().max(500);
const prefix = z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{1,20}$/, "use 1-20 letters, digits, - or _");
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must look like #3b82f6");
const tag = z.string().trim().toLowerCase().min(1).max(40);
const tags = z.array(tag).max(50);
export const codepointSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{4}$/, "must be 4 hex digits")
  .refine(isFontCodepoint, "must be between E000 and F8FF (the Private Use Area)")
  .transform((value) => value.toUpperCase());
const nullableId = objectId.nullable();

export const PURPOSES = ["sprite", "font"] as const;
export const VISIBILITIES = ["public", "private"] as const;
export const DUPLICATE_STRATEGIES = ["rename", "replace", "skip"] as const;

export const createProjectSchema = z
  .object({
    name: projectName,
    description: description.default(""),
    prefix: prefix.default("icon"),
    color: color.default("#3b82f6"),
    purpose: z.enum(PURPOSES).default("sprite"),
    visibility: z.enum(VISIBILITIES).default("private"),
  })
  .strict();

// Purpose is deliberately absent: it cannot change after creation.
export const updateProjectSchema = z
  .object({
    name: projectName,
    description,
    prefix,
    color,
    visibility: z.enum(VISIBILITIES),
    isArchived: z.boolean(),
    // The sidebar's name for icons in no folder; empty goes back to "Uncategorized".
    uncategorizedName: z.string().trim().max(40),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "provide at least one field to change");

export const createFolderSchema = z
  .object({
    name: projectName,
    parentId: nullableId.default(null),
  })
  .strict();

export const renameFolderSchema = z.object({ name: projectName }).strict();

export const moveFolderSchema = z
  .object({
    parentId: nullableId,
    orderIndex: z.number().int().min(0).optional(),
  })
  .strict();

export const updateIconSchema = z
  .object({
    name: projectName,
    folderId: nullableId,
    tags,
    codepoint: codepointSchema.nullable(),
    rawSvg: z.string().min(1).max(1_000_000),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "provide at least one field to change");

const iconIds = z.array(objectId).min(1, "select at least one icon").max(500, "at most 500 icons at a time");

export const batchMoveSchema = z.object({ iconIds, folderId: nullableId }).strict();
export const batchTagSchema = z
  .object({ iconIds, tags: tags.min(1), mode: z.enum(["add", "remove", "set"]).default("add") })
  .strict();
export const batchDeleteSchema = z.object({ iconIds, permanent: z.boolean().default(false) }).strict();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type UpdateIconInput = z.infer<typeof updateIconSchema>;

// Query string of the project list. Values arrive as strings, so numbers are coerced.
export const listProjectsQuerySchema = z.object({
  scope: z.enum(["all", "mine", "public"]).default("all"),
  status: z.enum(["active", "archived", "all"]).default("active"),
  purpose: z.enum(["all", ...PURPOSES]).default("all"),
  // Only the projects of this owner (the admin screens use it to show one user's projects).
  owner: objectId.optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(["updated", "created", "name", "icons"]).default("updated"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

// ---- Icon routes ----

const strategy = z.enum(DUPLICATE_STRATEGIES);
// Query strings and form fields carry booleans as text.
const textBool = z.enum(["true", "false"]).transform((value) => value === "true");
const flexibleBool = z.union([z.boolean(), textBool]);

export const iconIdsSchema = z.object({ iconIds }).strict();

export const pasteIconSchema = z
  .object({
    rawSvg: z.string().min(1, "paste some SVG code").max(1_000_000),
    name: projectName.default("Pasted icon"),
    folderId: nullableId.default(null),
    optimize: z.boolean().default(true),
    tags: tags.default([]),
    strategy: strategy.default("rename"),
  })
  .strict();

export const copyIconsSchema = z
  .object({
    sourceProjectId: objectId,
    iconIds,
    folderId: nullableId.default(null),
    strategy: strategy.default("rename"),
    optimize: z.boolean().default(false),
  })
  .strict();

export const listIconsQuerySchema = z.object({
  folderId: z.union([objectId, z.literal("root")]).optional(),
  includeSubfolders: textBool.default(false),
  search: z.string().trim().max(100).optional(),
  tag: z.string().trim().max(40).optional(),
  trash: textBool.default(false),
  sort: z.enum(["newest", "oldest", "name", "name-desc", "largest", "deleted"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  svg: textBool.default(true),
});

export const iconSearchQuerySchema = z.object({
  q: z.string().trim().min(1, "type something to search for").max(100),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const uploadFieldsSchema = z.object({
  folderId: nullableId.default(null),
  strategy: strategy.default("rename"),
  optimize: flexibleBool.default(true),
  tags: tags.default([]),
});

// Multipart forms send everything as text, so `tags` may be a JSON array or a comma-separated list, and an empty folderId means the project root.
export function parseUploadFields(body: Record<string, unknown> | undefined) {
  const raw = body ?? {};
  let tagList: unknown = raw.tags;
  if (typeof raw.tags === "string") {
    const text = raw.tags.trim();
    if (text.startsWith("[")) {
      try {
        tagList = JSON.parse(text);
      } catch {
        throw new z.ZodError([{ code: "custom", path: ["tags"], message: "must be a JSON array or a comma-separated list", input: raw.tags }]);
      }
    } else {
      tagList = text === "" ? [] : text.split(",");
    }
  }
  return uploadFieldsSchema.parse({
    folderId: raw.folderId === "" || raw.folderId === "root" ? null : raw.folderId,
    strategy: raw.strategy,
    optimize: raw.optimize,
    tags: tagList,
  });
}

export type ListIconsQuery = z.infer<typeof listIconsQuerySchema>;

export const listUsersQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  // Only people who sign in with this provider.
  provider: z.enum(["all", "google", "microsoft"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const deleteUserSchema = z.object({ transferTo: objectId.optional() }).strict();
// The facts sent with a sprite ZIP that is kept in the history (multipart text fields, so they arrive as strings).
export const spriteBuildFieldsSchema = z.object({
  mode: z.enum(["symbol", "stack", "css"]),
  iconCount: z.coerce.number().int().min(0).max(100000),
});

export const transferProjectSchema = z.object({ userId: objectId }).strict();
// Several projects at once (the Manage projects screen): at most 100 per request.
export const bulkTransferSchema = z.object({ projectIds: z.array(objectId).min(1).max(100), userId: objectId }).strict();
export const bulkDeleteProjectsSchema = z.object({ projectIds: z.array(objectId).min(1).max(100) }).strict();

// ---- Icon fonts ----

export const FONT_FORMATS = ["woff2", "woff", "ttf", "eot", "svg"] as const;

export const buildFontSchema = z
  .object({
    scope: z.enum(["all", "folder", "selected"]).default("all"),
    folderId: objectId.optional(),
    iconIds: z.array(objectId).min(1).max(1000).optional(),
    formats: z.array(z.enum(FONT_FORMATS)).min(1, "choose at least one format").default(["woff2", "woff", "ttf"]),
    fontName: z.string().trim().min(1, "is required").max(50).default("IconFont"),
    prefix: z.string().trim().max(20).regex(/^[a-zA-Z0-9_-]*$/, "use letters, digits, - or _").default("icon"),
    // Optional shared class: with it the stylesheet needs class="base prefix-name"; without it any element whose class starts with the prefix works.
    baseClass: z.string().trim().max(30).regex(/^([a-zA-Z][a-zA-Z0-9_-]*)?$/, "start with a letter, then letters, digits, - or _").default(""),
    startCodepoint: z
      .string()
      .trim()
      .regex(/^[0-9a-fA-F]{4}$/, "must be 4 hex digits")
      .refine((value) => parseInt(value, 16) >= 0xe000 && parseInt(value, 16) <= 0xf8ff, "must be between E000 and F8FF")
      .transform((value) => value.toUpperCase())
      .default("E001"),
    reassignCodepoints: z.boolean().default(false),
    codepointOverrides: z.array(z.object({ iconId: objectId, codepoint: codepointSchema }).strict()).max(1000).optional(),
    fontHeight: z.number().int().min(300).max(2048).default(1000),
    descent: z.number().int().min(-1000).max(1000).default(0),
    normalize: z.boolean().default(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.scope === "folder" && !value.folderId) ctx.addIssue({ code: "custom", path: ["folderId"], message: "choose a folder" });
    if (value.scope === "selected" && !value.iconIds) ctx.addIssue({ code: "custom", path: ["iconIds"], message: "choose at least one icon" });
  });
export type BuildFontInput = z.infer<typeof buildFontSchema>;
