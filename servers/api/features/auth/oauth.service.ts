import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ERROR_CODES, ERROR_MESSAGES, HTTP_STATUS } from "../../constants/index.js";
import { createApplicationError } from "../../errors/index.js";
import type { AuthRepository } from "./integrations/auth.mongodb.integration.js";
import type { GoogleOidcProvider } from "./google-oidc.integration.js";
import { createSessionToken, hashOAuthValue } from "./session-token.js";

const oauthTransactionLifetimeMs = 10 * 60 * 1000;
const sessionLifetimeMs = 8 * 60 * 60 * 1000;

type OAuthFlowDependencies = Readonly<{
  repository: AuthRepository;
  provider: GoogleOidcProvider;
  redirectUri: string;
  now?: () => Date;
}>;

export type OAuthLoginStart = Readonly<{
  authorizationUrl: string;
  state: string;
  browserBindingSecret: string;
  codeVerifier: string;
}>;

export type OAuthSessionGrant = Readonly<{
  sessionToken: string;
  expiresAt: Date;
}>;

export type OAuthCallbackInput = Readonly<{
  state: string | null | undefined;
  code: string | null | undefined;
  providerError: string | null | undefined;
  browserBindingSecret: string | null | undefined;
  codeVerifier: string | null | undefined;
  redirectUri?: string;
}>;

const authenticationFailure = () => createApplicationError({
  code: ERROR_CODES.authenticationFailed,
  message: ERROR_MESSAGES.authenticationFailed,
  status: HTTP_STATUS.badRequest
});

const createOAuthSecret = (): string => randomBytes(32).toString("base64url");

const matchesDigest = (value: string, expectedHash: string): boolean => {
  const actual = Buffer.from(hashOAuthValue(value), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

const createPkceChallenge = (verifier: string): string =>
  createHash("sha256").update(verifier).digest("base64url");

export const createOAuthFlowService = ({
  repository,
  provider,
  redirectUri: configuredRedirectUri,
  now = () => new Date()
}: OAuthFlowDependencies) => Object.freeze({
  startLogin: async (redirectUri = configuredRedirectUri): Promise<OAuthLoginStart> => {
    const state = createOAuthSecret();
    const nonce = createOAuthSecret();
    const browserBindingSecret = createOAuthSecret();
    const codeVerifier = createOAuthSecret();
    const codeChallenge = createPkceChallenge(codeVerifier);
    let authorizationUrl: string;
    try {
      authorizationUrl = provider.createAuthorizationUrl({ state, nonce, codeChallenge, redirectUri });
    } catch {
      throw authenticationFailure();
    }
    const issuedAt = now();
    await repository.createOAuthTransaction({
      stateHash: hashOAuthValue(state),
      nonceHash: hashOAuthValue(nonce),
      browserBindingHash: hashOAuthValue(browserBindingSecret),
      codeChallengeHash: hashOAuthValue(codeChallenge),
      redirectUriHash: hashOAuthValue(redirectUri),
      expiresAt: new Date(issuedAt.getTime() + oauthTransactionLifetimeMs)
    });
    return Object.freeze({ authorizationUrl, state, browserBindingSecret, codeVerifier });
  },
  completeCallback: async ({
    state,
    code,
    providerError,
    browserBindingSecret,
    codeVerifier,
    redirectUri: callbackRedirectUri = configuredRedirectUri
  }: OAuthCallbackInput): Promise<OAuthSessionGrant> => {
    if (
      typeof state !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/u.test(state) ||
      typeof browserBindingSecret !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/u.test(browserBindingSecret) ||
      typeof codeVerifier !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/u.test(codeVerifier)
    ) {
      throw authenticationFailure();
    }
    const transaction = await repository.consumeOAuthTransaction(
      hashOAuthValue(state),
      hashOAuthValue(browserBindingSecret),
      now()
    );
    if (!transaction) throw authenticationFailure();
    if (!matchesDigest(callbackRedirectUri, transaction.redirectUriHash)) throw authenticationFailure();
    if (providerError !== null || typeof code !== "string" || code.length === 0 || code.length > 2048) {
      throw authenticationFailure();
    }

    if (!matchesDigest(createPkceChallenge(codeVerifier), transaction.codeChallengeHash)) {
      throw authenticationFailure();
    }

    let identity: Awaited<ReturnType<GoogleOidcProvider["verifyAuthorizationCode"]>>;
    try {
      identity = await provider.verifyAuthorizationCode(code, codeVerifier, callbackRedirectUri);
    } catch {
      throw authenticationFailure();
    }
    if (!matchesDigest(identity.nonce, transaction.nonceHash) || identity.subject.trim().length === 0) {
      throw authenticationFailure();
    }

    const user = await repository.findOrCreateGoogleUser(identity.subject, identity.email);
    const token = createSessionToken();
    const expiresAt = new Date(now().getTime() + sessionLifetimeMs);
    await repository.createSession({
      ownerId: user._id,
      tokenHash: token.tokenHash,
      expiresAt
    });
    return Object.freeze({ sessionToken: token.token, expiresAt });
  }
});
