export type ApiErrorCode = "internal_error" | "route_not_found" | "validation_error" | "drive_entry_not_found" | "drive_conflict" | "drive_unavailable" | "drive_upload_rejected";

export type ApiErrorDetails = Readonly<Record<string, unknown>> | readonly unknown[];

export type ApiErrorResponse = Readonly<{
  error: Readonly<{
    code: ApiErrorCode;
    message: string;
    details?: ApiErrorDetails;
  }>;
}>;
