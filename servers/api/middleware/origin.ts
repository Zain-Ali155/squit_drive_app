import type { RequestHandler } from "express";
import type { ApiEnvironment } from "@workspace/types";
import { ERROR_CODES, ERROR_MESSAGES, HTTP_STATUS } from "../constants/index.js";
import { createApplicationError } from "../errors/index.js";
import { isTrustedOrigin } from "./cors.js";

export const createTrustedOriginGuard = ({
  origin,
  environment
}: Readonly<{ origin: string; environment: ApiEnvironment }>): RequestHandler =>
  (request, _response, next) => {
    // Cookie-authenticated mutations require Origin; non-browser clients have no bypass.
    if (!isTrustedOrigin(request.get("Origin"), origin, environment)) {
      next(createApplicationError({
        code: ERROR_CODES.csrfOriginRejected,
        message: ERROR_MESSAGES.csrfOriginRejected,
        status: HTTP_STATUS.forbidden
      }));
      return;
    }
    next();
  };
