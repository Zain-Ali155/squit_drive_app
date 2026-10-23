export const HTTP_STATUS = Object.freeze({
  ok: 200,
  created: 201,
  noContent: 204,
  badRequest: 400,
  conflict: 409,
  notFound: 404,
  serviceUnavailable: 503,
  internalServerError: 500
} as const);
