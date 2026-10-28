export {
  AuthSessionModelInstance,
  AuthUserModelInstance,
  OAuthTransactionModelInstance,
  authSessionSchema,
  authUserSchema,
  oauthTransactionSchema,
  createAuthRepository
} from "./integrations/index.js";
export type {
  AuthRepository,
  AuthSessionModel,
  AuthSessionRecord,
  AuthUserModel,
  AuthUserRecord,
  OAuthTransactionModel,
  OAuthTransactionRecord
} from "./integrations/index.js";
export { createAuthRoutes } from "./routes/index.js";
export { createAuthController } from "./auth.controller.js";
export { createSessionPrincipalResolver, createValidatedSessionResolver } from "./session-principal.js";
export type { ValidatedSession } from "./session-principal.js";
export { createSessionService } from "./session.service.js";
export { createGoogleOidcProvider, GoogleOidcVerificationError } from "./google-oidc.integration.js";
export type {
  GoogleOAuthClient,
  GoogleOidcFailure,
  GoogleOidcFailureStage,
  GoogleOidcProvider,
  GoogleOidcProviderErrorCode,
  GoogleTokenClaims,
  VerifiedGoogleIdentity
} from "./google-oidc.integration.js";
export { createOAuthFlowService } from "./oauth.service.js";
export type { OAuthCallbackInput, OAuthLoginStart, OAuthSessionGrant } from "./oauth.service.js";
export {
  createSessionToken,
  hashOAuthValue,
  hashSessionToken,
  isOpaqueSessionToken
} from "./session-token.js";
export type { OAuthValueHash, SessionTokenHash, SessionTokenMaterial } from "./session-token.js";
