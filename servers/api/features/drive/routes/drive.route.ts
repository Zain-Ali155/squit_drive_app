import { Router, type RequestHandler } from "express";
import type { Logger } from "@workspace/logging";
import { ERROR_CODES, ERROR_MESSAGES, HTTP_STATUS } from "../../../constants/index.js";
import { createApplicationError } from "../../../errors/index.js";
import { createDriveController } from "../drive.controller.js";
import { createDriveService } from "../drive.service.js";
import type { SupabaseStorageIntegration } from "../integrations/drive.integration.js";
import type { DriveRepository } from "../repositories/index.js";

export type DriveRouteDependencies = Readonly<{
  repository: DriveRepository;
  enabled: boolean;
  logger: Logger;
  storage?: SupabaseStorageIntegration;
}>;

export const createDriveRoutes = ({ repository, enabled, logger, storage }: DriveRouteDependencies): Router => {
  const router = Router();
  if (!enabled) {
    const unavailable: RequestHandler = (_request, _response, next): void => {
      next(createApplicationError({
        code: ERROR_CODES.driveUnavailable,
        message: ERROR_MESSAGES.driveUnavailable,
        status: HTTP_STATUS.serviceUnavailable
      }));
    };
    router.use("/drive", unavailable);
    return router;
  }

  const controller = createDriveController({
    service: createDriveService({ repository, logger, ...(storage ? { storage } : {}) })
  });
  router.get("/drive/storage-usage", controller.storageUsage);
  router.get("/drive/entries", controller.list);
  router.get("/drive/folders/:id/path", controller.folderPath);
  router.post("/drive/folders", controller.createFolder);
  router.post("/drive/entries/:id/access", controller.recordFileAccess);
  router.put("/drive/entries/:id/favorite", controller.setFavorite);
  router.patch("/drive/entries/:id", controller.updateEntry);
  router.delete("/drive/entries/:id", controller.deleteEntry);
  router.put("/drive/files", controller.uploadFile);
  router.get("/drive/files/:id/download", controller.downloadFile);
  return router;
};
