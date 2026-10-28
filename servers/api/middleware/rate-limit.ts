import type { Request, RequestHandler } from "express";
import { ERROR_CODES, ERROR_MESSAGES, HTTP_STATUS } from "../constants/index.js";

type RateLimitWindow = {
  count: number;
  resetAt: number;
};

export type RateLimitOptions = Readonly<{
  maxRequests: number;
  windowMs: number;
  now?: () => number;
  keyForRequest?: (request: Request) => string;
}>;

const socketAddress = (request: Request): string => request.socket.remoteAddress ?? "unknown";

export const createRateLimitMiddleware = ({
  maxRequests,
  windowMs,
  now = Date.now,
  keyForRequest = socketAddress
}: RateLimitOptions): RequestHandler => {
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1) {
    throw new RangeError("Rate limit maxRequests must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new RangeError("Rate limit windowMs must be a positive safe integer.");
  }

  const windows = new Map<string, RateLimitWindow>();

  return (request, response, next): void => {
    const currentTime = now();
    const clientKey = keyForRequest(request);
    let window = windows.get(clientKey);
    if (!window || window.resetAt <= currentTime) {
      window = { count: 0, resetAt: currentTime + windowMs };
      windows.set(clientKey, window);
    }

    const resetSeconds = Math.max(1, Math.ceil((window.resetAt - currentTime) / 1_000));
    const isAllowed = window.count < maxRequests;
    if (isAllowed) window.count += 1;

    response.setHeader("RateLimit-Policy", `${String(maxRequests)};w=${String(Math.ceil(windowMs / 1_000))}`);
    response.setHeader("RateLimit-Limit", String(maxRequests));
    response.setHeader("RateLimit-Remaining", String(Math.max(0, maxRequests - window.count)));
    response.setHeader("RateLimit-Reset", String(resetSeconds));

    if (!isAllowed) {
      response.setHeader("Retry-After", String(resetSeconds));
      response.status(HTTP_STATUS.tooManyRequests).json({
        error: {
          code: ERROR_CODES.rateLimitExceeded,
          message: ERROR_MESSAGES.rateLimitExceeded
        }
      });
      return;
    }

    next();
  };
};
