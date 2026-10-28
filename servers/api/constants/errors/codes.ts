import type { ApiErrorCode } from "@workspace/types";

export const ERROR_CODES = Object.freeze({
  internal: "internal_error",
  routeNotFound: "route_not_found",
  validation: "validation_error",
  authenticationRequired: "authentication_required",
  authenticationFailed: "authentication_failed",
  csrfOriginRejected: "csrf_origin_rejected",
  rateLimitExceeded: "rate_limit_exceeded",
  driveEntryNotFound: "drive_entry_not_found",
  driveConflict: "drive_conflict",
  driveUnavailable: "drive_unavailable",
  driveUploadRejected: "drive_upload_rejected",
  driveStorageQuotaExceeded: "drive_storage_quota_exceeded"
} as const satisfies Readonly<Record<string, ApiErrorCode>>);
