import { Schema, model, type Model } from "mongoose";
import type { ApiDriveFileType } from "@workspace/types";
import type { DriveEntryKind, DriveEntryRecord, DriveEntryState, DrivePage, DriveShareRecord } from "../drive.types.js";
import type { DriveRepository } from "../repositories/index.js";
import { MAX_DRIVE_STORAGE_QUOTA_BYTES, normalizeDriveName } from "../drive.validation.js";

export const driveEntryKinds = ["file", "folder"] as const;
export const driveEntryStates = ["active", "trashed", "pending_delete"] as const;
export type DriveRepositoryModel = Model<DriveEntryRecord>;

export const driveEntrySchema = new Schema<DriveEntryRecord>({
  _id: { type: String, required: true },
  ownerId: { type: String, required: true },
  kind: { type: String, enum: driveEntryKinds, required: true },
  name: { type: String, required: true, maxlength: 255 },
  normalizedName: { type: String, required: true, maxlength: 255 },
  parentId: { type: String, default: null },
  isStarred: { type: Boolean, default: false, required: true },
  lastAccessedAt: { type: Date },
  mimeType: { type: String },
  sizeBytes: { type: Number, min: 0, max: 50_000_000 },
  storageKey: { type: String },
  state: { type: String, enum: driveEntryStates, default: "active", required: true },
  trashedAt: { type: Date }
}, { timestamps: true, versionKey: false });

driveEntrySchema.index(
  { ownerId: 1, parentId: 1, normalizedName: 1 },
  { unique: true, name: "drive_owner_parent_name_unique" }
);
driveEntrySchema.index(
  { ownerId: 1, parentId: 1, kind: 1, updatedAt: -1, _id: 1 },
  { name: "drive_owner_parent_listing" }
);
driveEntrySchema.index(
  { ownerId: 1, normalizedName: 1, kind: 1 },
  { name: "drive_owner_search" }
);
driveEntrySchema.index(
  { ownerId: 1, state: 1, isStarred: 1, kind: 1, normalizedName: 1, _id: 1 },
  { name: "drive_owner_favorites" }
);
driveEntrySchema.index(
  { ownerId: 1, state: 1, kind: 1, lastAccessedAt: -1, _id: 1 },
  { name: "drive_owner_recent" }
);
driveEntrySchema.index(
  { storageKey: 1 },
  { unique: true, partialFilterExpression: { storageKey: { $type: "string" } }, name: "drive_storage_key_unique" }
);

export const DriveEntryModel = model<DriveEntryRecord>("DriveEntry", driveEntrySchema);

type DriveQuotaReservation = Readonly<{ reservationId: string; sizeBytes: number; expiresAt: Date }>;
type DriveQuotaRecord = Readonly<{ ownerId: string; reservations: readonly DriveQuotaReservation[] }>;
export const driveQuotaSchema = new Schema<DriveQuotaRecord>({
  ownerId: { type: String, required: true },
  reservations: [{
    _id: false,
    reservationId: { type: String, required: true },
    sizeBytes: { type: Number, min: 1, required: true },
    expiresAt: { type: Date, required: true }
  }]
}, { timestamps: false, versionKey: false });
driveQuotaSchema.index({ ownerId: 1 }, { unique: true, name: "drive_quota_owner_unique" });
export const DriveQuotaModel = model<DriveQuotaRecord>("DriveQuota", driveQuotaSchema);

export const driveShareSchema = new Schema<DriveShareRecord>({
  _id: { type: String, required: true },
  ownerId: { type: String, required: true },
  entryId: { type: String, required: true },
  recipientEmail: { type: String, lowercase: true, trim: true, maxlength: 320 },
  tokenHash: { type: String, minlength: 64, maxlength: 64 },
  expiresAt: { type: Date }
}, { timestamps: true, versionKey: false });
driveShareSchema.index(
  { ownerId: 1, entryId: 1, recipientEmail: 1 },
  { unique: true, name: "drive_share_owner_entry_recipient_unique" }
);
driveShareSchema.index({ recipientEmail: 1, _id: 1 }, { name: "drive_share_recipient_lookup" });
driveShareSchema.index(
  { tokenHash: 1 },
  { unique: true, partialFilterExpression: { tokenHash: { $type: "string" } }, name: "drive_share_token_hash_unique" }
);
driveShareSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { tokenHash: { $type: "string" } }, name: "drive_share_link_expiry_ttl" }
);
export type DriveShareRepositoryModel = Model<DriveShareRecord>;
export const DriveShareModel = model<DriveShareRecord>("DriveShare", driveShareSchema);

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === 11000;

export type DriveEntryFilter = Readonly<{
  ownerId: string;
  _id?: string;
  parentId?: string | null;
  kind?: DriveEntryKind;
  state?: DriveEntryState | Readonly<{ $in: readonly DriveEntryState[] }>;
  normalizedName?: Readonly<{ $regex: string }>;
}>;

export type OwnedDeletionEntryFilter = Readonly<{
  ownerId: string;
  _id: string;
  state: Readonly<{ $in: readonly DriveEntryState[] }>;
}>;

type DriveRepositoryDependencies = Readonly<{
  model?: DriveRepositoryModel;
  shareModel?: DriveShareRepositoryModel;
  quotaModel?: Model<DriveQuotaRecord>;
}>;

export const createOwnedEntryFilter = (ownerId: string, entryId: string): DriveEntryFilter =>
  Object.freeze({ ownerId, _id: entryId, state: "active" });

export const createOwnedDeletionEntryFilter = (ownerId: string, entryId: string): OwnedDeletionEntryFilter =>
  Object.freeze({ ownerId, _id: entryId, state: Object.freeze({ $in: ["active", "trashed", "pending_delete"] as const }) });

export const createOwnedChildrenFilter = (
  ownerId: string,
  parentId: string | null,
  kind?: DriveEntryKind
): DriveEntryFilter => Object.freeze({
  ownerId,
  parentId,
  state: Object.freeze({ $in: ["active", "trashed", "pending_delete"] as const }),
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

export const createDriveRepository = ({
  model = DriveEntryModel,
  shareModel = DriveShareModel,
  quotaModel = DriveQuotaModel
}: DriveRepositoryDependencies = {}): DriveRepository => {
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
      state: options.trash ? { $in: ["trashed", "pending_delete"] } : "active",
      ...(options.favorites ? { isStarred: true } : {}),
      ...(options.recent ? { kind: "file", lastAccessedAt: { $type: "date" } } : {}),
      ...(!search && !options.favorites && !options.recent && !options.trash ? { parentId } : {}),
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
      { $match: { ownerId, state: { $in: ["active", "trashed", "pending_delete"] }, kind: "file" } },
      { $group: { _id: null, usedBytes: { $sum: "$sizeBytes" } } },
      { $project: { _id: 0, usedBytes: 1 } }
    ]).exec();
    return usage?.usedBytes ?? 0;
  };

  const reserveOwnedStorageQuota = async (
    ownerId: string,
    reservationId: string,
    sizeBytes: number,
    usedBytes: number,
    expiresAt: Date
  ): Promise<boolean> => {
    try {
      await quotaModel.updateOne({ ownerId } as never, { $setOnInsert: { ownerId, reservations: [] } }, { upsert: true }).exec();
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }

    const now = new Date();
    const activeReservations = {
      $filter: {
        input: { $ifNull: ["$reservations", []] },
        as: "reservation",
        cond: { $gt: ["$$reservation.expiresAt", now] }
      }
    };
    const activeBytes = {
      $sum: {
        $map: { input: activeReservations, as: "reservation", in: "$$reservation.sizeBytes" }
      }
    };
    const reserved = await quotaModel.updateOne({
      ownerId,
      $expr: { $lte: [{ $add: [activeBytes, sizeBytes] }, MAX_DRIVE_STORAGE_QUOTA_BYTES - usedBytes] }
    } as never, [{
      $set: {
        reservations: {
          $concatArrays: [activeReservations, [{ reservationId, sizeBytes, expiresAt }]]
        }
      }
    }] as never, { updatePipeline: true }).exec();
    return reserved.matchedCount === 1;
  };

  const releaseOwnedStorageQuota = async (ownerId: string, reservationId: string): Promise<void> => {
    await quotaModel.updateOne({ ownerId } as never, [{
      $set: {
        reservations: {
          $filter: {
            input: { $ifNull: ["$reservations", []] },
            as: "reservation",
            cond: { $ne: ["$$reservation.reservationId", reservationId] }
          }
        }
      }
    }] as never, { updatePipeline: true }).exec();
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

  const moveOwnedEntryToTrash = async (ownerId: string, entryId: string, trashedAt: Date): Promise<DriveEntryRecord | null> =>
    model.findOneAndUpdate(
      { ownerId, _id: entryId, state: "active" } as never,
      { $set: { state: "trashed", trashedAt } },
      { new: true, runValidators: true }
    ).lean().exec();

  const restoreOwnedEntry = async (ownerId: string, entryId: string): Promise<DriveEntryRecord | null> =>
    model.findOneAndUpdate(
      { ownerId, _id: entryId, state: "trashed" } as never,
      { $set: { state: "active" }, $unset: { trashedAt: 1 } },
      { new: true, runValidators: true }
    ).lean().exec();

  const markOwnedEntryPendingDelete = async (ownerId: string, entryId: string): Promise<DriveEntryRecord | null> =>
    model.findOneAndUpdate(
      { ownerId, _id: entryId, state: { $in: ["trashed", "pending_delete"] } } as never,
      { $set: { state: "pending_delete" } },
      { new: true, runValidators: true }
    ).lean().exec();

  const hasOwnedChildren = async (ownerId: string, parentId: string): Promise<boolean> =>
    await model.exists(createOwnedChildrenFilter(ownerId, parentId) as never) !== null;

  const deleteOwnedEntry = async (ownerId: string, entryId: string): Promise<boolean> => {
    const result = await model.deleteOne({ ownerId, _id: entryId, state: { $in: ["active", "trashed", "pending_delete"] } }).exec();
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

  const createShare = async (share: Omit<DriveShareRecord, "createdAt" | "updatedAt">): Promise<DriveShareRecord> =>
    (await shareModel.create(share)).toObject();

  const createOrRotateLinkShare = async (
    share: Omit<DriveShareRecord, "createdAt" | "updatedAt">
  ): Promise<DriveShareRecord> => {
    const filter = { ownerId: share.ownerId, entryId: share.entryId, tokenHash: { $type: "string" } } as never;
    const rotated = await shareModel.findOneAndUpdate(
      filter,
      { $set: { tokenHash: share.tokenHash, expiresAt: share.expiresAt } },
      { new: true, runValidators: true }
    ).lean().exec();
    if (rotated) return rotated;
    try {
      return (await shareModel.create(share)).toObject();
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const raced = await shareModel.findOneAndUpdate(
        filter,
        { $set: { tokenHash: share.tokenHash, expiresAt: share.expiresAt } },
        { new: true, runValidators: true }
      ).lean().exec();
      if (!raced) throw error;
      return raced;
    }
  };

  const findSharesForOwnedEntry = async (ownerId: string, entryId: string): Promise<readonly DriveShareRecord[]> =>
    shareModel.find({ ownerId, entryId }).sort({ createdAt: 1, _id: 1 }).lean().exec();

  const findShareForRecipient = async (shareId: string, recipientEmail: string): Promise<DriveShareRecord | null> =>
    shareModel.findOne({ _id: shareId, recipientEmail }).lean().exec();

  const findShareByTokenHash = async (tokenHash: string): Promise<DriveShareRecord | null> =>
    shareModel.findOne({ tokenHash }).lean().exec();

  const deleteOwnedShare = async (ownerId: string, entryId: string, shareId: string): Promise<boolean> =>
    (await shareModel.deleteOne({ _id: shareId, ownerId, entryId }).exec()).deletedCount === 1;

  const deleteOwnedEntryShares = async (ownerId: string, entryId: string): Promise<void> => {
    await shareModel.deleteMany({ ownerId, entryId }).exec();
  };

  return Object.freeze({
    findOwnedEntry,
    recordOwnedFileAccess,
    findOwnedEntryForDeletion,
    listOwnedEntries,
    getOwnedStorageUsage,
    reserveOwnedStorageQuota,
    releaseOwnedStorageQuota,
    createEntry,
    hasOwnedUploadEntry,
    updateOwnedEntry,
    moveOwnedEntryToTrash,
    restoreOwnedEntry,
    markOwnedEntryPendingDelete,
    hasOwnedChildren,
    deleteOwnedEntry,
    ensureRoot,
    createShare,
    createOrRotateLinkShare,
    findSharesForOwnedEntry,
    findShareForRecipient,
    findShareByTokenHash,
    deleteOwnedShare,
    deleteOwnedEntryShares
  });
};
