export const ERROR_MESSAGES = Object.freeze({
  internal: "An unexpected error occurred.",
  routeNotFound: "Route was not found.",
  validation: "Request validation failed.",
  authenticationRequired: "Authentication is required.",
  authenticationFailed: "Google authentication could not be completed.",
  csrfOriginRejected: "Request origin is not allowed.",
  rateLimitExceeded: "Too many requests. Please try again later.",
  driveEntryNotFound: "Drive entry was not found.",
  driveConflict: "Drive operation conflicts with the current state.",
  driveUnavailable: "Drive persistence or private storage is unavailable.",
  driveUploadRejected: "File upload was rejected by validation.",
  driveStorageQuotaExceeded: "This upload exceeds your 1 GB storage limit."
} as const);
