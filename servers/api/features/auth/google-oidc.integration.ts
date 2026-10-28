import { OAuth2Client } from "google-auth-library";

export type GoogleTokenClaims = Readonly<{
  iss?: unknown;
  aud?: unknown;
  azp?: unknown;
  exp?: unknown;
  sub?: unknown;
  nonce?: unknown;
  email?: unknown;
  email_verified?: unknown;
}>;

export type GoogleOAuthClient = Readonly<{
  generateAuthUrl: (options: Readonly<Record<string, string | readonly string[]>>) => string;
  getToken: (options: Readonly<{ code: string; codeVerifier: string; redirect_uri: string }>) =>
    Promise<Readonly<{ tokens: Readonly<{ id_token?: string | null }> }>>;
  verifyIdToken: (options: Readonly<{ idToken: string; audience: string }>) =>
    Promise<Readonly<{ getPayload: () => GoogleTokenClaims | undefined }>>;
}>;

export type VerifiedGoogleIdentity = Readonly<{
  subject: string;
  nonce: string;
  email: string;
}>;

export type GoogleOidcProvider = Readonly<{
  createAuthorizationUrl: (input: Readonly<{ state: string; nonce: string; codeChallenge: string; redirectUri: string }>) => string;
  verifyAuthorizationCode: (code: string, codeVerifier: string, redirectUri: string) => Promise<VerifiedGoogleIdentity>;
}>;

export type GoogleOidcFailureStage = "token-exchange" | "id-token-verification" | "id-token-claims";
export type GoogleOidcProviderErrorCode =
  | "invalid_client"
  | "invalid_grant"
  | "invalid_request"
  | "unauthorized_client"
  | "temporarily_unavailable"
  | "unknown";

export type GoogleOidcFailure = Readonly<{
  stage: GoogleOidcFailureStage;
  providerCode?: GoogleOidcProviderErrorCode;
}>;

type GoogleOidcConfiguration = Readonly<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}>;

type GoogleOidcDependencies = Readonly<{
  config: GoogleOidcConfiguration;
  client?: GoogleOAuthClient;
  now?: () => Date;
  onVerificationFailure?: (failure: GoogleOidcFailure) => void;
}>;

export class GoogleOidcVerificationError extends Error {
  constructor() {
    super("Google identity verification failed.");
    this.name = "GoogleOidcVerificationError";
  }
}

const isValidAudience = (claims: GoogleTokenClaims, clientId: string): boolean => {
  const audiences = typeof claims.aud === "string"
    ? [claims.aud]
    : Array.isArray(claims.aud) && claims.aud.every((value): value is string => typeof value === "string")
      ? claims.aud
      : [];
  return audiences.includes(clientId) &&
    (audiences.length <= 1 || claims.azp === clientId);
};

const isValidGoogleIdentityPayload = (
  claims: GoogleTokenClaims | undefined,
  clientId: string,
  now: Date
): claims is GoogleTokenClaims & Readonly<{ sub: string; nonce: string; email: string; email_verified: true }> =>
  claims !== undefined &&
  (claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com") &&
  isValidAudience(claims, clientId) &&
  typeof claims.exp === "number" && Number.isFinite(claims.exp) && claims.exp > now.getTime() / 1000 &&
  typeof claims.sub === "string" && claims.sub.trim().length > 0 &&
  typeof claims.nonce === "string" && claims.nonce.length > 0 &&
  typeof claims.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(claims.email.trim()) &&
  claims.email_verified === true;

const safeProviderErrorCode = (error: unknown): GoogleOidcProviderErrorCode => {
  if (typeof error !== "object" || error === null || !("response" in error)) return "unknown";
  const response = error.response;
  if (typeof response !== "object" || response === null || !("data" in response)) return "unknown";
  const data = response.data;
  if (typeof data !== "object" || data === null || !("error" in data)) return "unknown";
  const providerCode = data.error;
  if (typeof providerCode !== "string") return "unknown";
  switch (providerCode) {
    case "invalid_client":
    case "invalid_grant":
    case "invalid_request":
    case "unauthorized_client":
    case "temporarily_unavailable":
      return providerCode;
    default:
      return "unknown";
  }
};

export const createGoogleOidcProvider = ({
  config,
  client = new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri),
  now = () => new Date(),
  onVerificationFailure = () => undefined
}: GoogleOidcDependencies): GoogleOidcProvider => Object.freeze({
  createAuthorizationUrl: ({ state, nonce, codeChallenge, redirectUri }): string => client.generateAuthUrl({
    access_type: "online",
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: ["openid", "email"],
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account"
  }),
  verifyAuthorizationCode: async (code, codeVerifier, redirectUri): Promise<VerifiedGoogleIdentity> => {
    let tokens: Readonly<{ id_token?: string | null }>;
    try {
      ({ tokens } = await client.getToken({ code, codeVerifier, redirect_uri: redirectUri }));
    } catch (error) {
      onVerificationFailure({ stage: "token-exchange", providerCode: safeProviderErrorCode(error) });
      throw new GoogleOidcVerificationError();
    }
    if (typeof tokens.id_token !== "string" || tokens.id_token.length === 0) {
      onVerificationFailure({ stage: "id-token-verification" });
      throw new GoogleOidcVerificationError();
    }

    let claims: GoogleTokenClaims | undefined;
    try {
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: config.clientId
      });
      claims = ticket.getPayload();
    } catch {
      onVerificationFailure({ stage: "id-token-verification" });
      throw new GoogleOidcVerificationError();
    }
    if (!isValidGoogleIdentityPayload(claims, config.clientId, now())) {
      onVerificationFailure({ stage: "id-token-claims" });
      throw new GoogleOidcVerificationError();
    }
    return Object.freeze({ subject: claims.sub, nonce: claims.nonce, email: claims.email.trim().toLowerCase() });
  }
});
