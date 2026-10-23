import type { Request, Response } from "express";
import type { ApiDriveEntry, ApiDriveFolderPathResponse, ApiDriveListResponse, ApiDriveStorageUsage } from "@workspace/types";
import { pipeline } from "node:stream/promises";
import { ERROR_CODES, ERROR_MESSAGES, HTTP_STATUS } from "../../constants/index.js";
import { createApplicationError } from "../../errors/index.js";
import { driveEntryIdSchema, createFolderSchema, driveFavoriteSchema, driveListQuerySchema, driveUploadMetadataSchema, updateEntrySchema } from "./drive.validation.js";
import type { DriveService } from "./drive.service.js";

type DriveControllerDependencies = Readonly<{ service: DriveService }>;

const toApiDriveEntry = (entry: Awaited<ReturnType<DriveService["createFolder"]>>): ApiDriveEntry => ({
  id: entry._id,
  kind: entry.kind,
  name: entry.name,
  parentId: entry.parentId,
  isStarred: entry.isStarred ?? false,
  ...(entry.mimeType ? { mimeType: entry.mimeType } : {}),
  ...(entry.sizeBytes !== undefined ? { sizeBytes: entry.sizeBytes } : {}),
  createdAt: entry.createdAt.toISOString(),
  updatedAt: entry.updatedAt.toISOString()
});

export const createDriveController = ({ service }: DriveControllerDependencies) => Object.freeze({
  folderPath: async (request: Request, response: Response): Promise<void> => {
    const folderId = driveEntryIdSchema.parse(request.params.id);
    const result: ApiDriveFolderPathResponse = { breadcrumbs: await service.folderPath(folderId) };
    response.status(HTTP_STATUS.ok).json(result);
  },
  list: async (request: Request, response: Response): Promise<void> => {
    const query = driveListQuerySchema.parse(request.query);
    const result = await service.list({
      page: query.page,
      pageSize: query.pageSize,
      ...(typeof query.search === "string" ? { search: query.search } : {}),
      ...(query.favorites === true ? { favorites: true } : {}),
      ...(query.recent === true ? { recent: true } : {}),
      ...(typeof query.parentId === "string" ? { parentId: query.parentId } : {}),
      ...(query.fileType ? { fileType: query.fileType } : {}),
      ...(query.modifiedAfter ? { modifiedAfter: query.modifiedAfter } : {}),
      ...(query.modifiedBefore ? { modifiedBefore: query.modifiedBefore } : {}),
      ...(query.minSizeBytes !== undefined ? { minSizeBytes: query.minSizeBytes } : {}),
      ...(query.maxSizeBytes !== undefined ? { maxSizeBytes: query.maxSizeBytes } : {}),
      ...(query.sortBy ? { sortBy: query.sortBy } : {}),
      ...(query.sortOrder ? { sortOrder: query.sortOrder } : {})
    });
    const body: ApiDriveListResponse = {
      entries: result.entries.map(toApiDriveEntry), total: result.total, parentId: result.parentId
    };
    response.status(HTTP_STATUS.ok).json(body);
  },
  storageUsage: async (_request: Request, response: Response): Promise<void> => {
    const body: ApiDriveStorageUsage = { usedBytes: await service.storageUsage() };
    response.status(HTTP_STATUS.ok).json(body);
  },
  createFolder: async (request: Request, response: Response): Promise<void> => {
    const input = createFolderSchema.parse(request.body);
    const result = await service.createFolder({
      name: input.name,
      ...(typeof input.parentId === "string" ? { parentId: input.parentId } : {})
    });
    response.status(HTTP_STATUS.created).json(toApiDriveEntry(result));
  },
  updateEntry: async (request: Request, response: Response): Promise<void> => {
    const entryId = driveEntryIdSchema.parse(request.params.id);
    const changes = updateEntrySchema.parse(request.body);
    const result = await service.updateEntry(entryId, {
      ...(typeof changes.name === "string" ? { name: changes.name } : {}),
      ...(typeof changes.parentId === "string" ? { parentId: changes.parentId } : {})
    });
    response.status(HTTP_STATUS.ok).json(toApiDriveEntry(result));
  },
  setFavorite: async (request: Request, response: Response): Promise<void> => {
    const entryId = driveEntryIdSchema.parse(request.params.id);
    const input = driveFavoriteSchema.parse(request.body);
    const result = await service.setFavorite(entryId, input.isStarred);
    response.status(HTTP_STATUS.ok).json(toApiDriveEntry(result));
  },
  recordFileAccess: async (request: Request, response: Response): Promise<void> => {
    const entryId = driveEntryIdSchema.parse(request.params.id);
    await service.recordFileAccess(entryId);
    response.status(HTTP_STATUS.noContent).end();
  },
  deleteEntry: async (request: Request, response: Response): Promise<void> => {
    const entryId = driveEntryIdSchema.parse(request.params.id);
    await service.deleteEntry(entryId);
    response.status(HTTP_STATUS.noContent).end();
  },
  uploadFile: async (request: Request, response: Response): Promise<void> => {
    let name: string;
    try {
      name = decodeURIComponent(request.get("x-file-name") ?? "");
    } catch {
      throw createApplicationError({
        code: ERROR_CODES.driveUploadRejected,
        message: ERROR_MESSAGES.driveUploadRejected,
        status: HTTP_STATUS.badRequest
      });
    }
    const metadata = driveUploadMetadataSchema.parse({
      name,
      contentType: request.get("content-type") ?? "",
      contentLength: request.get("content-length")
    });
    const parentIdHeader = request.get("x-drive-parent-id");
    const parentId = parentIdHeader ? driveEntryIdSchema.parse(parentIdHeader) : undefined;
    const file = await service.uploadFile({
      source: request,
      name: metadata.name,
      contentType: metadata.contentType,
      contentLength: metadata.contentLength,
      ...(parentId ? { parentId } : {})
    });
    response.status(HTTP_STATUS.created).json(toApiDriveEntry(file));
  },
  downloadFile: async (request: Request, response: Response): Promise<void> => {
    const entryId = driveEntryIdSchema.parse(request.params.id);
    const file = await service.downloadFile(entryId);
    response.setHeader("Content-Type", file.entry.mimeType ?? file.contentType ?? "application/octet-stream");
    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.entry.name)}`);
    response.setHeader("Content-Length", String(file.entry.sizeBytes ?? 0));
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "no-store");
    await pipeline(file.body, response);
  }
});
