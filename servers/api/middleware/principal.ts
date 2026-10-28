import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ApiEnvironment } from "@workspace/types";
import { ERROR_CODES, ERROR_MESSAGES, HTTP_STATUS } from "../constants/index.js";
import { createApplicationError } from "../errors/index.js";
import type { DrivePrincipal } from "../types/index.js";

export type PrincipalResolver = (request: Request) => DrivePrincipal | null | Promise<DrivePrincipal | null>;

type PrincipalHandler = (
  request: Request,
  response: Response,
  principal: DrivePrincipal,
  next: NextFunction
) => unknown;

const unauthenticated = () => createApplicationError({
  code: ERROR_CODES.authenticationRequired,
  message: ERROR_MESSAGES.authenticationRequired,
  status: HTTP_STATUS.unauthorized
});

export const createPrincipalGuard = (resolvePrincipal: PrincipalResolver) =>
  (handler: PrincipalHandler): RequestHandler =>
    (request, response, next) => {
      void Promise.resolve()
        .then(() => resolvePrincipal(request))
        .then((principal) => {
          if (!principal || principal.ownerId.trim().length === 0) {
            next(unauthenticated());
            return;
          }
          return handler(request, response, principal, next);
        })
        .catch(next);
    };

const localDemoPrincipal: DrivePrincipal = Object.freeze({ ownerId: "local-demo-owner" });

export const createLocalDemoPrincipalResolver = (environment: ApiEnvironment): PrincipalResolver =>
  () => environment === "production" ? null : localDemoPrincipal;
