import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import express from "express";
import type { Logger } from "@workspace/logging";
import {
  createGoogleOidcProvider,
  createOAuthFlowService,
  createSessionPrincipalResolver,
  createSessionToken,
  hashOAuthValue,
  hashSessionToken
} from "../index.js";
import { createAuthRoutes } from "../routes/index.js";
import { createErrorHandler, createPrincipalGuard } from "../../../middleware/index.js";
import { HTTP_STATUS } from "../../../constants/index.js";
import type {
  AuthRepository,
  AuthSessionRecord,
  AuthUserRecord,
  GoogleOAuthClient,
  GoogleOidcProvider,
  OAuthTransactionRecord
} from "../index.js";

const redirectUri = "http://localhost:4000/auth/google/callback";
const clientId = "google-client-id";
const identitySubject = "stable-google-subject";
const findCookiePair = (cookies: readonly string[], prefix: string): string | undefined =>
  cookies.find((cookie) => cookie.startsWith(prefix))?.split(";")[0];
const bindingCookiePrefix = "squid_oauth_binding_";
const pkceCookiePrefix = "squid_oauth_pkce_";
const secureBindingCookiePrefix = "__Secure-squid_oauth_binding_";
const securePkceCookiePrefix = "__Secure-squid_oauth_pkce_";
const getOAuthCookiePair = (state: string, value: string, kind: "binding" | "pkce"): string =>
  `${kind === "binding" ? bindingCookiePrefix : pkceCookiePrefix}${hashOAuthValue(state)}=${value}`;

const createProviderFake = () => {
  let expectedNonce = "";
  const noncesByChallenge = new Map<string, string>();
  const verificationCodes: string[] = [];
  const verificationCodeVerifiers: string[] = [];
  let verificationFailure: Error | undefined;
  let identitySubjectValue = identitySubject;
  let identityNonceValue: string | undefined;
  let identityEmailValue = "drive-user@example.test";
  const provider: GoogleOidcProvider = {
    createAuthorizationUrl: ({ state, nonce, codeChallenge, redirectUri: callbackUri }) => {
      expectedNonce = nonce;
      noncesByChallenge.set(codeChallenge, nonce);
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", callbackUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", "openid email");
      url.searchParams.set("state", state);
      url.searchParams.set("nonce", nonce);
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
      return url.toString();
    },
    verifyAuthorizationCode: (code, codeVerifier, _callbackUri) => {
      verificationCodes.push(code);
      verificationCodeVerifiers.push(codeVerifier);
      if (verificationFailure) return Promise.reject(verificationFailure);
      const challenge = createHash("sha256").update(codeVerifier).digest("base64url");
      return Promise.resolve({
        subject: identitySubjectValue,
        nonce: identityNonceValue ?? noncesByChallenge.get(challenge) ?? expectedNonce,
        email: identityEmailValue
      });
    }
  };
  return {
    provider,
    verificationCodes,
    verificationCodeVerifiers,
    get expectedNonce(): string { return expectedNonce; },
    failVerification: (error: Error): void => { verificationFailure = error; },
    setIdentitySubject: (subject: string): void => { identitySubjectValue = subject; },
    setIdentityNonce: (nonce: string): void => { identityNonceValue = nonce; },
    setIdentityEmail: (email: string): void => { identityEmailValue = email; }
  };
};

const createHarness = (options: Readonly<{ now?: Date }> = {}) => {
  let currentTime = options.now ?? new Date("2026-10-26T12:00:00.000Z");
  let browserBindingSecret = "";
  let codeVerifier = "";
  const transactions = new Map<string, OAuthTransactionRecord>();
  const users = new Map<string, AuthUserRecord>();
  const sessions: AuthSessionRecord[] = [];
  const consumedStates: string[] = [];
  const provider = createProviderFake();
  const now = (): Date => new Date(currentTime);
  const repository: AuthRepository = {
    createOAuthTransaction: (input) => {
      const record: OAuthTransactionRecord = {
        _id: `oauth-${String(transactions.size + 1)}`,
        ...input,
        createdAt: now(),
        updatedAt: now()
      };
      transactions.set(input.stateHash, record);
      return Promise.resolve();
    },
    consumeOAuthTransaction: (stateHash, bindingHash, at) => {
      consumedStates.push(stateHash);
      const transaction = transactions.get(stateHash);
      if (
        !transaction ||
        transaction.expiresAt <= at ||
        transaction.browserBindingHash !== bindingHash
      ) return Promise.resolve(null);
      transactions.delete(stateHash);
      return Promise.resolve(transaction);
    },
    findOrCreateGoogleUser: (subject, email) => {
      let user = users.get(subject);
      if (!user) {
        user = {
          _id: `owner-${String(users.size + 1)}`,
          googleSubject: subject,
          email,
          createdAt: now(),
          updatedAt: now()
        };
        users.set(subject, user);
      } else {
        user = Object.freeze({ ...user, email, updatedAt: now() });
        users.set(subject, user);
      }
      return Promise.resolve(user);
    },
    findUserById: (ownerId) => Promise.resolve(
      [...users.values()].find((user) => user._id === ownerId) ?? null
    ),
    createSession: (input) => {
      const session: AuthSessionRecord = {
        _id: `session-${String(sessions.length + 1)}`,
        ...input,
        createdAt: now(),
        updatedAt: now()
      };
      sessions.push(session);
      return Promise.resolve(session);
    },
    findActiveSession: (tokenHash, at) => Promise.resolve(
      sessions.find((session) =>
        session.tokenHash === tokenHash &&
        session.expiresAt > at &&
        session.revokedAt === undefined
      ) ?? null
    ),
    revokeSession: (tokenHash, revokedAt) => {
      const index = sessions.findIndex((session) =>
        session.tokenHash === tokenHash && session.revokedAt === undefined
      );
      const session = sessions[index];
      if (index < 0 || !session) return Promise.resolve(false);
      sessions[index] = { ...session, revokedAt };
      return Promise.resolve(true);
    }
  };
  const service = createOAuthFlowService({
    repository,
    provider: provider.provider,
    redirectUri,
    now
  });
  return {
    service,
    repository,
    provider,
    transactions,
    users,
    sessions,
    consumedStates,
    get currentTime(): Date { return now(); },
    get browserBindingSecret(): string { return browserBindingSecret; },
    get codeVerifier(): string { return codeVerifier; },
    setBrowserBindingSecret: (secret: string): void => { browserBindingSecret = secret; },
    setCodeVerifier: (verifier: string): void => { codeVerifier = verifier; },
    setNow: (value: Date): void => { currentTime = value; }
  };
};

const startLogin = async (
  harness: ReturnType<typeof createHarness>,
  callbackUri = redirectUri
) => {
  const login = await harness.service.startLogin(callbackUri);
  harness.setBrowserBindingSecret(login.browserBindingSecret);
  harness.setCodeVerifier(login.codeVerifier);
  return new URL(login.authorizationUrl);
};

const assertAuthenticationFailure = async (promise: Promise<unknown>): Promise<void> => {
  await assert.rejects(promise, (error: unknown) => {
    assert.equal(error instanceof Error, true);
    assert.equal((error as Error).message, "Google authentication could not be completed.");
    assert.equal((error as Error).message.includes("secret"), false);
    return true;
  });
};

void test("generates a Google authorization URL with configured redirect, random state, and nonce", async () => {
  const harness = createHarness();
  const url = await startLogin(harness);
  const state = url.searchParams.get("state");
  const nonce = url.searchParams.get("nonce");
  const codeChallenge = url.searchParams.get("code_challenge");

  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("client_id"), clientId);
  assert.equal(url.searchParams.get("redirect_uri"), redirectUri);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.deepEqual(url.searchParams.get("scope")?.split(" "), ["openid", "email"]);
  assert.match(state ?? "", /^[A-Za-z0-9_-]{43}$/u);
  assert.match(nonce ?? "", /^[A-Za-z0-9_-]{43}$/u);
  assert.match(codeChallenge ?? "", /^[A-Za-z0-9_-]{43}$/u);
  assert.match(harness.codeVerifier, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(codeChallenge, createHash("sha256").update(harness.codeVerifier).digest("base64url"));
  assert.equal(url.toString().includes(harness.codeVerifier), false);
  assert.equal(state === nonce, false);
  assert.equal(harness.transactions.size, 1);
  const transaction = [...harness.transactions.values()][0];
  assert.ok(transaction);
  assert.equal(transaction.stateHash, hashOAuthValue(state ?? ""));
  assert.equal(transaction.nonceHash, hashOAuthValue(nonce ?? ""));
  assert.equal(transaction.browserBindingHash, hashOAuthValue(harness.browserBindingSecret));
  assert.equal(transaction.codeChallengeHash, hashOAuthValue(codeChallenge));
  assert.equal(url.toString().includes(harness.browserBindingSecret), false);
  assert.equal(JSON.stringify(transaction).includes(state ?? ""), false);
  assert.equal(JSON.stringify(transaction).includes(nonce ?? ""), false);
  assert.equal(JSON.stringify(transaction).includes(harness.browserBindingSecret), false);
  assert.equal(JSON.stringify(transaction).includes(harness.codeVerifier), false);
  assert.equal(transaction.expiresAt.getTime(), new Date("2026-10-26T12:00:00.000Z").getTime() + 600_000);
});

void test("Google login applies the public route rate limit", async (context) => {
  const harness = createHarness();
  const app = express();
  app.use(createAuthRoutes({
    repository: harness.repository,
    provider: harness.provider.provider,
    cookieSecure: false,
    origin: "http://localhost:3000",
    redirectUri,
    environment: "test"
  }));
  app.use(createErrorHandler({ logger: { info: () => undefined, warn: () => undefined, error: () => undefined } }));
  const server = app.listen(0, "127.0.0.1");
  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${String(address.port)}/auth/google/login`;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await fetch(url, { redirect: "manual" });
    assert.equal(response.status, 302);
  }
  const limited = await fetch(url, { redirect: "manual" });
  assert.equal(limited.status, HTTP_STATUS.tooManyRequests);
  assert.equal((await limited.json() as { error: { code: string } }).error.code, "rate_limit_exceeded");
});

void test("rejects missing, malformed, mismatched, expired, and replayed state", async () => {
  const harness = createHarness();
  const url = await startLogin(harness);
  const state = url.searchParams.get("state");
  assert.ok(state);

  await assertAuthenticationFailure(harness.service.completeCallback({
    state: null,
    code: "authorization-code",
    providerError: null,
    browserBindingSecret: harness.browserBindingSecret,
    codeVerifier: harness.codeVerifier
  }));
  await assertAuthenticationFailure(harness.service.completeCallback({
    state: "invalid",
    code: "authorization-code",
    providerError: null,
    browserBindingSecret: harness.browserBindingSecret,
    codeVerifier: harness.codeVerifier
  }));
  const wrongState = Buffer.from("wrong-state-value-12345678901234567890").toString("base64url").slice(0, 43);
  await assertAuthenticationFailure(harness.service.completeCallback({
    state: wrongState,
    code: "authorization-code",
    providerError: null,
    browserBindingSecret: harness.browserBindingSecret,
    codeVerifier: harness.codeVerifier
  }));
  assert.equal(harness.transactions.size, 1);

  await assertAuthenticationFailure(harness.service.completeCallback({
    state,
    code: "authorization-code",
    providerError: null,
    browserBindingSecret: "x".repeat(43),
    codeVerifier: harness.codeVerifier
  }));
  assert.equal(harness.transactions.size, 1);

  harness.setNow(new Date("2026-10-26T12:10:00.000Z"));
  await assertAuthenticationFailure(harness.service.completeCallback({
    state,
    code: "authorization-code",
    providerError: null,
    browserBindingSecret: harness.browserBindingSecret,
    codeVerifier: harness.codeVerifier
  }));
  assert.equal(harness.sessions.length, 0);
  assert.equal(harness.transactions.size, 1);
});

void test("consumes valid state once, maps by verified sub, and creates a hash-only session", async () => {
  const harness = createHarness();
  const url = await startLogin(harness);
  const state = url.searchParams.get("state");
  assert.ok(state);

  await harness.service.completeCallback({
    state,
    code: "opaque-code",
    providerError: null,
    browserBindingSecret: harness.browserBindingSecret,
    codeVerifier: harness.codeVerifier
  });

  assert.deepEqual(harness.provider.verificationCodes, ["opaque-code"]);
  assert.equal(harness.users.size, 1);
  assert.equal(harness.users.has(identitySubject), true);
  assert.equal(harness.sessions.length, 1);
  const session = harness.sessions.at(0);
  assert.ok(session);
  assert.equal(session.ownerId, "owner-1");
  assert.equal(session.expiresAt.getTime(), new Date("2026-10-26T12:00:00.000Z").getTime() + 28_800_000);
  await assertAuthenticationFailure(harness.service.completeCallback({
    state,
    code: "opaque-code",
    providerError: null,
    browserBindingSecret: harness.browserBindingSecret,
    codeVerifier: harness.codeVerifier
  }));
  assert.equal(harness.sessions.length, 1);
});

void test("rejects missing and mismatched PKCE verifiers before exchanging the authorization code", async () => {
  const harness = createHarness();
  const url = await startLogin(harness);
  const state = url.searchParams.get("state");
  assert.ok(state);

  await assertAuthenticationFailure(harness.service.completeCallback({
    state,
    code: "authorization-code",
    providerError: null,
    browserBindingSecret: harness.browserBindingSecret,
    codeVerifier: null
  }));
  assert.equal(harness.transactions.size, 1);

  await assertAuthenticationFailure(harness.service.completeCallback({
    state,
    code: "authorization-code",
    providerError: null,
    browserBindingSecret: harness.browserBindingSecret,
    codeVerifier: "x".repeat(43)
  }));
  assert.equal(harness.provider.verificationCodes.length, 0);
  assert.equal(harness.users.size, 0);
  assert.equal(harness.sessions.length, 0);
});

void test("binds the callback host to the redirect URI recorded at login", async () => {
  const harness = createHarness();
  const callbackUri = "http://127.0.0.1:4000/auth/google/callback";
  const url = await startLogin(harness, callbackUri);
  await assertAuthenticationFailure(harness.service.completeCallback({
    state: url.searchParams.get("state"),
    code: "auth-code",
    providerError: null,
    browserBindingSecret: harness.browserBindingSecret,
    codeVerifier: harness.codeVerifier,
    redirectUri
  }));
  assert.deepEqual(harness.provider.verificationCodes, []);
  assert.equal(harness.sessions.length, 0);
});

void test("rejects provider errors and missing or oversized callback codes without creating a session", async () => {
  for (const callback of [
    { code: null, providerError: null },
    { code: "x".repeat(2049), providerError: null },
    { code: null, providerError: "access_denied" }
  ]) {
    const harness = createHarness();
    const url = await startLogin(harness);
    await assertAuthenticationFailure(harness.service.completeCallback({
      state: url.searchParams.get("state"),
      ...callback,
      browserBindingSecret: harness.browserBindingSecret,
      codeVerifier: harness.codeVerifier
    }));
    assert.equal(harness.sessions.length, 0);
  }
});

void test("rejects identity verification failures and nonce mismatch before user or session creation", async () => {
  for (const mode of ["invalid-code", "signature", "issuer", "audience", "expiry", "nonce"] as const) {
    const harness = createHarness();
    const url = await startLogin(harness);
    if (mode === "nonce") harness.provider.setIdentityNonce("wrong-nonce");
    else harness.provider.failVerification(new Error(`provider ${mode} secret response`));

    await assertAuthenticationFailure(harness.service.completeCallback({
      state: url.searchParams.get("state"),
      code: `sensitive-code-${mode}`,
      providerError: null,
      browserBindingSecret: harness.browserBindingSecret,
      codeVerifier: harness.codeVerifier
    }));
    assert.equal(harness.users.size, 0, mode);
    assert.equal(harness.sessions.length, 0, mode);
  }
});

void test("uses verified Google sub rather than any client-provided profile identity", async () => {
  const harness = createHarness();
  const url = await startLogin(harness);
  harness.provider.setIdentitySubject("verified-subject-not-email@example.test");

  await harness.service.completeCallback({
    state: url.searchParams.get("state"),
    code: "authorization-code",
    providerError: null,
    browserBindingSecret: harness.browserBindingSecret,
    codeVerifier: harness.codeVerifier
  });

  assert.equal(harness.users.has("verified-subject-not-email@example.test"), true);
  assert.equal(harness.users.has("client-claimed-owner"), false);
});

void test("HTTP login binds the callback to a short-lived browser cookie", async () => {
  const harness = createHarness({ now: new Date() });
  const logger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
  const app = express();
  app.use(createAuthRoutes({
    repository: harness.repository,
    provider: harness.provider.provider,
    cookieSecure: false,
    origin: "http://localhost:3000",
    redirectUri,
    environment: "test",
    now: () => harness.currentTime
  }));
  app.use(createErrorHandler({ logger }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const baseUrl = `http://127.0.0.1:${String(address.port)}`;
    const login = await fetch(`${baseUrl}/auth/google/login`, { redirect: "manual" });
    assert.equal(login.status, 302);
    const authorizationUrl = new URL(login.headers.get("location") ?? "");
    assert.equal(authorizationUrl.searchParams.get("redirect_uri"), "http://127.0.0.1:4000/auth/google/callback");
    const state = authorizationUrl.searchParams.get("state");
    assert.ok(state);
    const loginCookies = login.headers.getSetCookie();
    const bindingSetCookie = loginCookies.find((cookie) => cookie.startsWith(bindingCookiePrefix));
    const pkceSetCookie = loginCookies.find((cookie) => cookie.startsWith(pkceCookiePrefix));
    assert.ok(bindingSetCookie);
    assert.ok(pkceSetCookie);
    for (const setCookie of [bindingSetCookie, pkceSetCookie]) {
      assert.match(setCookie, /HttpOnly/u);
      assert.match(setCookie, /SameSite=Lax/u);
      assert.match(setCookie, /Path=\/auth\/google\/callback/u);
      assert.match(setCookie, /Max-Age=600/u);
      assert.doesNotMatch(setCookie, /Domain=/iu);
    }
    const bindingCookie = bindingSetCookie.split(";")[0];
    const pkceCookie = pkceSetCookie.split(";")[0];
    assert.ok(bindingCookie);
    assert.ok(pkceCookie);
    const codeVerifier = pkceCookie.slice(pkceCookie.indexOf("=") + 1);
    assert.equal(
      authorizationUrl.searchParams.get("code_challenge"),
      createHash("sha256").update(codeVerifier).digest("base64url")
    );
    assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256");

    const missingCookieCallback = await fetch(
      `${baseUrl}/auth/google/callback?state=${encodeURIComponent(state)}&code=mock-authorization-code`
    );
    assert.equal(missingCookieCallback.status, 400);
    assert.deepEqual(harness.provider.verificationCodes, []);
    assert.equal(harness.sessions.length, 0);
    assert.equal(harness.transactions.size, 1);

    const mismatchedCookieCallback = await fetch(
      `${baseUrl}/auth/google/callback?state=${encodeURIComponent(state)}&code=mock-authorization-code`,
      { headers: { Cookie: "squid_oauth_binding=x".concat("x".repeat(42)) } }
    );
    assert.equal(mismatchedCookieCallback.status, 400);
    const duplicateCookieCallback = await fetch(
      `${baseUrl}/auth/google/callback?state=${encodeURIComponent(state)}&code=mock-authorization-code`,
      { headers: { Cookie: `${bindingCookie}; ${bindingCookie}` } }
    );
    assert.equal(duplicateCookieCallback.status, 400);
    assert.deepEqual(harness.provider.verificationCodes, []);
    assert.equal(harness.sessions.length, 0);

    const callback = await fetch(
      `${baseUrl}/auth/google/callback?state=${encodeURIComponent(state)}&code=mock-authorization-code`,
      { headers: { Cookie: `${bindingCookie}; ${pkceCookie}` }, redirect: "manual" }
    );
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get("location"), "http://127.0.0.1:3000/drive");
    const callbackCookies = callback.headers.getSetCookie();
    const clearedCookie = callbackCookies.find((cookie) => cookie.startsWith(bindingCookiePrefix));
    const clearedPkceCookie = callbackCookies.find((cookie) => cookie.startsWith(pkceCookiePrefix));
    const sessionCookie = callbackCookies.find((cookie) => cookie.startsWith("squid_session="));
    assert.ok(clearedCookie);
    assert.ok(clearedPkceCookie);
    assert.ok(sessionCookie);
    assert.match(clearedCookie, /Expires=Thu, 01 Jan 1970/u);
    assert.match(clearedPkceCookie, /Expires=Thu, 01 Jan 1970/u);
    assert.doesNotMatch(clearedCookie, /Domain=/iu);
    assert.match(sessionCookie, /HttpOnly/u);
    assert.match(sessionCookie, /SameSite=Lax/u);
    assert.match(sessionCookie, /Path=\/(?:;|$)/u);
    const maxAge = sessionCookie.match(/Max-Age=(\d+)/u)?.[1];
    assert.ok(maxAge);
    assert.ok(Number(maxAge) <= 28_800 && Number(maxAge) >= 28_790);
    const cookieExpiry = sessionCookie.match(/Expires=([^;]+)/u)?.[1];
    const persistedExpiry = harness.sessions[0]?.expiresAt;
    assert.ok(cookieExpiry);
    assert.ok(persistedExpiry);
    assert.ok(Math.abs(Date.parse(cookieExpiry) - persistedExpiry.getTime()) <= 1_000);
    assert.doesNotMatch(sessionCookie, /Domain=/iu);
    const rawSessionToken = sessionCookie.split(";")[0]?.slice("squid_session=".length);
    assert.ok(rawSessionToken);
    assert.match(rawSessionToken, /^[A-Za-z0-9_-]{43}$/u);
    assert.equal(harness.sessions[0]?.tokenHash, hashSessionToken(rawSessionToken));
    assert.equal((callback.headers.get("location") ?? "").includes(rawSessionToken), false);
    assert.equal(harness.sessions.length, 1);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});

void test("keeps concurrent browser login attempts isolated by OAuth state", async (context) => {
  const harness = createHarness();
  const app = express();
  app.use(createAuthRoutes({
    repository: harness.repository,
    provider: harness.provider.provider,
    cookieSecure: false,
    origin: "http://localhost:3000",
    redirectUri,
    environment: "test"
  }));
  app.use(createErrorHandler({ logger: { info: () => undefined, warn: () => undefined, error: () => undefined } }));
  const server = app.listen(0, "127.0.0.1");
  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${String(address.port)}`;
  const firstLogin = await fetch(`${baseUrl}/auth/google/login`, { redirect: "manual" });
  const secondLogin = await fetch(`${baseUrl}/auth/google/login`, { redirect: "manual" });
  const firstState = new URL(firstLogin.headers.get("location") ?? "").searchParams.get("state");
  const secondState = new URL(secondLogin.headers.get("location") ?? "").searchParams.get("state");
  assert.ok(firstState);
  assert.ok(secondState);
  assert.notEqual(firstState, secondState);
  const firstBinding = findCookiePair(firstLogin.headers.getSetCookie(), bindingCookiePrefix);
  const firstPkce = findCookiePair(firstLogin.headers.getSetCookie(), pkceCookiePrefix);
  const secondBinding = findCookiePair(secondLogin.headers.getSetCookie(), bindingCookiePrefix);
  const secondPkce = findCookiePair(secondLogin.headers.getSetCookie(), pkceCookiePrefix);
  assert.ok(firstBinding);
  assert.ok(firstPkce);
  assert.ok(secondBinding);
  assert.ok(secondPkce);
  assert.notEqual(firstBinding.split("=")[0], secondBinding.split("=")[0]);
  assert.notEqual(firstPkce.split("=")[0], secondPkce.split("=")[0]);

  const firstCallback = await fetch(
    `${baseUrl}/auth/google/callback?state=${encodeURIComponent(firstState)}&code=first-code`,
    { headers: { Cookie: `${firstBinding}; ${firstPkce}` }, redirect: "manual" }
  );
  const secondCallback = await fetch(
    `${baseUrl}/auth/google/callback?state=${encodeURIComponent(secondState)}&code=second-code`,
    { headers: { Cookie: `${secondBinding}; ${secondPkce}` }, redirect: "manual" }
  );
  assert.equal(firstCallback.status, 302);
  assert.equal(secondCallback.status, 302);
  assert.equal(harness.sessions.length, 2);
});

void test("supports the localhost callback hostname and rejects arbitrary Host values", async (context) => {
  const harness = createHarness();
  const logger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
  const app = express();
  app.use(createAuthRoutes({
    repository: harness.repository,
    provider: harness.provider.provider,
    cookieSecure: false,
    origin: "http://localhost:3000",
    redirectUri,
    environment: "development"
  }));
  app.use(createErrorHandler({ logger }));
  const server = app.listen(0, "127.0.0.1");
  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://localhost:${String(address.port)}`;

  const rejectedHostStatus = await new Promise<number>((resolve, reject) => {
    const request = httpRequest({
      hostname: "127.0.0.1",
      port: address.port,
      path: "/auth/google/login",
      method: "GET",
      headers: { Host: "attacker.example:4000" }
    }, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    request.once("error", reject);
    request.end();
  });
  assert.equal(rejectedHostStatus, HTTP_STATUS.badRequest);
  assert.equal(harness.transactions.size, 0);

  const login = await fetch(`${baseUrl}/auth/google/login`, {
    headers: { Host: "localhost:4000" },
    redirect: "manual"
  });
  const authorizationUrl = new URL(login.headers.get("location") ?? "");
  assert.equal(authorizationUrl.searchParams.get("redirect_uri"), redirectUri);
  const state = authorizationUrl.searchParams.get("state");
  assert.ok(state);
  const loginCookies = login.headers.getSetCookie();
  const bindingCookie = findCookiePair(loginCookies, bindingCookiePrefix);
  const pkceCookie = findCookiePair(loginCookies, pkceCookiePrefix);
  assert.ok(bindingCookie);
  assert.ok(pkceCookie);
  const callback = await fetch(`${baseUrl}/auth/google/callback?state=${encodeURIComponent(state)}&code=mock-code`, {
    headers: { Host: "localhost:4000", Cookie: `${bindingCookie}; ${pkceCookie}` },
    redirect: "manual"
  });
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get("location"), "http://localhost:3000/drive");

  const productionApp = express();
  productionApp.use(createAuthRoutes({
    repository: harness.repository,
    provider: harness.provider.provider,
    cookieSecure: true,
    origin: "http://localhost:3000",
    redirectUri,
    environment: "production"
  }));
  productionApp.use(createErrorHandler({ logger }));
  const productionServer = productionApp.listen(0, "127.0.0.1");
  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      productionServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });
  await new Promise<void>((resolve, reject) => {
    productionServer.once("listening", resolve);
    productionServer.once("error", reject);
  });
  const productionAddress = productionServer.address();
  assert.ok(productionAddress && typeof productionAddress === "object");
  const productionAliasLogin = await fetch(
    `http://127.0.0.1:${String(productionAddress.port)}/auth/google/login`,
    { redirect: "manual" }
  );
  assert.equal(productionAliasLogin.status, HTTP_STATUS.badRequest);
});

void test("GET /auth/me returns minimal auth state for active sessions and rejects missing, expired, and revoked sessions", async (context) => {
  const harness = createHarness();
  const logger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
  const firstLogin = await startLogin(harness);
  const firstGrant = await harness.service.completeCallback({
    state: firstLogin.searchParams.get("state"),
    code: "first-code",
    providerError: null,
    browserBindingSecret: harness.browserBindingSecret,
    codeVerifier: harness.codeVerifier
  });
  const secondLogin = await startLogin(harness);
  const secondGrant = await harness.service.completeCallback({
    state: secondLogin.searchParams.get("state"),
    code: "second-code",
    providerError: null,
    browserBindingSecret: harness.browserBindingSecret,
    codeVerifier: harness.codeVerifier
  });
  const app = express();
  app.use(createAuthRoutes({
    repository: harness.repository,
    provider: harness.provider.provider,
    cookieSecure: false,
    origin: "http://localhost:3000",
    redirectUri,
    environment: "test",
    now: () => harness.currentTime
  }));
  app.use(createErrorHandler({ logger }));
  const server = app.listen(0, "127.0.0.1");
  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${String(address.port)}/auth/me`;

  const missing = await fetch(url);
  assert.equal(missing.status, 401);
  assert.deepEqual(await missing.json(), {
    error: {
      code: "authentication_required",
      message: "Authentication is required."
    }
  });

  const valid = await fetch(url, {
    headers: { Cookie: `squid_session=${firstGrant.sessionToken}` }
  });
  assert.equal(valid.status, 200);
  const validBody: unknown = await valid.json();
  assert.deepEqual(validBody, { authenticated: true });
  assert.equal(JSON.stringify(validBody).includes(firstGrant.sessionToken), false);
  assert.equal(JSON.stringify(harness.sessions[0]).includes(firstGrant.sessionToken), false);

  await harness.repository.revokeSession(
    hashSessionToken(firstGrant.sessionToken),
    new Date("2026-10-26T12:01:00.000Z")
  );
  const revoked = await fetch(url, {
    headers: { Cookie: `squid_session=${firstGrant.sessionToken}` }
  });
  assert.equal(revoked.status, 401);

  harness.setNow(new Date(secondGrant.expiresAt.getTime() + 1));
  const expired = await fetch(url, {
    headers: { Cookie: `squid_session=${secondGrant.sessionToken}` }
  });
  assert.equal(expired.status, 401);
});

void test("marks browser-binding and session cookies Secure for HTTPS deployments", async (context) => {
  const harness = createHarness();
  const logger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
  const app = express();
  app.use(createAuthRoutes({
    repository: harness.repository,
    provider: harness.provider.provider,
    cookieSecure: true,
    origin: "http://localhost:3000",
    redirectUri,
    environment: "test"
  }));
  app.use(createErrorHandler({ logger }));
  const server = app.listen(0, "127.0.0.1");
  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const response = await fetch(`http://127.0.0.1:${String(address.port)}/auth/google/login`, {
    redirect: "manual"
  });
  assert.equal(response.status, 302);
  const loginCookies = response.headers.getSetCookie();
  const bindingSetCookie = loginCookies.find((cookie) => cookie.startsWith(secureBindingCookiePrefix));
  const pkceSetCookie = loginCookies.find((cookie) => cookie.startsWith(securePkceCookiePrefix));
  assert.ok(bindingSetCookie);
  assert.ok(pkceSetCookie);
  for (const cookie of [bindingSetCookie, pkceSetCookie]) {
    assert.match(cookie, /; Secure/u);
    assert.match(cookie, /; HttpOnly/u);
    assert.match(cookie, /; SameSite=Lax/u);
    assert.match(cookie, /; Path=\/auth\/google\/callback/u);
  }

  const authorizationUrl = new URL(response.headers.get("location") ?? "");
  const state = authorizationUrl.searchParams.get("state");
  assert.ok(state);
  const bindingCookie = bindingSetCookie.split(";")[0];
  const pkceCookie = pkceSetCookie.split(";")[0];
  assert.ok(bindingCookie);
  assert.ok(pkceCookie);
  const callback = await fetch(
    `http://127.0.0.1:${String(address.port)}/auth/google/callback?state=${encodeURIComponent(state)}&code=mock-code`,
    { headers: { Cookie: `${bindingCookie}; ${pkceCookie}` }, redirect: "manual" }
  );
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get("location"), "http://127.0.0.1:3000/drive");
  const cookies = callback.headers.getSetCookie();
  const secureSessionCookie = cookies.find((value) => value.startsWith("__Host-squid_session="));
  const clearedBinding = cookies.find((value) => value.startsWith(secureBindingCookiePrefix));
  const clearedPkce = cookies.find((value) => value.startsWith(securePkceCookiePrefix));
  assert.ok(secureSessionCookie);
  assert.ok(clearedBinding);
  assert.ok(clearedPkce);
  assert.match(clearedBinding, /; Secure/u);
  assert.match(clearedPkce, /; Secure/u);
  assert.match(clearedBinding, /Expires=Thu, 01 Jan 1970/u);
  assert.match(clearedPkce, /Expires=Thu, 01 Jan 1970/u);
  assert.match(secureSessionCookie, /; Secure/u);
  assert.match(secureSessionCookie, /; HttpOnly/u);
  assert.match(secureSessionCookie, /; SameSite=Lax/u);
  assert.match(secureSessionCookie, /; Path=\/(?:;|$)/u);
  const sessionMaxAge = secureSessionCookie.match(/Max-Age=(\d+)/u)?.[1];
  assert.ok(sessionMaxAge);
  assert.ok(Number(sessionMaxAge) <= 28_800 && Number(sessionMaxAge) >= 28_790);
  assert.doesNotMatch(secureSessionCookie, /Domain=/iu);

  const sessionToken = secureSessionCookie.split(";")[0]?.slice("__Host-squid_session=".length);
  assert.ok(sessionToken);
  const logout = await fetch(`http://127.0.0.1:${String(address.port)}/auth/logout`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:3000",
      Cookie: `__Host-squid_session=${sessionToken}`
    }
  });
  assert.equal(logout.status, HTTP_STATUS.noContent);
  const clearedCookies = logout.headers.getSetCookie();
  const clearedSession = clearedCookies.find((value) => value.startsWith("__Host-squid_session="));
  const logoutClearedBinding = clearedCookies.find((value) => value.startsWith("__Secure-squid_oauth_binding="));
  const logoutClearedPkce = clearedCookies.find((value) => value.startsWith("__Secure-squid_oauth_pkce="));
  assert.ok(clearedSession);
  assert.ok(logoutClearedBinding);
  assert.ok(logoutClearedPkce);
  for (const value of [clearedSession, logoutClearedBinding, logoutClearedPkce]) {
    assert.match(value, /; Secure/u);
    assert.match(value, /; HttpOnly/u);
    assert.match(value, /; SameSite=Lax/u);
    assert.doesNotMatch(value, /Domain=/iu);
  }
  assert.match(clearedSession, /; Path=\/(?:;|$)/u);
  assert.match(logoutClearedBinding, /; Path=\/auth\/google\/callback/u);
  assert.match(logoutClearedPkce, /; Path=\/auth\/google\/callback/u);
});

void test("logout revokes only the validated current session, clears scoped cookies, and is repeatable", async (context) => {
  const harness = createHarness();
  const logMessages: string[] = [];
  const logger: Logger = {
    info: (message) => { logMessages.push(message); },
    warn: (message) => { logMessages.push(message); },
    error: (message) => { logMessages.push(message); }
  };
  const app = express();
  app.use(createAuthRoutes({
    repository: harness.repository,
    provider: harness.provider.provider,
    cookieSecure: false,
    origin: "http://localhost:3000",
    redirectUri,
    environment: "test"
  }));
  app.get("/drive/test", createPrincipalGuard(createSessionPrincipalResolver({
    repository: harness.repository,
    cookieSecure: false
  }))((_request, response, principal) => {
    response.json({ ownerId: principal.ownerId });
  }));
  app.use(createErrorHandler({ logger }));
  const server = app.listen(0, "127.0.0.1");
  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${String(address.port)}`;
  const login = await fetch(`${baseUrl}/auth/google/login`, { redirect: "manual" });
  const authorizationUrl = new URL(login.headers.get("location") ?? "");
  const state = authorizationUrl.searchParams.get("state");
  const loginCookies = login.headers.getSetCookie();
  const bindingCookie = findCookiePair(loginCookies, bindingCookiePrefix);
  const pkceCookie = findCookiePair(loginCookies, pkceCookiePrefix);
  assert.ok(state);
  assert.ok(bindingCookie);
  assert.ok(pkceCookie);
  const callback = await fetch(
    `${baseUrl}/auth/google/callback?state=${encodeURIComponent(state)}&code=mock-code`,
    { headers: { Cookie: `${bindingCookie}; ${pkceCookie}` }, redirect: "manual" }
  );
  assert.equal(callback.status, 302);
  const issuedSessionCookie = callback.headers.getSetCookie()
    .find((cookie) => cookie.startsWith("squid_session="));
  assert.ok(issuedSessionCookie);
  const rawSessionToken = issuedSessionCookie.split(";")[0]?.slice("squid_session=".length);
  assert.ok(rawSessionToken);
  const hash = hashSessionToken(rawSessionToken);
  const secondSession = createSessionToken();
  await harness.repository.createSession({
    ownerId: "another-owner",
    tokenHash: secondSession.tokenHash,
    expiresAt: new Date(Date.now() + 60_000)
  });

  const logout = async () => fetch(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:3000",
      Cookie: `squid_session=${rawSessionToken}; squid_oauth_binding=${harness.browserBindingSecret}; squid_oauth_pkce=${harness.codeVerifier}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ ownerId: "another-owner", sessionId: "another-session" })
  });
  const rejectedLogout = await fetch(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: { Cookie: `squid_session=${rawSessionToken}` }
  });
  assert.equal(rejectedLogout.status, 403);
  assert.equal(harness.sessions[0]?.revokedAt, undefined);
  const response = await logout();
  assert.equal(response.status, HTTP_STATUS.noContent);
  assert.equal(await response.text(), "");
  const clearedCookies = response.headers.getSetCookie();
  const clearedSession = clearedCookies.find((cookie) => cookie.startsWith("squid_session="));
  const clearedBinding = clearedCookies.find((cookie) => cookie.startsWith("squid_oauth_binding="));
  const clearedPkce = clearedCookies.find((cookie) => cookie.startsWith("squid_oauth_pkce="));
  assert.ok(clearedSession);
  assert.ok(clearedBinding);
  assert.ok(clearedPkce);
  for (const cookie of [clearedSession, clearedBinding, clearedPkce]) {
    assert.match(cookie, /HttpOnly/u);
    assert.match(cookie, /SameSite=Lax/u);
    assert.doesNotMatch(cookie, /Domain=/iu);
  }
  assert.match(clearedSession, /Path=\/(?:;|$)/u);
  assert.match(clearedSession, /Expires=Thu, 01 Jan 1970/u);
  assert.match(clearedBinding, /Path=\/auth\/google\/callback/u);
  assert.match(clearedPkce, /Path=\/auth\/google\/callback/u);
  assert.match(clearedBinding, /Expires=Thu, 01 Jan 1970/u);
  assert.ok(harness.sessions[0]?.revokedAt);
  assert.equal(harness.sessions[1]?.revokedAt, undefined);
  assert.equal(await harness.repository.findActiveSession(hash, new Date()), null);
  const driveResponse = await fetch(`${baseUrl}/drive/test`, {
    headers: { Cookie: `squid_session=${rawSessionToken}` }
  });
  assert.equal(driveResponse.status, HTTP_STATUS.unauthorized);
  assert.deepEqual(await driveResponse.json(), {
    error: {
      code: "authentication_required",
      message: "Authentication is required."
    }
  });

  const repeated = await logout();
  assert.equal(repeated.status, HTTP_STATUS.noContent);
  assert.equal(repeated.headers.getSetCookie().length, 3);
  assert.ok(harness.sessions[0].revokedAt);
  assert.deepEqual(logMessages, []);
});

void test("uses Google auth library for code exchange and signed-token verification", async () => {
  const optionsSeen: Readonly<Record<string, string | readonly string[]>>[] = [];
  const verificationOptions: Readonly<{ idToken: string; audience: string }>[] = [];
  const exchangedCodes: Readonly<{ code: string; codeVerifier: string; redirect_uri: string }>[] = [];
  const client: GoogleOAuthClient = {
    generateAuthUrl: (options) => {
      optionsSeen.push(options);
      return "https://accounts.google.com/authorize";
    },
    getToken: (options) => {
      exchangedCodes.push(options);
      return Promise.resolve({ tokens: { id_token: "signed-id-token" } });
    },
    verifyIdToken: (options) => {
      verificationOptions.push(options);
      return Promise.resolve({
        getPayload: () => ({
          iss: "https://accounts.google.com",
          aud: clientId,
          exp: 1_798_000_000,
          sub: identitySubject,
          nonce: "login-nonce",
          email: " Person@Example.com ",
          email_verified: true
        })
      });
    }
  };
  const provider = createGoogleOidcProvider({
    config: { clientId, clientSecret: "test-only-client-secret", redirectUri },
    client,
    now: () => new Date("2026-10-26T12:00:00.000Z")
  });

  provider.createAuthorizationUrl({ state: "state", nonce: "login-nonce", codeChallenge: "pkce-challenge", redirectUri });
  const identity = await provider.verifyAuthorizationCode("auth-code", "test-code-verifier", redirectUri);

  const generatedOptions = optionsSeen.at(0);
  assert.ok(generatedOptions);
  assert.equal(generatedOptions.redirect_uri, redirectUri);
  assert.equal(generatedOptions.state, "state");
  assert.equal(generatedOptions.nonce, "login-nonce");
  assert.equal(generatedOptions.code_challenge, "pkce-challenge");
  assert.equal(generatedOptions.code_challenge_method, "S256");
  assert.deepEqual(generatedOptions.scope, ["openid", "email"]);
  assert.deepEqual(exchangedCodes, [{ code: "auth-code", codeVerifier: "test-code-verifier", redirect_uri: redirectUri }]);
  assert.deepEqual(verificationOptions, [{ idToken: "signed-id-token", audience: clientId }]);
  assert.deepEqual(identity, { subject: identitySubject, nonce: "login-nonce", email: "person@example.com" });
});

void test("reports only safe Google OIDC failure stages and allowlisted provider codes", async () => {
  const failures: unknown[] = [];
  const provider = createGoogleOidcProvider({
    config: { clientId, clientSecret: "test-only-client-secret", redirectUri },
    client: {
      generateAuthUrl: () => "",
      getToken: () => Promise.reject(Object.assign(new Error("raw response includes a secret"), {
        response: { data: { error: "invalid_client", error_description: "must not be logged" } }
      })),
      verifyIdToken: () => Promise.reject(new Error("must not be reached"))
    },
    onVerificationFailure: (failure) => failures.push(failure)
  });

  await assert.rejects(provider.verifyAuthorizationCode("sensitive-authorization-code", "test-code-verifier", redirectUri), {
    name: "GoogleOidcVerificationError",
    message: "Google identity verification failed."
  });
  assert.deepEqual(failures, [{ stage: "token-exchange", providerCode: "invalid_client" }]);
  assert.equal(JSON.stringify(failures).includes("secret"), false);
  assert.equal(JSON.stringify(failures).includes("sensitive-authorization-code"), false);
});

void test("keeps provider secrets and callback codes out of error responses and logs", async (context) => {
  const harness = createHarness();
  const url = await startLogin(harness);
  const state = url.searchParams.get("state");
  assert.ok(state);
  const sensitiveCode = "sensitive-authorization-code";
  harness.provider.failVerification(new Error("provider response contains client secret"));
  const logMessages: string[] = [];
  const logger: Logger = {
    info: (message) => { logMessages.push(message); },
    warn: (message) => { logMessages.push(message); },
    error: (message) => { logMessages.push(message); }
  };
  const app = express();
  app.use(createAuthRoutes({
    repository: harness.repository,
    provider: harness.provider.provider,
    cookieSecure: false,
    origin: "http://localhost:3000",
    redirectUri,
    environment: "test"
  }));
  app.use(createErrorHandler({ logger }));
  const server = app.listen(0, "127.0.0.1");
  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const response = await fetch(
    `http://127.0.0.1:${String(address.port)}/auth/google/callback?state=${encodeURIComponent(state)}&code=${sensitiveCode}`,
    { headers: { Cookie: `${getOAuthCookiePair(state, harness.browserBindingSecret, "binding")}; ${getOAuthCookiePair(state, harness.codeVerifier, "pkce")}` } }
  );
  const body = await response.text();
  assert.equal(response.status, 400);
  assert.equal(body.includes(sensitiveCode), false);
  assert.equal(body.includes("provider response contains client secret"), false);
  assert.deepEqual(logMessages, []);
  assert.equal(harness.sessions.length, 0);
  const callbackCookies = response.headers.getSetCookie();
  assert.ok(callbackCookies.some((cookie) =>
    cookie.startsWith(bindingCookiePrefix) && /Expires=Thu, 01 Jan 1970/u.test(cookie)
  ));
  assert.ok(callbackCookies.some((cookie) =>
    cookie.startsWith(pkceCookiePrefix) && /Expires=Thu, 01 Jan 1970/u.test(cookie)
  ));
  assert.equal(callbackCookies.some((cookie) => cookie.startsWith("squid_session=")), false);
});

void test("does not issue a session cookie when session persistence fails and clears OAuth cookies", async (context) => {
  const harness = createHarness();
  const logger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
  const repository: AuthRepository = {
    ...harness.repository,
    createSession: () => Promise.reject(new Error("private session persistence detail"))
  };
  const app = express();
  app.use(createAuthRoutes({
    repository,
    provider: harness.provider.provider,
    cookieSecure: false,
    origin: "http://localhost:3000",
    redirectUri,
    environment: "test",
    now: () => new Date("2026-10-26T12:00:00.000Z")
  }));
  app.use(createErrorHandler({ logger }));
  const server = app.listen(0, "127.0.0.1");
  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const baseUrl = `http://127.0.0.1:${String(address.port)}`;
  const login = await fetch(`${baseUrl}/auth/google/login`, { redirect: "manual" });
  const authorizationUrl = new URL(login.headers.get("location") ?? "");
  const state = authorizationUrl.searchParams.get("state");
  const loginCookies = login.headers.getSetCookie();
  const bindingCookie = findCookiePair(loginCookies, bindingCookiePrefix);
  const pkceCookie = findCookiePair(loginCookies, pkceCookiePrefix);
  assert.ok(state);
  assert.ok(bindingCookie);
  assert.ok(pkceCookie);
  const callback = await fetch(
    `${baseUrl}/auth/google/callback?state=${encodeURIComponent(state)}&code=mock-code`,
    { headers: { Cookie: `${bindingCookie}; ${pkceCookie}` } }
  );
  assert.equal(callback.status, 500);
  const body = await callback.text();
  assert.equal(body.includes("private session persistence detail"), false);
  const callbackCookies = callback.headers.getSetCookie();
  assert.ok(callbackCookies.some((cookie) =>
    cookie.startsWith(bindingCookiePrefix) && /Expires=Thu, 01 Jan 1970/u.test(cookie)
  ));
  assert.ok(callbackCookies.some((cookie) =>
    cookie.startsWith(pkceCookiePrefix) && /Expires=Thu, 01 Jan 1970/u.test(cookie)
  ));
  assert.equal(callbackCookies.some((cookie) => cookie.startsWith("squid_session=")), false);
  assert.equal(harness.sessions.length, 0);
});

void test("rejects invalid issuer, audience, expiry, missing ID token, and signature verification", async () => {
  const invalidClaims = [
    { iss: "https://evil.example", aud: clientId, exp: 1_798_000_000, sub: identitySubject, nonce: "n" },
    { iss: "https://accounts.google.com", aud: "another-client", exp: 1_798_000_000, sub: identitySubject, nonce: "n" },
    { iss: "https://accounts.google.com", aud: clientId, exp: 1, sub: identitySubject, nonce: "n" },
    { iss: "https://accounts.google.com", aud: clientId, exp: 1_798_000_000, sub: identitySubject, nonce: "n", email: "user@example.test", email_verified: false }
  ];
  for (const claims of invalidClaims) {
    const provider = createGoogleOidcProvider({
      config: { clientId, clientSecret: "test-only-client-secret", redirectUri },
      client: {
        generateAuthUrl: () => "",
        getToken: () => Promise.resolve({ tokens: { id_token: "id-token" } }),
        verifyIdToken: () => Promise.resolve({ getPayload: () => claims })
      },
      now: () => new Date("2026-10-26T12:00:00.000Z")
    });
    await assert.rejects(provider.verifyAuthorizationCode("code", "test-code-verifier", redirectUri), { name: "GoogleOidcVerificationError" });
  }

  const noIdToken = createGoogleOidcProvider({
    config: { clientId, clientSecret: "test-only-client-secret", redirectUri },
    client: {
      generateAuthUrl: () => "",
      getToken: () => Promise.resolve({ tokens: {} }),
      verifyIdToken: () => Promise.resolve({ getPayload: () => undefined })
    }
  });
  await assert.rejects(noIdToken.verifyAuthorizationCode("code", "test-code-verifier", redirectUri), { name: "GoogleOidcVerificationError" });

  const invalidSignature = createGoogleOidcProvider({
    config: { clientId, clientSecret: "test-only-client-secret", redirectUri },
    client: {
      generateAuthUrl: () => "",
      getToken: () => Promise.resolve({ tokens: { id_token: "tampered-token" } }),
      verifyIdToken: () => Promise.reject(new Error("signature details with token secret"))
    }
  });
  await assert.rejects(invalidSignature.verifyAuthorizationCode("code", "test-code-verifier", redirectUri), {
    name: "GoogleOidcVerificationError",
    message: "Google identity verification failed."
  });
});
