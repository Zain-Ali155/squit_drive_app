import { Router, type RequestHandler } from "express";
import type { Logger } from "@workspace/logging";
import { ERROR_CODES, ERROR_MESSAGES, HTTP_STATUS } from "../../../constants/index.js";
import { createApplicationError } from "../../../errors/index.js";
import { createDriveController, createDrivePublicShareController } from "../drive.controller.js";
import { createDriveService, createDriveShareLinkService } from "../drive.service.js";
import type { SupabaseStorageIntegration } from "../integrations/drive.integration.js";
import type { DriveRepository } from "../repositories/index.js";
import { createPrincipalGuard, createRateLimitMiddleware, type PrincipalResolver } from "../../../middleware/index.js";
import type { DrivePrincipal } from "../../../types/index.js";

export type DriveRouteDependencies = Readonly<{
  repository: DriveRepository;
  enabled: boolean;
  logger: Logger;
  resolvePrincipal: PrincipalResolver;
  originGuard?: RequestHandler;
  storage?: SupabaseStorageIntegration;
}>;

export const createDriveRoutes = ({
  repository,
  enabled,
  logger,
  resolvePrincipal,
  originGuard,
  storage
}: DriveRouteDependencies): Router => {
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

  const guard = createPrincipalGuard(resolvePrincipal);
  const uploadRateLimit = createRateLimitMiddleware({ maxRequests: 20, windowMs: 15 * 60 * 1_000 });
  const shareRateLimit = createRateLimitMiddleware({ maxRequests: 10, windowMs: 15 * 60 * 1_000 });
  const publicShareRateLimit = createRateLimitMiddleware({ maxRequests: 60, windowMs: 15 * 60 * 1_000 });
  const shareLinks = createDriveShareLinkService({ repository, ...(storage ? { storage } : {}) });
  const publicShareController = createDrivePublicShareController({ service: shareLinks });
  const withPrincipal = (
    selectHandler: (controller: ReturnType<typeof createDriveController>) => RequestHandler
  ): RequestHandler => guard((request, response, principal: DrivePrincipal, next) => {
    const controller = createDriveController({
      service: createDriveService({
        repository,
        logger,
        ownerId: principal.ownerId,
        ...(principal.email ? { recipientEmail: principal.email } : {}),
        ...(storage ? { storage } : {}),
        shareLinkService: shareLinks
      })
    });
    return selectHandler(controller)(request, response, next);
  });
  const withMutationPrincipal = (
    selectHandler: (controller: ReturnType<typeof createDriveController>) => RequestHandler
  ): RequestHandler => {
    const handler = withPrincipal(selectHandler);
    if (!originGuard) return handler;
    return (request, response, next) => {
      originGuard(request, response, (error) => {
        if (error) {
          next(error);
          return;
        }
        handler(request, response, next);
      });
    };
  };
  router.get("/drive/storage-usage", withPrincipal((controller) => controller.storageUsage));
  router.get("/drive/entries", withPrincipal((controller) => controller.list));
  router.get("/drive/folders/:id/path", withPrincipal((controller) => controller.folderPath));
  router.post("/drive/folders", withMutationPrincipal((controller) => controller.createFolder));
  router.post("/drive/entries/:id/access", withMutationPrincipal((controller) => controller.recordFileAccess));
  router.put("/drive/entries/:id/favorite", withMutationPrincipal((controller) => controller.setFavorite));
  router.patch("/drive/entries/:id", withMutationPrincipal((controller) => controller.updateEntry));
  router.delete("/drive/entries/:id", withMutationPrincipal((controller) => controller.deleteEntry));
  router.post("/drive/entries/:id/restore", withMutationPrincipal((controller) => controller.restoreEntry));
  router.delete("/drive/trash/:id", withMutationPrincipal((controller) => controller.permanentlyDeleteEntry));
  router.put("/drive/files", withMutationPrincipal((controller) => (request, response, next) => {
    uploadRateLimit(request, response, (error) => {
      if (error) {
        next(error);
        return;
      }
      void controller.uploadFile(request, response).catch(next);
    });
  }));
  router.get("/drive/files/:id/download", withPrincipal((controller) => controller.downloadFile));
  router.post("/drive/entries/:id/shares", withMutationPrincipal((controller) => (request, response, next) => {
    shareRateLimit(request, response, (error) => {
      if (error) { next(error); return; }
      void controller.createShareLink(request, response).catch(next);
    });
  }));
  router.get("/drive/entries/:id/shares", withPrincipal((controller) => controller.listShares));
  router.delete("/drive/entries/:id/shares/:shareId", withMutationPrincipal((controller) => controller.revokeShare));
  router.get("/drive/shares/:id/download", withPrincipal((controller) => controller.downloadSharedFile));
  router.get("/drive/share", (request, response, next) => {
    publicShareRateLimit(request, response, (error) => {
      if (error) { next(error); return; }
      void publicShareController.resolve(request, response).catch(next);
    });
  });
  router.get("/drive/share/download", (request, response, next) => {
    publicShareRateLimit(request, response, (error) => {
      if (error) { next(error); return; }
      void publicShareController.download(request, response).catch(next);
    });
  });
  return router;
};
