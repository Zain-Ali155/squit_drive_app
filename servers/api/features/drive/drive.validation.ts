import { z } from "zod";

export const driveFileTypes = [
  "folder", "pdf", "document", "spreadsheet", "presentation", "image", "archive", "video", "text"
] as const;

export const driveSortFields = ["name", "updatedAt", "sizeBytes"] as const;
export const driveSortOrders = ["asc", "desc"] as const;
export const MAX_DRIVE_FILE_SIZE = 50_000_000;
export const MAX_DRIVE_STORAGE_QUOTA_BYTES = 1_000_000_000;

export const driveNameSchema = z.string()
  .trim()
  .min(1)
  .max(255)
  .refine((name) => !name.includes("/") && !name.includes("\\") &&
    !Array.from(name).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 31 || code === 127;
    }), "Name contains a prohibited character.");

export const normalizeDriveName = (name: string): string =>
  name.normalize("NFKC").trim().toLowerCase();

export const createFolderSchema = z.object({
  name: driveNameSchema,
  parentId: z.uuid().nullable().optional()
}).strict();

export const renameEntrySchema = z.object({ name: driveNameSchema }).strict();

export const updateEntrySchema = z.object({
  name: driveNameSchema.optional(),
  parentId: z.uuid().optional()
}).strict().refine(({ name, parentId }) => name !== undefined || parentId !== undefined);

export const driveListQuerySchema = z.object({
  parentId: z.uuid().nullable().optional(),
  search: z.string().trim().min(1).max(200).optional(),
  favorites: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  recent: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  trash: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  fileType: z.enum(driveFileTypes).optional(),
  modifiedAfter: z.iso.date().optional(),
  modifiedBefore: z.iso.date().optional(),
  minSizeBytes: z.coerce.number().int().min(0).max(MAX_DRIVE_FILE_SIZE).optional(),
  maxSizeBytes: z.coerce.number().int().min(0).max(MAX_DRIVE_FILE_SIZE).optional(),
  sortBy: z.enum(driveSortFields).optional(),
  sortOrder: z.enum(driveSortOrders).optional()
}).strict()
  .refine(({ modifiedAfter, modifiedBefore }) =>
    modifiedAfter === undefined || modifiedBefore === undefined || modifiedAfter <= modifiedBefore, {
      path: ["modifiedBefore"],
      message: "The modified date range is invalid."
    })
  .refine(({ minSizeBytes, maxSizeBytes }) =>
    minSizeBytes === undefined || maxSizeBytes === undefined || minSizeBytes <= maxSizeBytes, {
      path: ["maxSizeBytes"],
      message: "The file size range is invalid."
    })
  .refine(({ sortBy, sortOrder }) => sortBy !== undefined || sortOrder === undefined, {
    path: ["sortOrder"],
    message: "A sort field is required when a sort order is selected."
  })
  .refine(({ favorites, recent, trash }) => Number(favorites === true) + Number(recent === true) + Number(trash === true) <= 1, {
    path: ["trash"],
    message: "Drive collections cannot be selected together."
  })
  .refine(({ parentId, search, favorites, recent, trash }) =>
    parentId === undefined || (search === undefined && favorites !== true && recent !== true && trash !== true), {
      path: ["parentId"],
      message: "Folder scope cannot be combined with global search, Favorites, Recent, or Trash."
  })
  .refine(({ trash, search, fileType, modifiedAfter, modifiedBefore, minSizeBytes, maxSizeBytes }) =>
    trash !== true || (search === undefined && fileType === undefined && modifiedAfter === undefined &&
      modifiedBefore === undefined && minSizeBytes === undefined && maxSizeBytes === undefined), {
      path: ["trash"],
      message: "Trash cannot be combined with other filters."
  });

export const driveEntryIdSchema = z.uuid();
export const driveFavoriteSchema = z.object({ isStarred: z.boolean() }).strict();
export const driveShareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);

export const driveUploadMetadataSchema = z.object({
  name: driveNameSchema,
  contentType: z.string().min(1).max(255),
  contentLength: z.coerce.number().int().min(1).max(MAX_DRIVE_FILE_SIZE)
}).strict();
