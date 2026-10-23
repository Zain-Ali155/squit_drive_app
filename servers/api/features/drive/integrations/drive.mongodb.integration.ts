import { DriveEntryModel, type DriveRepositoryModel } from "../models/index.js";
import type { ApiDriveFileType } from "@workspace/types";
import type { DriveEntryKind, DriveEntryRecord, DriveEntryState, DrivePage } from "../drive.types.js";
import type { DriveRepository } from "../repositories/index.js";
import { normalizeDriveName } from "../drive.validation.js";

export type DriveEntryFilter = Readonly<{
  ownerId: string;
  _id?: string;
  parentId?: string | null;
  kind?: DriveEntryKind;
  state?: DriveEntryState;
  normalizedName?: Readonly<{ $regex: string }>;
}>;

export type OwnedDeletionEntryFilter = Readonly<{
  ownerId: string;
  _id: string;
  state: Readonly<{ $in: readonly DriveEntryState[] }>;
}>;

type DriveRepositoryDependencies = Readonly<{ model?: DriveRepositoryModel }>;

export const createOwnedEntryFilter = (ownerId: string, entryId: string): DriveEntryFilter =>
  Object.freeze({ ownerId, _id: entryId, state: "active" });

export const createOwnedDeletionEntryFilter = (ownerId: string, entryId: string): OwnedDeletionEntryFilter =>
  Object.freeze({ ownerId, _id: entryId, state: Object.freeze({ $in: ["active", "pending_delete"] as const }) });

export const createOwnedChildrenFilter = (
  ownerId: string,
  parentId: string | null,
  kind?: DriveEntryKind
): DriveEntryFilter => Object.freeze({
  ownerId,
  parentId,
  state: "active",
  ...(kind ? { kind } : {})
});

export const escapeSearchTerm = (search: string): string =>
  search.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const fileTypePatterns: Readonly<Record<Exclude<ApiDriveFileType, "folder">, readonly [string, string]>> = Object.freeze({
  pdf: ["^application/pdf$", "\\.pdf$"],
  document: [
    "^application/(msword|vnd\\.openxmlformats-officedocument\\.wordprocessingml\\.document)$",
    "\\.(doc|docx)$"
  ],
  spreadsheet: [
    "^(application/vnd\\.(ms-excel|openxmlformats-officedocument\\.spreadsheetml\\.sheet)|text/csv|application/csv)$",
    "\\.(xls|xlsx|csv)$"
  ],
  presentation: [
    "^application/(vnd\\.ms-powerpoint|vnd\\.openxmlformats-officedocument\\.presentationml\\.presentation)$",
    "\\.(ppt|pptx)$"
  ],
  image: ["^image/", "\\.(apng|avif|bmp|gif|heic|heif|ico|jpe?g|jp2|png|svg|tiff?|webp)$"],
  archive: [
    "^application/(zip|x-(7z|rar|gzip|tar|bzip2|xz|zstd))$",
    "\\.(7z|bz2|gz|rar|tar|tgz|zip|xz|zst|zstd)$"
  ],
  video: ["^video/", "\\.(avi|m4v|mkv|mov|mp4|mpeg|mpg|webm|wmv)$"],
  text: ["^text/plain$", "\\.txt$"]
});

const createFileTypeFilter = (fileType: ApiDriveFileType): Record<string, unknown> => {
  if (fileType === "folder") return { kind: "folder" };
  const [mimeTypePattern, namePattern] = fileTypePatterns[fileType];
  return {
    kind: "file",
    $or: [
      { mimeType: { $regex: mimeTypePattern, $options: "i" } },
      { name: { $regex: namePattern, $options: "i" } }
    ]
  };
};

export const createDriveRepository = ({ model = DriveEntryModel }: DriveRepositoryDependencies = {}): DriveRepository => {
  const findOwnedEntry = async (ownerId: string, entryId: string): Promise<DriveEntryRecord | null> =>
    model.findOne(createOwnedEntryFilter(ownerId, entryId) as never).lean().exec();

  const recordOwnedFileAccess = async (ownerId: string, entryId: string, accessedAt: Date): Promise<DriveEntryRecord | null> =>
    model.findOneAndUpdate(
      { ...createOwnedEntryFilter(ownerId, entryId), kind: "file" } as never,
      { $set: { lastAccessedAt: accessedAt } },
      { new: true, runValidators: true, timestamps: false }
    ).lean().exec();

  const findOwnedEntryForDeletion = async (ownerId: string, entryId: string): Promise<DriveEntryRecord | null> =>
    model.findOne(createOwnedDeletionEntryFilter(ownerId, entryId) as never).lean().exec();

  const listOwnedEntries = async (
    ownerId: string,
    parentId: string | null,
    options: DrivePage
  ): Promise<Readonly<{ entries: readonly DriveEntryRecord[]; total: number }>> => {
    const {
      page, pageSize, search, fileType, modifiedAfter, modifiedBefore, minSizeBytes, maxSizeBytes, sortBy, sortOrder
    } = options;
    const filter: Record<string, unknown> = {
      ownerId,
      state: "active",
      ...(options.favorites ? { isStarred: true } : {}),
      ...(options.recent ? { kind: "file", lastAccessedAt: { $type: "date" } } : {}),
      ...(!search && !options.favorites && !options.recent ? { parentId } : {}),
      ...(search ? { normalizedName: { $regex: escapeSearchTerm(normalizeDriveName(search)) } } : {})
    };
    const conditions: Record<string, unknown>[] = [];
    if (fileType) conditions.push(createFileTypeFilter(fileType));
    if (modifiedAfter || modifiedBefore) {
      const updatedAt: Record<string, Date> = {};
      if (modifiedAfter) updatedAt.$gte = new Date(`${modifiedAfter}T00:00:00.000Z`);
      if (modifiedBefore) {
        const exclusiveEnd = new Date(`${modifiedBefore}T00:00:00.000Z`);
        exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
        updatedAt.$lt = exclusiveEnd;
      }
      conditions.push({ updatedAt });
    }
    if (minSizeBytes !== undefined || maxSizeBytes !== undefined) {
      const sizeBytes: Record<string, number> = {};
      if (minSizeBytes !== undefined) sizeBytes.$gte = minSizeBytes;
      if (maxSizeBytes !== undefined) sizeBytes.$lte = maxSizeBytes;
      conditions.push({ kind: "file", sizeBytes });
    }
    if (conditions.length > 0) filter.$and = conditions;
    const direction: 1 | -1 = sortOrder === "desc" ? -1 : 1;
    const sort: Record<string, 1 | -1> = options.recent
      ? { lastAccessedAt: -1, _id: 1 }
      : sortBy === "name"
      ? { normalizedName: direction, _id: 1 }
      : sortBy === "updatedAt"
        ? { updatedAt: direction, _id: 1 }
        : sortBy === "sizeBytes"
          ? { sizeBytes: direction, _id: 1 }
          : { kind: 1, normalizedName: 1, _id: 1 };
    const [entries, total] = await Promise.all([
      model.find(filter as never).sort(sort).skip((page - 1) * pageSize).limit(pageSize).lean().exec(),
      model.countDocuments(filter as never).exec()
    ]);
    return Object.freeze({ entries, total });
  };

  const getOwnedStorageUsage = async (ownerId: string): Promise<number> => {
    const [usage] = await model.aggregate<Readonly<{ usedBytes: number }>>([
      { $match: { ownerId, state: "active", kind: "file" } },
      { $group: { _id: null, usedBytes: { $sum: "$sizeBytes" } } },
      { $project: { _id: 0, usedBytes: 1 } }
    ]).exec();
    return usage?.usedBytes ?? 0;
  };

  const createEntry = async (entry: Omit<DriveEntryRecord, "createdAt" | "updatedAt">): Promise<DriveEntryRecord> =>
    model.create(entry);

  const hasOwnedUploadEntry = async (ownerId: string, entryId: string, storageKey: string): Promise<boolean> =>
    await model.exists({ ownerId, _id: entryId, kind: "file", storageKey }) !== null;

  const updateOwnedEntry = async (
    ownerId: string,
    entryId: string,
    changes: Readonly<{ name?: string; parentId?: string | null; normalizedName?: string; state?: DriveEntryState; isStarred?: boolean }>
  ): Promise<DriveEntryRecord | null> => model.findOneAndUpdate(
    createOwnedEntryFilter(ownerId, entryId) as never,
    { $set: changes },
    { new: true, runValidators: true }
  ).lean().exec();

  const hasOwnedChildren = async (ownerId: string, parentId: string): Promise<boolean> =>
    await model.exists(createOwnedChildrenFilter(ownerId, parentId) as never) !== null;

  const deleteOwnedEntry = async (ownerId: string, entryId: string): Promise<boolean> => {
    const result = await model.deleteOne({ ownerId, _id: entryId, state: { $in: ["active", "pending_delete"] } }).exec();
    return result.deletedCount === 1;
  };

  const ensureRoot = async (ownerId: string): Promise<DriveEntryRecord> => {
    const rootId = crypto.randomUUID();
    const root = await model.findOneAndUpdate(
      { ownerId, kind: "folder", parentId: null, normalizedName: "my drive" },
      { $setOnInsert: { _id: rootId, name: "My Drive", state: "active", isStarred: false } },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean().exec();
    return root;
  };

  return Object.freeze({
    findOwnedEntry,
    recordOwnedFileAccess,
    findOwnedEntryForDeletion,
    listOwnedEntries,
    getOwnedStorageUsage,
    createEntry,
    hasOwnedUploadEntry,
    updateOwnedEntry,
    hasOwnedChildren,
    deleteOwnedEntry,
    ensureRoot
  });
};
