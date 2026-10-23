import { ERROR_CODES, ERROR_MESSAGES, HTTP_STATUS } from "../../constants/index.js";
import { createApplicationError } from "../../errors/index.js";
import type { ApplicationError } from "../../errors/types.js";
import type { Logger } from "@workspace/logging";
import type { Readable } from "node:stream";
import type { DriveEntryRecord, DrivePage } from "./drive.types.js";
import type { DriveRepository } from "./repositories/index.js";
import { createValidatedUploadStream } from "./drive.upload-validation.js";
import type { SupabaseStorageIntegration } from "./integrations/drive.integration.js";
import { normalizeDriveName } from "./drive.validation.js";

export const localDemoOwnerId = "local-demo-owner";

type DriveServiceDependencies = Readonly<{
  repository: DriveRepository;
  logger: Logger;
  ownerId?: string;
  storage?: SupabaseStorageIntegration;
}>;

const notFound = (): ApplicationError => createApplicationError({
  code: ERROR_CODES.driveEntryNotFound,
  message: ERROR_MESSAGES.driveEntryNotFound,
  status: HTTP_STATUS.notFound
});

const conflict = (message: string = ERROR_MESSAGES.driveConflict): ApplicationError => createApplicationError({
  code: ERROR_CODES.driveConflict,
  message,
  status: HTTP_STATUS.conflict
});

const unavailable = (): ApplicationError => createApplicationError({
  code: ERROR_CODES.driveUnavailable,
  message: ERROR_MESSAGES.driveUnavailable,
  status: HTTP_STATUS.serviceUnavailable
});

const rejectedUpload = (): ApplicationError => createApplicationError({
  code: ERROR_CODES.driveUploadRejected,
  message: ERROR_MESSAGES.driveUploadRejected,
  status: HTTP_STATUS.badRequest
});

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === 11000;

export type DriveService = Readonly<{
  folderPath: (folderId: string) => Promise<readonly Readonly<{ id: string; name: string }>[]>;
  list: (options: DrivePage & Readonly<{ parentId?: string }>) => Promise<Readonly<{
    entries: readonly DriveEntryRecord[]; total: number; parentId: string;
  }>>;
  storageUsage: () => Promise<number>;
  recordFileAccess: (entryId: string) => Promise<void>;
  setFavorite: (entryId: string, isStarred: boolean) => Promise<DriveEntryRecord>;
  createFolder: (input: Readonly<{ name: string; parentId?: string }>) => Promise<DriveEntryRecord>;
  updateEntry: (entryId: string, changes: Readonly<{ name?: string; parentId?: string }>) => Promise<DriveEntryRecord>;
  deleteFolder: (entryId: string) => Promise<void>;
  uploadFile: (input: Readonly<{ source: Readable; name: string; contentType: string; contentLength: number; parentId?: string }>) => Promise<DriveEntryRecord>;
  downloadFile: (entryId: string) => Promise<Readonly<{ entry: DriveEntryRecord; body: Readable; contentType: string | null }>>;
  deleteEntry: (entryId: string) => Promise<void>;
}>;

export const createDriveService = ({ repository, logger, ownerId = localDemoOwnerId, storage }: DriveServiceDependencies): DriveService => {
  const requireFolder = async (id: string): Promise<DriveEntryRecord> => {
    const entry = await repository.findOwnedEntry(ownerId, id);
    if (!entry || entry.kind !== "folder") throw notFound();
    return entry;
  };

  const list = async ({ parentId, ...page }: DrivePage & Readonly<{ parentId?: string }>) => {
    const root = await repository.ensureRoot(ownerId);
    const actualParentId = parentId ?? root._id;
    if (!page.favorites && !page.recent) await requireFolder(actualParentId);
    const result = await repository.listOwnedEntries(ownerId, actualParentId, page);
    return Object.freeze({ ...result, parentId: actualParentId });
  };

  const storageUsage = (): Promise<number> => repository.getOwnedStorageUsage(ownerId);

  const recordFileAccess = async (entryId: string): Promise<void> => {
    const recorded = await repository.recordOwnedFileAccess(ownerId, entryId, new Date());
    if (!recorded) throw notFound();
  };

  const setFavorite = async (entryId: string, isStarred: boolean): Promise<DriveEntryRecord> => {
    const entry = await repository.findOwnedEntry(ownerId, entryId);
    if (!entry || entry._id === (await repository.ensureRoot(ownerId))._id) throw notFound();
    const updated = await repository.updateOwnedEntry(ownerId, entryId, { isStarred });
    if (!updated) throw notFound();
    return updated;
  };

  const folderPath = async (folderId: string): Promise<readonly Readonly<{ id: string; name: string }>[]> => {
    const root = await repository.ensureRoot(ownerId);
    let current = await repository.findOwnedEntry(ownerId, folderId);
    if (!current || current.kind !== "folder") throw notFound();

    const visited = new Set<string>();
    const breadcrumbs: { id: string; name: string }[] = [];
    while (current._id !== root._id) {
      if (visited.has(current._id)) throw notFound();
      visited.add(current._id);
      breadcrumbs.push(Object.freeze({ id: current._id, name: current.name }));
      if (current.parentId === null) throw notFound();
      const parent = await repository.findOwnedEntry(ownerId, current.parentId);
      if (!parent || parent.kind !== "folder") throw notFound();
      current = parent;
    }
    breadcrumbs.push(Object.freeze({ id: root._id, name: root.name }));
    return Object.freeze(breadcrumbs.reverse());
  };

  const createFolder = async ({ name, parentId }: Readonly<{ name: string; parentId?: string }>): Promise<DriveEntryRecord> => {
    const root = await repository.ensureRoot(ownerId);
    const actualParentId = parentId ?? root._id;
    await requireFolder(actualParentId);
    try {
      return await repository.createEntry({
        _id: crypto.randomUUID(), ownerId, kind: "folder", name, normalizedName: normalizeDriveName(name),
        parentId: actualParentId, isStarred: false, state: "active"
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) throw conflict("An entry with this name already exists in the folder.");
      throw error;
    }
  };

  const updateEntry = async (
    entryId: string,
    changes: Readonly<{ name?: string; parentId?: string }>
  ): Promise<DriveEntryRecord> => {
    const entry = await repository.findOwnedEntry(ownerId, entryId);
    if (!entry || entry._id === (await repository.ensureRoot(ownerId))._id) throw notFound();
    if (changes.parentId) {
      await requireFolder(changes.parentId);
      if (entry.kind === "folder") {
        let currentParentId: string | null = changes.parentId;
        while (currentParentId !== null) {
          if (currentParentId === entryId) throw conflict("A folder cannot be moved into itself or one of its descendants.");
          const parent = await repository.findOwnedEntry(ownerId, currentParentId);
          if (!parent || parent.kind !== "folder") throw notFound();
          currentParentId = parent.parentId;
        }
      }
    }
    const name = changes.name ?? entry.name;
    try {
      const updated = await repository.updateOwnedEntry(ownerId, entryId, {
        ...(changes.name !== undefined ? { name, normalizedName: normalizeDriveName(name) } : {}),
        ...(changes.parentId !== undefined ? { parentId: changes.parentId } : {})
      });
      if (!updated) throw notFound();
      return updated;
    } catch (error) {
      if (isDuplicateKeyError(error)) throw conflict("An entry with this name already exists in the folder.");
      throw error;
    }
  };

  const deleteFolder = async (entryId: string): Promise<void> => {
    const entry = await repository.findOwnedEntry(ownerId, entryId);
    if (!entry || entry._id === (await repository.ensureRoot(ownerId))._id || entry.kind !== "folder") throw notFound();
    if (await repository.hasOwnedChildren(ownerId, entryId)) throw conflict("A non-empty folder cannot be deleted.");
    if (!await repository.deleteOwnedEntry(ownerId, entryId)) throw notFound();
  };

  const uploadFile = async (input: Readonly<{
    source: Readable; name: string; contentType: string; contentLength: number; parentId?: string;
  }>): Promise<DriveEntryRecord> => {
    const root = await repository.ensureRoot(ownerId);
    const parentId = input.parentId ?? root._id;
    await requireFolder(parentId);
    if (!storage || !await storage.verifyPrivateBucket()) throw unavailable();
    let transfer: ReturnType<typeof createValidatedUploadStream>;
    try {
      transfer = createValidatedUploadStream({
        source: input.source,
        name: input.name,
        contentType: input.contentType,
        contentLength: input.contentLength
      });
    } catch {
      throw rejectedUpload();
    }
    const objectKey = crypto.randomUUID();
    const removePartialObject = async (stage: string, metadataEntryId?: string): Promise<void> => {
      try {
        await storage.removeObject(objectKey);
      } catch (cleanupError) {
        logger.error("Drive upload storage cleanup failed.", {
          event: "drive.upload.cleanup_failed",
          ownerId,
          ...(metadataEntryId ? { metadataEntryId } : {}),
          storageKey: objectKey,
          failureStage: stage,
          errorType: cleanupError instanceof Error ? cleanupError.name : "unknown"
        });
      }
    };
    let sizeBytes: number;
    let storageUpload: Promise<void> = Promise.resolve();
    try {
      storageUpload = storage.uploadObject({
        objectKey,
        contentType: transfer.contentType,
        contentLength: input.contentLength,
        body: transfer.stream
      });
      const [, completedBytes] = await Promise.all([
        storageUpload,
        transfer.completion
      ]);
      sizeBytes = completedBytes;
    } catch (error) {
      transfer.cancel();
      await storageUpload.then(() => undefined, () => undefined);
      await removePartialObject("storage_upload_failure");
      if (error instanceof Error && error.message.includes("content does not match")) throw rejectedUpload();
      if (error instanceof Error && error.message.includes("size limit")) throw rejectedUpload();
      throw unavailable();
    }
    const fileEntry: Omit<DriveEntryRecord, "createdAt" | "updatedAt"> = {
      _id: crypto.randomUUID(),
      ownerId,
      kind: "file",
      name: input.name,
      normalizedName: normalizeDriveName(input.name),
      parentId,
      isStarred: false,
      mimeType: transfer.contentType,
      sizeBytes,
      storageKey: objectKey,
      state: "active"
    };
    try {
      return await repository.createEntry(fileEntry);
    } catch (error) {
      let metadataExists: boolean | undefined;
      try {
        metadataExists = await repository.hasOwnedUploadEntry(ownerId, fileEntry._id, objectKey);
      } catch (statusError) {
        logger.error("Drive upload metadata status is uncertain; storage object requires reconciliation.", {
          event: "drive.upload.metadata_status_uncertain",
          ownerId,
          metadataEntryId: fileEntry._id,
          storageKey: objectKey,
          failureStage: "metadata_status_check",
          errorType: statusError instanceof Error ? statusError.name : "unknown"
        });
      }
      if (metadataExists === false) {
        await removePartialObject("metadata_creation_failure", fileEntry._id);
      } else if (metadataExists === true) {
        logger.warn("Drive upload metadata exists after a creation error; storage object was preserved.", {
          event: "drive.upload.metadata_committed_after_error",
          ownerId,
          metadataEntryId: fileEntry._id,
          storageKey: objectKey
        });
      }
      if (isDuplicateKeyError(error)) throw conflict("An entry with this name already exists in the folder.");
      throw error;
    }
  };

  const downloadFile = async (entryId: string): Promise<Readonly<{
    entry: DriveEntryRecord; body: Readable; contentType: string | null;
  }>> => {
    const entry = await repository.findOwnedEntry(ownerId, entryId);
    if (!entry || entry.kind !== "file" || !entry.storageKey) throw notFound();
    if (!storage) throw unavailable();
    let object: Awaited<ReturnType<SupabaseStorageIntegration["downloadObject"]>>;
    try {
      object = await storage.downloadObject(entry.storageKey);
    } catch {
      throw unavailable();
    }
    if (!object) throw notFound();
    return Object.freeze({ entry, body: object.body, contentType: object.contentType });
  };

  const deleteEntry = async (entryId: string): Promise<void> => {
    let entry = await repository.findOwnedEntryForDeletion(ownerId, entryId);
    if (!entry || entry._id === (await repository.ensureRoot(ownerId))._id) throw notFound();
    if (entry.kind === "folder") {
      if (entry.state !== "active") throw notFound();
      if (await repository.hasOwnedChildren(ownerId, entryId)) throw conflict("A non-empty folder cannot be deleted.");
      if (!await repository.deleteOwnedEntry(ownerId, entryId)) throw notFound();
      return;
    }
    let storageKey = entry.storageKey;
    if (!storageKey || !storage || !await storage.verifyPrivateBucket()) throw unavailable();
    if (entry.state === "active") {
      const pending = await repository.updateOwnedEntry(ownerId, entryId, { state: "pending_delete" });
      if (pending) {
        entry = pending;
      } else {
        const retry = await repository.findOwnedEntryForDeletion(ownerId, entryId);
        if (!retry || retry.state !== "pending_delete" || retry.kind !== "file" || !retry.storageKey) throw notFound();
        entry = retry;
        storageKey = retry.storageKey;
      }
    }
    try {
      await storage.removeObject(storageKey);
    } catch {
      throw unavailable();
    }
    if (!await repository.deleteOwnedEntry(ownerId, entryId) && await repository.findOwnedEntryForDeletion(ownerId, entryId)) {
      throw unavailable();
    }
  };

  return Object.freeze({ folderPath, list, storageUsage, recordFileAccess, setFavorite, createFolder, updateEntry, deleteFolder, uploadFile, downloadFile, deleteEntry });
};
