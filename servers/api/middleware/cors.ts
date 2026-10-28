import type { RequestHandler } from "express";
import { HTTP_STATUS } from "../constants/index.js";
import type { ApiEnvironment } from "@workspace/types";

const localDevelopmentOrigin = "http://127.0.0.1:3001";
const loopbackHosts = new Set(["localhost", "127.0.0.1"]);

const isEquivalentLoopbackOrigin = (requestOrigin: string, configuredOrigin: string): boolean => {
  try {
    const requestUrl = new URL(requestOrigin);
    const configuredUrl = new URL(configuredOrigin);
    return requestUrl.origin === requestOrigin &&
      configuredUrl.origin === configuredOrigin &&
      requestUrl.protocol === configuredUrl.protocol &&
      requestUrl.port === configuredUrl.port &&
      requestUrl.hostname !== configuredUrl.hostname &&
      loopbackHosts.has(requestUrl.hostname) &&
      loopbackHosts.has(configuredUrl.hostname);
  } catch {
    return false;
  }
};

export const isTrustedOrigin = (
  requestOrigin: string | undefined,
  configuredOrigin: string,
  environment: ApiEnvironment
): boolean => requestOrigin === configuredOrigin ||
  (environment === "development" && requestOrigin !== undefined && isEquivalentLoopbackOrigin(requestOrigin, configuredOrigin)) ||
  (environment === "development" && requestOrigin === localDevelopmentOrigin);

export const createCorsMiddleware = ({ origin, environment }: { origin: string; environment: ApiEnvironment }): RequestHandler =>
  (request, response, next) => {
    const requestOrigin = request.get("Origin");
    const isAllowedOrigin = isTrustedOrigin(requestOrigin, origin, environment);

    if (isAllowedOrigin && requestOrigin) {
      response.setHeader("Access-Control-Allow-Origin", requestOrigin);
      response.setHeader("Access-Control-Allow-Credentials", "true");
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-File-Name, X-Drive-Parent-Id");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    }
    if (request.method === "OPTIONS") {
      response.sendStatus(HTTP_STATUS.noContent);
      return;
    }
    next();
  };
