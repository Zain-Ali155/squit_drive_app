export type ApiErrorCode = "internal_error" | "route_not_found" | "validation_error" | "authentication_required" | "authentication_failed" | "csrf_origin_rejected" | "rate_limit_exceeded" | "drive_entry_not_found" | "drive_conflict" | "drive_unavailable" | "drive_upload_rejected" | "drive_storage_quota_exceeded";

export type ApiErrorDetails = Readonly<Record<string, unknown>> | readonly unknown[];

export type ApiErrorResponse = Readonly<{
  error: Readonly<{
    code: ApiErrorCode;
    message: string;
    details?: ApiErrorDetails;
  }>;
}>;
