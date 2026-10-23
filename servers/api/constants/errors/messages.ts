export const ERROR_MESSAGES = Object.freeze({
  internal: "An unexpected error occurred.",
  routeNotFound: "Route was not found.",
  validation: "Request validation failed.",
  driveEntryNotFound: "Drive entry was not found.",
  driveConflict: "Drive operation conflicts with the current state.",
  driveUnavailable: "Drive persistence or private storage is unavailable.",
  driveUploadRejected: "File upload was rejected by validation."
} as const);
