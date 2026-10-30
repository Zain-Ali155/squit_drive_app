import test from "node:test";
import assert from "node:assert/strict";
import {
  createDriveRepository,
  createOwnedChildrenFilter,
  createOwnedEntryFilter,
  createSupabaseStorageIntegration,
  createValidatedUploadStream,
  escapeSearchTerm
} from "../index.js";
import type { DriveEntryRecord } from "../index.js";
import { Readable } from "node:stream";
import type { Logger, LogContext } from "@workspace/logging";
import { ERROR_CODES } from "../../../constants/index.js";
import { isApplicationError } from "../../../errors/index.js";
import { createDriveService } from "../drive.service.js";
import type { DriveRepository } from "../repositories/index.js";
import type { SupabaseStorageIntegration } from "../integrations/drive.integration.js";
import { driveEntrySchema, driveShareSchema, type DriveRepositoryModel } from "../integrations/drive.mongodb.integration.js";
import { MAX_DRIVE_FILE_SIZE, MAX_DRIVE_STORAGE_QUOTA_BYTES } from "../drive.validation.js";
import {
  createFolderSchema,
  driveEntryIdSchema,
  driveFavoriteSchema,
  driveListQuerySchema,
  normalizeDriveName,
  renameEntrySchema
} from "../drive.validation.js";

void test("folder and rename schemas trim and constrain names", (): void => {
  assert.deepEqual(createFolderSchema.parse({ name: "  Work  " }), { name: "Work" });
  assert.equal(renameEntrySchema.safeParse({ name: "../private" }).success, false);
  assert.equal(createFolderSchema.safeParse({ name: "   " }).success, false);
  assert.equal(normalizeDriveName("  RÉSUMÉ  "), "résumé");
});

void test("listing defaults and caps pagination and accepts search across kinds", (): void => {
  assert.deepEqual(driveListQuerySchema.parse({}), { page: 1, pageSize: 25 });
  assert.equal(driveListQuerySchema.safeParse({ pageSize: 101 }).success, false);
  assert.equal(driveListQuerySchema.parse({ search: "report" }).search, "report");
  assert.equal(driveListQuerySchema.safeParse({ search: " " }).success, false);
});

void test("listing validates file type, modified-date, size, sort, and page filters", (): void => {
  assert.deepEqual(driveListQuerySchema.parse({
    fileType: "pdf",
    modifiedAfter: "2026-10-01",
    modifiedBefore: "2026-10-22",
    minSizeBytes: "10",
    maxSizeBytes: "500",
    sortBy: "updatedAt",
    sortOrder: "desc",
    page: "2"
  }), {
    page: 2,
    pageSize: 25,
    fileType: "pdf",
    modifiedAfter: "2026-10-01",
    modifiedBefore: "2026-10-22",
    minSizeBytes: 10,
    maxSizeBytes: 500,
    sortBy: "updatedAt",
    sortOrder: "desc"
  });
  assert.equal(driveListQuerySchema.safeParse({ fileType: "executable" }).success, false);
  assert.equal(driveListQuerySchema.safeParse({ modifiedAfter: "not-a-date" }).success, false);
  assert.equal(driveListQuerySchema.safeParse({ modifiedAfter: "2026-10-23", modifiedBefore: "2026-10-22" }).success, false);
  assert.equal(driveListQuerySchema.safeParse({ minSizeBytes: "501", maxSizeBytes: "500" }).success, false);
  assert.equal(driveListQuerySchema.safeParse({ minSizeBytes: "-1" }).success, false);
  assert.equal(driveListQuerySchema.safeParse({ sortBy: "createdAt" }).success, false);
  assert.equal(driveListQuerySchema.safeParse({ sortOrder: "desc" }).success, false);
  assert.equal(driveListQuerySchema.parse({ favorites: "true" }).favorites, true);
  assert.equal(driveListQuerySchema.parse({ favorites: "false" }).favorites, false);
  assert.equal(driveListQuerySchema.safeParse({ favorites: "yes" }).success, false);
  assert.equal(driveListQuerySchema.parse({ recent: "true" }).recent, true);
  assert.equal(driveListQuerySchema.safeParse({ recent: "yes" }).success, false);
  assert.equal(driveListQuerySchema.parse({ trash: "true" }).trash, true);
  const folderId = "00000000-0000-4000-8000-000000000001";
  assert.equal(driveListQuerySchema.safeParse({ parentId: folderId, search: "report" }).success, false);
  assert.equal(driveListQuerySchema.safeParse({ parentId: folderId, favorites: "true" }).success, false);
  assert.equal(driveListQuerySchema.safeParse({ parentId: folderId, recent: "true" }).success, false);
  assert.equal(driveListQuerySchema.safeParse({ favorites: "true", recent: "true" }).success, false);
  assert.equal(driveListQuerySchema.safeParse({ trash: "true", search: "report" }).success, false);
  assert.equal(driveListQuerySchema.safeParse({ trash: "true", favorites: "true" }).success, false);
  assert.deepEqual(driveListQuerySchema.parse({ search: "report", favorites: "true", fileType: "pdf" }), {
    search: "report", favorites: true, page: 1, pageSize: 25, fileType: "pdf"
  });
  assert.deepEqual(driveListQuerySchema.parse({ search: "report", recent: "true", fileType: "pdf" }), {
    search: "report", recent: true, page: 1, pageSize: 25, fileType: "pdf"
  });
  assert.deepEqual(driveFavoriteSchema.parse({ isStarred: true }), { isStarred: true });
  assert.equal(driveFavoriteSchema.safeParse({ isStarred: "true" }).success, false);
  assert.equal(driveFavoriteSchema.safeParse({ isStarred: true, ownerId: "owner-b" }).success, false);
});

void test("entry IDs require UUIDs", (): void => {
  assert.equal(driveEntryIdSchema.safeParse("abc").success, false);
});

void test("Mongo schema defines ownership, sibling uniqueness, search, listing and storage-key indexes", (): void => {
  const indexes = driveEntrySchema.indexes();
  assert.equal(indexes.some(([keys, options]) =>
    keys.ownerId === 1 && keys.parentId === 1 && keys.normalizedName === 1 && options.unique === true
  ), true);
  assert.equal(indexes.some(([keys]) => keys.ownerId === 1 && keys.normalizedName === 1), true);
  assert.equal(indexes.some(([keys]) => keys.ownerId === 1 && keys.parentId === 1 && keys.updatedAt === -1), true);
  assert.equal(indexes.some(([keys]) =>
    keys.ownerId === 1 && keys.state === 1 && keys.isStarred === 1
  ), true);
  assert.equal(indexes.some(([keys]) =>
    keys.ownerId === 1 && keys.state === 1 && keys.kind === 1 && keys.lastAccessedAt === -1
  ), true);
  assert.equal(indexes.some(([keys, options]) => keys.storageKey === 1 && options.unique === true), true);
  const shareIndexes = driveShareSchema.indexes();
  assert.equal(shareIndexes.some(([keys, options]) =>
    keys.ownerId === 1 && keys.entryId === 1 && keys.recipientEmail === 1 && options.unique === true
  ), true);
  assert.equal(shareIndexes.some(([keys]) => keys.recipientEmail === 1 && keys._id === 1), true);
});

void test("repository filters keep ownership and child checks include trashed children", (): void => {
  assert.deepEqual(createOwnedEntryFilter("local-demo-owner", "entry-id"), {
    ownerId: "local-demo-owner", _id: "entry-id", state: "active"
  });
  assert.deepEqual(createOwnedChildrenFilter("local-demo-owner", null, "folder"), {
    ownerId: "local-demo-owner", parentId: null, state: { $in: ["active", "trashed", "pending_delete"] }, kind: "folder"
  });
});

void test("search terms are regex escaped", (): void => {
  assert.equal(escapeSearchTerm("a.[b]*"), "a\\.\\[b\\]\\*");
});

void test("Mongo repository keeps reads owner-scoped and searches across all owned entries", async (): Promise<void> => {
  const filters: Record<string, unknown>[] = [];
  const sorts: Record<string, number>[] = [];
  const offsets: number[] = [];
  const limits: number[] = [];
  const model = {
    findOne: (filter: Record<string, unknown>) => {
      filters.push(filter);
      return { lean: () => ({ exec: () => Promise.resolve(null) }) };
    },
    find: (filter: Record<string, unknown>) => {
      filters.push(filter);
      return {
        sort: (sort: Record<string, number>) => {
          sorts.push(sort);
          return {
            skip: (offset: number) => {
              offsets.push(offset);
              return {
                limit: (limit: number) => {
                  limits.push(limit);
                  return { lean: () => ({ exec: () => Promise.resolve([]) }) };
                }
              };
            }
          };
        }
      };
    },
    countDocuments: (filter: Record<string, unknown>) => {
      filters.push(filter);
      return { exec: () => Promise.resolve(0) };
    }
  } as unknown as DriveRepositoryModel;
  const repository = createDriveRepository({ model });

  await repository.findOwnedEntry("local-demo-owner", "entry-id");
  await repository.listOwnedEntries("local-demo-owner", "folder-id", { page: 3, pageSize: 10 });
  await repository.listOwnedEntries("local-demo-owner", "folder-id", { page: 2, pageSize: 5, search: "report" });
  await repository.listOwnedEntries("local-demo-owner", "folder-id", { page: 1, pageSize: 25, favorites: true });
  await repository.listOwnedEntries("local-demo-owner", "ignored-folder", { page: 1, pageSize: 25, trash: true });

  assert.deepEqual(filters[0], { ownerId: "local-demo-owner", _id: "entry-id", state: "active" });
  assert.deepEqual(filters[1], { ownerId: "local-demo-owner", parentId: "folder-id", state: "active" });
  assert.deepEqual(filters[3], {
    ownerId: "local-demo-owner", state: "active", normalizedName: { $regex: "report" }
  });

  assert.deepEqual(filters[5], {
    ownerId: "local-demo-owner", state: "active", isStarred: true
  });
  assert.deepEqual(filters[7], {
    ownerId: "local-demo-owner", state: { $in: ["trashed", "pending_delete"] }
  });
  assert.deepEqual(sorts, [
    { kind: 1, normalizedName: 1, _id: 1 },
    { kind: 1, normalizedName: 1, _id: 1 },
    { kind: 1, normalizedName: 1, _id: 1 },
    { kind: 1, normalizedName: 1, _id: 1 }
  ]);
  assert.deepEqual(offsets, [20, 5, 0, 0]);
  assert.deepEqual(limits, [10, 5, 25, 25]);
});

void test("Mongo storage usage aggregates stored files with the owner filter and returns zero for no matches", async (): Promise<void> => {
  const pipelines: Record<string, unknown>[][] = [];
  let usageRows: readonly Readonly<{ usedBytes: number }>[] = [];
  const model = {
    aggregate: (pipeline: readonly Record<string, unknown>[]) => {
      pipelines.push([...pipeline]);
      return { exec: () => Promise.resolve(usageRows) };
    }
  } as unknown as DriveRepositoryModel;
  const repository = createDriveRepository({ model });

  usageRows = [{ usedBytes: 1_500_000 }];
  assert.equal(await repository.getOwnedStorageUsage("owner-a"), 1_500_000);
  assert.deepEqual(pipelines[0], [
    { $match: { ownerId: "owner-a", state: { $in: ["active", "trashed", "pending_delete"] }, kind: "file" } },
    { $group: { _id: null, usedBytes: { $sum: "$sizeBytes" } } },
    { $project: { _id: 0, usedBytes: 1 } }
  ]);

  usageRows = [];
  assert.equal(await repository.getOwnedStorageUsage("owner-b"), 0);
});

void test("Mongo quota reservations atomically include active leases and are owner-scoped", async (): Promise<void> => {
  const updates: Array<Readonly<{ filter: Record<string, unknown>; update: unknown; options: unknown }>> = [];
  const quotaModel = {
    updateOne: (filter: Record<string, unknown>, update: unknown, options: unknown) => {
      updates.push({ filter, update, options });
      return { exec: () => Promise.resolve({ matchedCount: 1 }) };
    }
  };
  const entryModel = { aggregate: () => ({ exec: () => Promise.resolve([]) }) } as unknown as DriveRepositoryModel;
  const repository = createDriveRepository({ model: entryModel, quotaModel: quotaModel as never });
  const expiresAt = new Date("2026-10-27T20:00:00.000Z");

  assert.equal(await repository.reserveOwnedStorageQuota("owner-a", "reservation-a", 20, 100, expiresAt), true);
  await repository.releaseOwnedStorageQuota("owner-a", "reservation-a");

  assert.equal(updates.length, 3);
  const [initialize, reserve, release] = updates;
  assert.ok(initialize && reserve && release);
  assert.deepEqual(initialize.filter, { ownerId: "owner-a" });
  assert.deepEqual(initialize.options, { upsert: true });
  assert.equal(reserve.filter.ownerId, "owner-a");
  assert.deepEqual(reserve.options, { updatePipeline: true });
  assert.equal(JSON.stringify(reserve.filter).includes("999999900"), true);
  assert.equal(JSON.stringify(reserve.update).includes("reservation-a"), true);
  assert.equal(JSON.stringify(reserve.update).includes("expiresAt"), true);
  assert.equal(release.filter.ownerId, "owner-a");
  assert.deepEqual(release.options, { updatePipeline: true });
  assert.equal(JSON.stringify(release.update).includes("reservation-a"), true);
});

void test("Mongo Recent listing requires active owned files with access timestamps and sorts stably before pagination", async (): Promise<void> => {
  const filters: Record<string, unknown>[] = [];
  const sorts: Record<string, number>[] = [];
  const offsets: number[] = [];
  const model = {
    find: (filter: Record<string, unknown>) => {
      filters.push(filter);
      return {
        sort: (sort: Record<string, number>) => {
          sorts.push(sort);
          return {
            skip: (offset: number) => {
              offsets.push(offset);
              return { limit: () => ({ lean: () => ({ exec: () => Promise.resolve([]) }) }) };
            }
          };
        }
      };
    },
    countDocuments: (filter: Record<string, unknown>) => {
      filters.push(filter);
      return { exec: () => Promise.resolve(0) };
    }
  } as unknown as DriveRepositoryModel;
  const repository = createDriveRepository({ model });

  await repository.listOwnedEntries("owner-a", "ignored-folder", {
    page: 2, pageSize: 10, recent: true, search: "invoice", sortBy: "name", sortOrder: "asc"
  });

  assert.deepEqual(filters[0], {
    ownerId: "owner-a", state: "active", kind: "file", lastAccessedAt: { $type: "date" },
    normalizedName: { $regex: "invoice" }
  });
  assert.deepEqual(filters[1], filters[0]);
  assert.deepEqual(sorts, [{ lastAccessedAt: -1, _id: 1 }]);
  assert.deepEqual(offsets, [10]);
});

void test("Mongo access recording updates one active owned file without changing modification timestamps", async (): Promise<void> => {
  const filters: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const options: Record<string, unknown>[] = [];
  const accessedAt = new Date("2026-10-22T00:00:00.000Z");
  const model = {
    findOneAndUpdate: (
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
      updateOptions: Record<string, unknown>
    ) => {
      filters.push(filter);
      updates.push(update);
      options.push(updateOptions);
      return { lean: () => ({ exec: () => Promise.resolve(null) }) };
    }
  } as unknown as DriveRepositoryModel;
  const repository = createDriveRepository({ model });

  await repository.recordOwnedFileAccess("owner-a", "file-id", accessedAt);

  assert.deepEqual(filters[0], { ownerId: "owner-a", _id: "file-id", state: "active", kind: "file" });
  assert.deepEqual(updates[0], { $set: { lastAccessedAt: accessedAt } });
  assert.deepEqual(options[0], { new: true, runValidators: true, timestamps: false });
});

void test("Mongo listing combines global search with owner, active-state, type, date, size, and stable sorting filters", async (): Promise<void> => {
  const filters: Record<string, unknown>[] = [];
  const sorts: Record<string, number>[] = [];
  const offsets: number[] = [];
  const model = {
    find: (filter: Record<string, unknown>) => {
      filters.push(filter);
      return {
        sort: (sort: Record<string, number>) => {
          sorts.push(sort);
          return {
            skip: (offset: number) => {
              offsets.push(offset);
              return { limit: () => ({ lean: () => ({ exec: () => Promise.resolve([]) }) }) };
            }
          };
        }
      };
    },
    countDocuments: (filter: Record<string, unknown>) => {
      filters.push(filter);
      return { exec: () => Promise.resolve(0) };
    }
  } as unknown as DriveRepositoryModel;
  const repository = createDriveRepository({ model });

  await repository.listOwnedEntries("owner-a", "folder-id", {
    page: 3, pageSize: 10, search: "Report", favorites: true, fileType: "document",
    modifiedAfter: "2026-10-01", modifiedBefore: "2026-10-22",
    minSizeBytes: 100, maxSizeBytes: 500, sortBy: "updatedAt", sortOrder: "desc"
  });

  const filter = filters[0];
  assert.ok(filter);
  assert.equal(filter.ownerId, "owner-a");
  assert.equal(filter.state, "active");
  assert.equal(filter.isStarred, true);
  assert.equal(filter.parentId, undefined);
  assert.deepEqual(filter.normalizedName, { $regex: "report" });
  const conditions = filter.$and;
  assert.ok(Array.isArray(conditions));
  assert.deepEqual(conditions[0], {
    kind: "file",
    $or: [
      { mimeType: { $regex: "^application/(msword|vnd\\.openxmlformats-officedocument\\.wordprocessingml\\.document)$", $options: "i" } },
      { name: { $regex: "\\.(doc|docx)$", $options: "i" } }
    ]
  });
  assert.deepEqual(conditions[1], {
    updatedAt: { $gte: new Date("2026-10-01T00:00:00.000Z"), $lt: new Date("2026-10-23T00:00:00.000Z") }
  });
  assert.deepEqual(conditions[2], { kind: "file", sizeBytes: { $gte: 100, $lte: 500 } });
  assert.deepEqual(filters[1], filter);
  assert.deepEqual(sorts, [{ updatedAt: -1, _id: 1 }]);
  assert.deepEqual(offsets, [20]);
});

void test("Mongo favorite updates require the current owner and active entry state", async (): Promise<void> => {
  const filters: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const now = new Date("2026-10-22T00:00:00.000Z");
  const starred: DriveEntryRecord = {
    _id: "favorite-id", ownerId: "owner-a", kind: "folder", name: "Reports", normalizedName: "reports",
    parentId: "root-id", isStarred: true, state: "active", createdAt: now, updatedAt: now
  };
  const model = {
    findOneAndUpdate: (filter: Record<string, unknown>, update: Record<string, unknown>) => {
      filters.push(filter);
      updates.push(update);
      return { lean: () => ({ exec: () => Promise.resolve(starred) }) };
    }
  } as unknown as DriveRepositoryModel;
  const repository = createDriveRepository({ model });

  const result = await repository.updateOwnedEntry("owner-a", "favorite-id", { isStarred: true });

  assert.equal(result?.isStarred, true);
  assert.deepEqual(filters[0], { ownerId: "owner-a", _id: "favorite-id", state: "active" });
  assert.deepEqual(updates[0], { $set: { isStarred: true } });
});

void test("trash and deletion recovery lookups remain owner-scoped", async (): Promise<void> => {
  const filters: Record<string, unknown>[] = [];
  const model = {
    findOne: (filter: Record<string, unknown>) => {
      filters.push(filter);
      return { lean: () => ({ exec: () => Promise.resolve(null) }) };
    }
  } as unknown as DriveRepositoryModel;
  const repository = createDriveRepository({ model });

  await repository.findOwnedEntryForDeletion("owner-a", "entry-id");

  assert.deepEqual(filters[0], {
    ownerId: "owner-a", _id: "entry-id", state: { $in: ["active", "trashed", "pending_delete"] }
  });
});

void test("Mongo repository scopes metadata writes and permanent-delete operations to the owner", async (): Promise<void> => {
  const filters: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const now = new Date("2026-10-13T00:00:00.000Z");
  const root: DriveEntryRecord = {
    _id: "root-id", ownerId: "local-demo-owner", kind: "folder", name: "My Drive", normalizedName: "my drive",
    parentId: null, isStarred: false, state: "active", createdAt: now, updatedAt: now
  };
  const query = (record: DriveEntryRecord = root) => ({ lean: () => ({ exec: () => Promise.resolve(record) }) });
  const model = {
    create: (entry: Omit<DriveEntryRecord, "createdAt" | "updatedAt">) => Promise.resolve({ ...entry, createdAt: now, updatedAt: now }),
    findOneAndUpdate: (filter: Record<string, unknown>, update: Record<string, unknown>) => {
      filters.push(filter);
      updates.push(update);
      return query();
    },
    exists: (filter: Record<string, unknown>) => {
      filters.push(filter);
      return Promise.resolve({ _id: "child-id" });
    },
    deleteOne: (filter: Record<string, unknown>) => {
      filters.push(filter);
      return { exec: () => Promise.resolve({ deletedCount: 1 }) };
    }
  } as unknown as DriveRepositoryModel;
  const repository = createDriveRepository({ model });

  await repository.createEntry({
    _id: "file-id", ownerId: "local-demo-owner", kind: "file", name: "report.pdf", normalizedName: "report.pdf",
    parentId: "root-id", isStarred: false, mimeType: "application/pdf", sizeBytes: 10, storageKey: "opaque-key", state: "active"
  });
  await repository.updateOwnedEntry("local-demo-owner", "file-id", { state: "pending_delete" });
  assert.equal(await repository.hasOwnedChildren("local-demo-owner", "folder-id"), true);
  assert.equal(await repository.deleteOwnedEntry("local-demo-owner", "file-id"), true);
  await repository.ensureRoot("local-demo-owner");

  assert.deepEqual(filters[0], { ownerId: "local-demo-owner", _id: "file-id", state: "active" });
  assert.deepEqual(updates[0], { $set: { state: "pending_delete" } });
  assert.equal(filters[1]?.ownerId, "local-demo-owner");
  assert.deepEqual(filters[2], { ownerId: "local-demo-owner", _id: "file-id", state: { $in: ["active", "trashed", "pending_delete"] } });
  assert.equal(filters[3]?.ownerId, "local-demo-owner");
  assert.equal(updates[1]?.$setOnInsert !== undefined, true);
});

void test("upload recovery lookup matches the exact owned file ID and storage key", async (): Promise<void> => {
  let capturedFilter: Record<string, unknown> = {};
  const model = {
    exists: (filter: Record<string, unknown>) => {
      capturedFilter = filter;
      return Promise.resolve({ _id: "file-id" });
    }
  } as unknown as DriveRepositoryModel;
  const repository = createDriveRepository({ model });

  assert.equal(await repository.hasOwnedUploadEntry("owner-a", "file-id", "opaque-key"), true);
  assert.deepEqual(capturedFilter, {
    ownerId: "owner-a", _id: "file-id", kind: "file", storageKey: "opaque-key"
  });
});

type UploadRecoveryHarnessOptions = Readonly<{
  metadataLookup: (ownerId: string, entryId: string, storageKey: string) => Promise<boolean>;
  metadataError?: Error;
  failStorageCleanup?: boolean;
  storageUsageBytes?: number;
}>;

const createUploadRecoveryHarness = ({
  metadataLookup,
  metadataError = new Error("metadata create failed"),
  failStorageCleanup = false,
  storageUsageBytes = 0
}: UploadRecoveryHarnessOptions) => {
  const now = new Date();
  const root: DriveEntryRecord = {
    _id: "root-id", ownerId: "local-demo-owner", kind: "folder", name: "My Drive", normalizedName: "my drive",
    parentId: null, isStarred: false, state: "active", createdAt: now, updatedAt: now
  };
  const createdEntries: Omit<DriveEntryRecord, "createdAt" | "updatedAt">[] = [];
  const findOwnedEntryCalls: string[] = [];
  const objects = new Map<string, Buffer>();
  const removedKeys: string[] = [];
  const errorLogs: Readonly<{ message: string; context?: LogContext }>[] = [];
  const warnLogs: Readonly<{ message: string; context?: LogContext }>[] = [];
  const releasedReservations: string[] = [];
  const repository: DriveRepository = {
    findOwnedEntry: (_ownerId, entryId) => {
      findOwnedEntryCalls.push(entryId);
      return Promise.resolve(entryId === root._id ? root : null);
    },
    recordOwnedFileAccess: () => Promise.resolve(null),
    findOwnedEntryForDeletion: () => Promise.resolve(null),
    listOwnedEntries: () => Promise.resolve({ entries: [], total: 0 }),
    getOwnedStorageUsage: () => Promise.resolve(storageUsageBytes),
    reserveOwnedStorageQuota: (_ownerId, _reservationId, sizeBytes, usedBytes) =>
      Promise.resolve(usedBytes + sizeBytes <= MAX_DRIVE_STORAGE_QUOTA_BYTES),
    releaseOwnedStorageQuota: (_ownerId, reservationId) => {
      releasedReservations.push(reservationId);
      return Promise.resolve();
    },
    createEntry: (entry) => {
      createdEntries.push(entry);
      return Promise.reject(metadataError);
    },
    hasOwnedUploadEntry: metadataLookup,
    updateOwnedEntry: () => Promise.resolve(null),
    moveOwnedEntryToTrash: () => Promise.resolve(null),
    restoreOwnedEntry: () => Promise.resolve(null),
    markOwnedEntryPendingDelete: () => Promise.resolve(null),
    hasOwnedChildren: () => Promise.resolve(false),
    deleteOwnedEntry: () => Promise.resolve(false),
    ensureRoot: () => Promise.resolve(root),
    createShare: () => Promise.reject(new Error("Unexpected share creation.")),
    createOrRotateLinkShare: () => Promise.reject(new Error("Unexpected share creation.")),
    findSharesForOwnedEntry: () => Promise.resolve([]),
    findShareForRecipient: () => Promise.resolve(null),
    findShareByTokenHash: () => Promise.resolve(null),
    deleteOwnedShare: () => Promise.resolve(false),
    deleteOwnedEntryShares: () => Promise.resolve()
  };
  const storage: SupabaseStorageIntegration = {
    verifyPrivateBucket: () => Promise.resolve(true),
    uploadObject: async ({ objectKey, body }) => {
      objects.set(objectKey, Buffer.from(await new Response(Readable.toWeb(body)).arrayBuffer()));
    },
    downloadObject: () => Promise.resolve(null),
    removeObject: (objectKey) => {
      removedKeys.push(objectKey);
      if (failStorageCleanup) return Promise.reject(new Error("storage provider details must not leak"));
      objects.delete(objectKey);
      return Promise.resolve();
    }
  };
  const logger: Logger = {
    info: () => undefined,
    warn: (message, context) => warnLogs.push({ message, ...(context ? { context } : {}) }),
    error: (message, context) => errorLogs.push({ message, ...(context ? { context } : {}) })
  };

  return {
    service: createDriveService({ repository, storage, logger, ownerId: "local-demo-owner" }),
    createdEntries,
    findOwnedEntryCalls,
    objects,
    removedKeys,
    releasedReservations,
    errorLogs,
    warnLogs
  };
};

void test("root listings reuse the owner-scoped root while nested listings still validate the folder", async (): Promise<void> => {
  const harness = createUploadRecoveryHarness({ metadataLookup: () => Promise.resolve(false) });
  const rootResult = await harness.service.list({ page: 1, pageSize: 25 });

  assert.equal(rootResult.parentId, "root-id");
  assert.deepEqual(harness.findOwnedEntryCalls, []);

  await assert.rejects(
    harness.service.list({ page: 1, pageSize: 25, parentId: "nested-id" }),
    (error: unknown) => isApplicationError(error) && error.code === ERROR_CODES.driveEntryNotFound
  );
  assert.deepEqual(harness.findOwnedEntryCalls, ["nested-id"]);
});

void test("Drive upload rejects files that exceed the owner's 1 GB quota before writing to Storage", async (): Promise<void> => {
  const input = uploadRecoveryInput();
  const harness = createUploadRecoveryHarness({
    metadataLookup: () => Promise.resolve(false),
    storageUsageBytes: MAX_DRIVE_STORAGE_QUOTA_BYTES - input.contentLength + 1
  });

  await assert.rejects(
    harness.service.uploadFile(input),
    (error: unknown) => isApplicationError(error) && error.code === ERROR_CODES.driveStorageQuotaExceeded
  );
  assert.equal(harness.objects.size, 0);
  assert.deepEqual(harness.releasedReservations, []);
});

void test("Drive upload allows a file that fills the owner's quota exactly", async (): Promise<void> => {
  const input = uploadRecoveryInput();
  const harness = createUploadRecoveryHarness({
    metadataLookup: () => Promise.resolve(false),
    storageUsageBytes: MAX_DRIVE_STORAGE_QUOTA_BYTES - input.contentLength
  });

  await assert.rejects(harness.service.uploadFile(input), /metadata create failed/u);
  assert.equal(harness.objects.size, 0);
  assert.equal(harness.removedKeys.length, 1);
  assert.equal(harness.releasedReservations.length, 1);
});

const uploadRecoveryInput = () => {
  const bytes = Buffer.from("%PDF-1.7 recovery test");
  return {
    source: Readable.from([bytes]),
    name: "recovery.pdf",
    contentType: "application/pdf",
    contentLength: bytes.length
  };
};

void test("metadata creation failure with confirmed absence cleans up the uploaded object", async (): Promise<void> => {
  const harness = createUploadRecoveryHarness({ metadataLookup: () => Promise.resolve(false) });

  await assert.rejects(harness.service.uploadFile(uploadRecoveryInput()), /metadata create failed/u);

  const entry = harness.createdEntries[0];
  assert.ok(entry);
  assert.ok(entry.storageKey);
  assert.deepEqual(harness.removedKeys, [entry.storageKey]);
  assert.equal(harness.objects.has(entry.storageKey), false);
  assert.equal(harness.errorLogs.length, 0);
  assert.equal(harness.releasedReservations.length, 1);
});

void test("metadata creation failure preserves the object when the exact metadata record exists", async (): Promise<void> => {
  const harness = createUploadRecoveryHarness({ metadataLookup: () => Promise.resolve(true) });

  await assert.rejects(harness.service.uploadFile(uploadRecoveryInput()), /metadata create failed/u);

  const entry = harness.createdEntries[0];
  assert.ok(entry);
  assert.ok(entry.storageKey);
  assert.deepEqual(harness.removedKeys, []);
  assert.equal(harness.objects.has(entry.storageKey), true);
  assert.equal(harness.warnLogs[0]?.context?.storageKey, entry.storageKey);
});

void test("metadata creation failure preserves the object when metadata status is uncertain", async (): Promise<void> => {
  const harness = createUploadRecoveryHarness({
    metadataLookup: () => Promise.reject(new Error("database lookup details must not leak"))
  });

  await assert.rejects(harness.service.uploadFile(uploadRecoveryInput()), /metadata create failed/u);

  const entry = harness.createdEntries[0];
  assert.ok(entry);
  assert.ok(entry.storageKey);
  assert.deepEqual(harness.removedKeys, []);
  assert.equal(harness.objects.has(entry.storageKey), true);
  const diagnostic = harness.errorLogs[0];
  assert.ok(diagnostic?.context);
  assert.equal(diagnostic.context.event, "drive.upload.metadata_status_uncertain");
  assert.equal(diagnostic.context.storageKey, entry.storageKey);
});

void test("confirmed absence with failed Storage cleanup records a reconciliation diagnostic", async (): Promise<void> => {
  const harness = createUploadRecoveryHarness({
    metadataLookup: () => Promise.resolve(false),
    failStorageCleanup: true
  });

  await assert.rejects(harness.service.uploadFile(uploadRecoveryInput()), /metadata create failed/u);

  const entry = harness.createdEntries[0];
  assert.ok(entry);
  assert.ok(entry.storageKey);
  assert.equal(harness.objects.has(entry.storageKey), true);
  const diagnostic = harness.errorLogs[0];
  assert.ok(diagnostic?.context);
  assert.equal(diagnostic.context.event, "drive.upload.cleanup_failed");
  assert.equal(diagnostic.context.storageKey, entry.storageKey);
  assert.equal(diagnostic.context.metadataEntryId, entry._id);
  assert.equal(JSON.stringify(harness.errorLogs).includes("storage provider details must not leak"), false);
});

void test("duplicate metadata creation still returns a conflict after safe cleanup", async (): Promise<void> => {
  const duplicateError = Object.assign(new Error("duplicate key"), { code: 11000 });
  const harness = createUploadRecoveryHarness({
    metadataLookup: () => Promise.resolve(false),
    metadataError: duplicateError
  });

  await assert.rejects(
    harness.service.uploadFile(uploadRecoveryInput()),
    (error: unknown) => isApplicationError(error) && error.code === ERROR_CODES.driveConflict
  );

  const entry = harness.createdEntries[0];
  assert.ok(entry);
  assert.ok(entry.storageKey);
  assert.deepEqual(harness.removedKeys, [entry.storageKey]);
  assert.equal(harness.objects.has(entry.storageKey), false);
});

void test("Supabase bucket verification uses the configured bucket and server API-key header", async (): Promise<void> => {
  let capturedUrl = "";
  let capturedHeaders = new Headers();
  const integration = createSupabaseStorageIntegration({
    config: {
      url: "https://project.supabase.co", bucket: "private-files", secretKey: "test-only-placeholder"
    },
    fetchImpl: (input, init) => {
      capturedUrl = input;
      capturedHeaders = new Headers(init.headers);
      return Promise.resolve(Response.json({ public: false }));
    }
  });

  assert.equal(await integration.verifyPrivateBucket(), true);
  assert.equal(capturedUrl, "https://project.supabase.co/storage/v1/bucket/private-files");
  assert.equal(capturedHeaders.has("apikey"), true);
  assert.equal(capturedHeaders.has("authorization"), false);
});

void test("Supabase verification rejects public, missing, and unreachable buckets", async (): Promise<void> => {
  const config = { url: "https://project.supabase.co", bucket: "private-files", secretKey: "test-only-placeholder" };
  const publicBucket = createSupabaseStorageIntegration({ config, fetchImpl: () => Promise.resolve(Response.json({ public: true })) });
  const missingBucket = createSupabaseStorageIntegration({ config, fetchImpl: () => Promise.resolve(new Response(null, { status: 404 })) });
  const unreachable = createSupabaseStorageIntegration({ config, fetchImpl: () => Promise.reject(new Error("network detail")) });

  assert.equal(await publicBucket.verifyPrivateBucket(), false);
  assert.equal(await missingBucket.verifyPrivateBucket(), false);
  assert.equal(await unreachable.verifyPrivateBucket(), false);
});

void test("validated upload stream accepts a matching PDF without buffering the full body", async (): Promise<void> => {
  const content = Buffer.from("%PDF-1.7 sample document");
  const upload = createValidatedUploadStream({
    source: Readable.from([content]), name: "report.pdf", contentType: "application/pdf", contentLength: content.length
  });
  const received = Buffer.from(await new Response(Readable.toWeb(upload.stream)).arrayBuffer());

  assert.equal(await upload.completion, content.length);
  assert.deepEqual(received, content);
  assert.equal(MAX_DRIVE_FILE_SIZE, 50_000_000);
  assert.equal(MAX_DRIVE_STORAGE_QUOTA_BYTES, 1_000_000_000);
});

void test("validated upload stream accepts existing preview document, text, and image formats", async (): Promise<void> => {
  const previewCases = [
    ["report.pdf", "application/pdf", Buffer.from("%PDF-1.7 preview")],
    ["report.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", Buffer.from([0x50, 0x4b, 0x03, 0x04])],
    ["slides.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", Buffer.from([0x50, 0x4b, 0x03, 0x04])],
    ["table.csv", "text/csv", Buffer.from("name,value\nfirst,1\n")],
    ["notes.txt", "text/plain", Buffer.from("Plain UTF-8 text")],
    ["photo.png", "image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]
  ] as const;

  for (const [name, contentType, bytes] of previewCases) {
    const upload = createValidatedUploadStream({
      source: Readable.from([bytes]), name, contentType, contentLength: bytes.length
    });
    const streamErrors: Error[] = [];
    upload.stream.on("error", (error: Error) => streamErrors.push(error));
    let received: Buffer;
    try {
      received = Buffer.from(await new Response(Readable.toWeb(upload.stream)).arrayBuffer());
    } catch (error) {
      throw new Error(`${name}: ${streamErrors[0]?.message ?? (error instanceof Error ? error.message : "stream failed")}`);
    }
    assert.deepEqual(received, bytes, name);
    assert.equal(await upload.completion, bytes.length, name);
    assert.equal(upload.contentType, contentType, name);
  }
});

void test("validated upload stream rejects executable signatures, MIME mismatch, and actual-size overflow", async (): Promise<void> => {
  const executable = createValidatedUploadStream({
    source: Readable.from([Buffer.from("MZ executable")]), name: "document.pdf", contentType: "application/pdf", contentLength: 13
  });
  executable.stream.on("error", () => undefined);
  await assert.rejects(executable.completion, /content does not match/u);

  assert.throws(() => createValidatedUploadStream({
    source: Readable.from([Buffer.from("%PDF-1.7")]), name: "document.pdf", contentType: "image/png", contentLength: 8
  }), /name and media type/u);

  const overflow = createValidatedUploadStream({
    source: Readable.from([Buffer.from("%PDF-1.7 extra")]), name: "document.pdf", contentType: "application/pdf", contentLength: 8
  });
  overflow.stream.on("error", () => undefined);
  await assert.rejects(overflow.completion, /size limit/u);
});

void test("validated upload stream accepts archive signatures and preserves their original bytes", async (): Promise<void> => {
  const archiveCases = [
    ["bundle.rar", "application/vnd.rar", Buffer.from("Rar!\x1a\x07\x00archive bytes")],
    ["bundle.7z", "application/x-7z-compressed", Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0x00])],
    ["bundle.zip", "application/zip", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])],
    ["bundle.tar.gz", "application/gzip", Buffer.from([0x1f, 0x8b, 0x08, 0x00])]
  ] as const;

  for (const [name, contentType, bytes] of archiveCases) {
    const upload = createValidatedUploadStream({
      source: Readable.from([bytes]), name, contentType, contentLength: bytes.length
    });
    const streamErrors: Error[] = [];
    upload.stream.on("error", (error: Error) => streamErrors.push(error));
    let received: Buffer;
    try {
      received = Buffer.from(await new Response(Readable.toWeb(upload.stream)).arrayBuffer());
    } catch (error) {
      throw new Error(`${name}: ${streamErrors[0]?.message ?? (error instanceof Error ? error.message : "stream failed")}`);
    }
    assert.equal(await upload.completion, bytes.length, name);
    assert.deepEqual(received, bytes, name);
    assert.equal(upload.contentType, contentType, name);
  }

  const tarHeader = Buffer.alloc(512);
  tarHeader.write("file.txt", 0);
  tarHeader.write("0000644\0", 100);
  tarHeader.fill(32, 148, 156);
  tarHeader.write("ustar\0", 257);
  const checksum = tarHeader.reduce((sum, byte) => sum + byte, 0);
  tarHeader.write(checksum.toString(8).padStart(6, "0"), 148);
  tarHeader[154] = 0;
  tarHeader[155] = 32;
  const tarUpload = createValidatedUploadStream({
    source: Readable.from([tarHeader]), name: "bundle.tar", contentType: "application/x-tar", contentLength: tarHeader.length
  });
  const receivedTar = Buffer.from(await new Response(Readable.toWeb(tarUpload.stream)).arrayBuffer());
  assert.equal(await tarUpload.completion, tarHeader.length);
  assert.deepEqual(receivedTar, tarHeader);
});

void test("validated upload stream accepts safe source text and opaque unknown binary files", async (): Promise<void> => {
  const sourceBytes = Buffer.from("#!/usr/bin/env node\nconsole.log('safe as an attachment');\n");
  const sourceUpload = createValidatedUploadStream({
    source: Readable.from([sourceBytes]), name: "script.ts", contentType: "text/typescript", contentLength: sourceBytes.length
  });
  const receivedSource = Buffer.from(await new Response(Readable.toWeb(sourceUpload.stream)).arrayBuffer());
  assert.deepEqual(receivedSource, sourceBytes);
  assert.equal(sourceUpload.contentType, "text/plain");
  assert.equal(await sourceUpload.completion, sourceBytes.length);

  const unknownBytes = Buffer.from([0x00, 0xff, 0x13, 0x37, 0x01]);
  const unknownUpload = createValidatedUploadStream({
    source: Readable.from([unknownBytes]), name: "backup.custom", contentType: "application/x-custom", contentLength: unknownBytes.length
  });
  const receivedUnknown = Buffer.from(await new Response(Readable.toWeb(unknownUpload.stream)).arrayBuffer());
  assert.deepEqual(receivedUnknown, unknownBytes);
  assert.equal(unknownUpload.contentType, "application/octet-stream");
  assert.equal(await unknownUpload.completion, unknownBytes.length);

  const reservedExtensionUpload = createValidatedUploadStream({
    source: Readable.from([unknownBytes]),
    name: "backup.constructor",
    contentType: "application/x-custom",
    contentLength: unknownBytes.length
  });
  const receivedReservedExtension = Buffer.from(await new Response(Readable.toWeb(reservedExtensionUpload.stream)).arrayBuffer());
  assert.deepEqual(receivedReservedExtension, unknownBytes);
  assert.equal(reservedExtensionUpload.contentType, "application/octet-stream");
  assert.equal(await reservedExtensionUpload.completion, unknownBytes.length);
});

void test("validated upload stream blocks prohibited types and extension, MIME, or content mismatches", async (): Promise<void> => {
  assert.throws(() => createValidatedUploadStream({
    source: Readable.from([Buffer.from("not executable")]), name: "installer.exe", contentType: "application/octet-stream",
    contentLength: 14
  }), /prohibited/u);

  const mismatchedPdf = createValidatedUploadStream({
    source: Readable.from([Buffer.from([0x50, 0x4b, 0x03, 0x04])]),
    name: "report.pdf",
    contentType: "application/pdf",
    contentLength: 4
  });
  mismatchedPdf.stream.on("error", () => undefined);
  await assert.rejects(mismatchedPdf.completion, /content does not match/u);

  assert.throws(() => createValidatedUploadStream({
    source: Readable.from([Buffer.from("%PDF-1.7")]), name: "report.pdf", contentType: "image/jpeg", contentLength: 8
  }), /name and media type/u);

  const mismatchedUnknownMime = createValidatedUploadStream({
    source: Readable.from([Buffer.from("not a jpeg")]),
    name: "backup.custom",
    contentType: "image/jpeg",
    contentLength: 10
  });
  mismatchedUnknownMime.stream.on("error", () => undefined);
  await assert.rejects(mismatchedUnknownMime.completion, /content does not match/u);

  const executableBytes = Buffer.from("MZ executable");
  const disguisedExecutable = createValidatedUploadStream({
    source: Readable.from([executableBytes]),
    name: "payload.custom",
    contentType: "application/octet-stream",
    contentLength: executableBytes.length
  });
  disguisedExecutable.stream.on("error", () => undefined);
  await assert.rejects(disguisedExecutable.completion, /content does not match/u);

  const invalidTextBytes = Buffer.from([0x61, 0x00, 0x62]);
  const invalidText = createValidatedUploadStream({
    source: Readable.from([invalidTextBytes]), name: "notes.txt", contentType: "text/plain", contentLength: invalidTextBytes.length
  });
  invalidText.stream.on("error", () => undefined);
  await assert.rejects(invalidText.completion, /content does not match/u);
});

void test("upload metadata retains the 50,000,000-byte limit", (): void => {
  assert.throws(() => createValidatedUploadStream({
    source: Readable.from([]),
    name: "too-large.bin",
    contentType: "application/octet-stream",
    contentLength: MAX_DRIVE_FILE_SIZE + 1
  }));
});

void test("Supabase file upload and download stream through the private API boundary", async (): Promise<void> => {
  const requests: Readonly<{ url: string; method: string; headers: Headers }>[] = [];
  const integration = createSupabaseStorageIntegration({
    config: { url: "https://project.supabase.co", bucket: "private-files", secretKey: "test-only-placeholder" },
    fetchImpl: (input, init) => {
      requests.push({ url: input, method: init.method ?? "GET", headers: new Headers(init.headers) });
      if (input.endsWith("/storage/v1/bucket/private-files")) return Promise.resolve(Response.json({ public: false }));
      if (init.method === "POST") return Promise.resolve(new Response(null, { status: 200 }));
      return Promise.resolve(new Response("file bytes", { headers: { "content-type": "application/pdf" } }));
    }
  });
  const body = Readable.from([Buffer.from("%PDF-1.7 sample")]);

  await integration.uploadObject({ objectKey: "opaque-id", contentType: "application/pdf", contentLength: 15, body });
  const downloaded = await integration.downloadObject("opaque-id");
  assert.ok(downloaded);
  const received = Buffer.from(await new Response(Readable.toWeb(downloaded.body)).arrayBuffer());

  assert.equal(received.toString("utf8"), "file bytes");
  assert.equal(requests.some((request) => request.method === "POST" && request.url.endsWith("/storage/v1/object/private-files/opaque-id")), true);
  assert.equal(requests.some((request) => request.url.includes("/public/")), false);
  assert.equal(requests.every((request) => request.headers.has("apikey")), true);
  assert.equal(requests.some((request) => request.headers.has("authorization")), false);
});
