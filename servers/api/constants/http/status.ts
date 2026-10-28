export const HTTP_STATUS = Object.freeze({
  ok: 200,
  created: 201,
  noContent: 204,
  badRequest: 400,
  payloadTooLarge: 413,
  unauthorized: 401,
  forbidden: 403,
  tooManyRequests: 429,
  conflict: 409,
  notFound: 404,
  serviceUnavailable: 503,
  internalServerError: 500
} as const);
