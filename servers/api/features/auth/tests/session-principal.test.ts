import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Logger } from "@workspace/logging";
import {
  createSessionPrincipalResolver,
  createSessionToken
} from "../index.js";
import type {
  AuthRepository,
  AuthSessionRecord,
  AuthUserRecord
} from "../index.js";
import { createErrorHandler, createPrincipalGuard } from "../../../middleware/index.js";
import { ERROR_CODES, ERROR_MESSAGES, HTTP_STATUS } from "../../../constants/index.js";

const logger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
const currentTime = new Date("2026-10-26T12:00:00.000Z");

const createHarness = () => {
  const sessions = new Map<string, AuthSessionRecord>();
  const users = new Map<string, AuthUserRecord>();
  const lookedUpHashes: string[] = [];
  const repository: AuthRepository = {
    findOrCreateGoogleUser: () => Promise.reject(new Error("Unexpected user creation.")),
    findUserById: (ownerId) => Promise.resolve(users.get(ownerId) ?? null),
    createOAuthTransaction: () => Promise.resolve(),
    consumeOAuthTransaction: () => Promise.resolve(null),
    createSession: () => Promise.reject(new Error("Unexpected session creation.")),
    findActiveSession: (tokenHash, _at) => {
      lookedUpHashes.push(tokenHash);
      return Promise.resolve(sessions.get(tokenHash) ?? null);
    },
    revokeSession: () => Promise.resolve(false)
  };
  const addSession = (
    ownerId: string,
    options: Readonly<{ expiresAt?: Date; revokedAt?: Date; userExists?: boolean }> = {}
  ) => {
    const material = createSessionToken();
    const session: AuthSessionRecord = {
      _id: `session-${String(sessions.size + 1)}`,
      ownerId,
      tokenHash: material.tokenHash,
      expiresAt: options.expiresAt ?? new Date(currentTime.getTime() + 60_000),
      ...(options.revokedAt ? { revokedAt: options.revokedAt } : {}),
      createdAt: currentTime,
      updatedAt: currentTime
    };
    sessions.set(material.tokenHash, session);
    if (options.userExists !== false) {
      users.set(ownerId, {
        _id: ownerId,
        googleSubject: `google-sub-${ownerId}`,
        email: `${ownerId}@example.test`,
        createdAt: currentTime,
        updatedAt: currentTime
      });
    }
    return material;
  };
  return { repository, addSession, lookedUpHashes };
};

const startServer = async (
  resolver: ReturnType<typeof createSessionPrincipalResolver>,
  context: Readonly<{ after: (callback: () => Promise<void>) => void }>,
  secureCookie = false
) => {
  const app = express();
  app.use(express.json());
  const guarded = createPrincipalGuard(resolver)((_request, response, principal) => {
    response.json({ ownerId: principal.ownerId });
  });
  app.all("/drive/entries", guarded);
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
  const cookieName = secureCookie ? "__Host-squid_session" : "squid_session";
  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    cookieName
  };
};

void test("missing, invalid, expired, revoked, and orphaned sessions are unauthenticated", async (context) => {
  const harness = createHarness();
  const expired = harness.addSession("expired-owner", {
    expiresAt: new Date(currentTime.getTime() - 1)
  });
  const revoked = harness.addSession("revoked-owner", {
    revokedAt: currentTime
  });
  const orphaned = harness.addSession("deleted-owner", { userExists: false });
  const resolver = createSessionPrincipalResolver({
    repository: harness.repository,
    cookieSecure: false,
    now: () => new Date(currentTime)
  });
  const { baseUrl } = await startServer(resolver, context);

  const cases = [
    { name: "missing", cookie: null },
    { name: "malformed", cookie: "squid_session=not-a-token" },
    { name: "unknown token", cookie: `squid_session=${createSessionToken().token}` },
    { name: "expired", cookie: `squid_session=${expired.token}` },
    { name: "revoked", cookie: `squid_session=${revoked.token}` },
    { name: "orphaned user", cookie: `squid_session=${orphaned.token}` },
    { name: "duplicate cookies", cookie: `squid_session=${expired.token}; squid_session=${expired.token}` }
  ] as const;

  for (const { name, cookie } of cases) {
    const response = await fetch(`${baseUrl}/drive/entries`, {
      ...(cookie ? { headers: { Cookie: cookie } } : {})
    });
    assert.equal(response.status, HTTP_STATUS.unauthorized, name);
    assert.deepEqual(await response.json(), {
      error: {
        code: ERROR_CODES.authenticationRequired,
        message: ERROR_MESSAGES.authenticationRequired
      }
    });
  }
  assert.ok(harness.lookedUpHashes.every((hash) => !hash.includes("=")));
});

void test("session cookie resolves the internal owner and isolates users from spoofed owner input", async (context) => {
  const harness = createHarness();
  const ownerA = harness.addSession("internal-owner-a");
  const ownerB = harness.addSession("internal-owner-b");
  const resolver = createSessionPrincipalResolver({
    repository: harness.repository,
    cookieSecure: false,
    now: () => new Date(currentTime)
  });
  const { baseUrl } = await startServer(resolver, context);

  const ownerAResponse = await fetch(`${baseUrl}/drive/entries?ownerId=internal-owner-b`, {
    headers: {
      Cookie: `squid_session=${ownerA.token}`,
      "x-owner-id": "internal-owner-b"
    }
  });
  assert.equal(ownerAResponse.status, HTTP_STATUS.ok);
  assert.deepEqual(await ownerAResponse.json(), { ownerId: "internal-owner-a" });

  const ownerBResponse = await fetch(`${baseUrl}/drive/entries`, {
    method: "POST",
    headers: {
      Cookie: `squid_session=${ownerB.token}`,
      "Content-Type": "application/json",
      "x-owner-id": "internal-owner-a"
    },
    body: JSON.stringify({ ownerId: "internal-owner-a" })
  });
  assert.equal(ownerBResponse.status, HTTP_STATUS.ok);
  assert.deepEqual(await ownerBResponse.json(), {
    ownerId: "internal-owner-b"
  });
  assert.deepEqual(harness.lookedUpHashes, [ownerA.tokenHash, ownerB.tokenHash]);
});

void test("HTTPS session resolution reads only the __Host-prefixed cookie", async (context) => {
  const harness = createHarness();
  const material = harness.addSession("secure-owner");
  const resolver = createSessionPrincipalResolver({
    repository: harness.repository,
    cookieSecure: true,
    now: () => new Date(currentTime)
  });
  const { baseUrl, cookieName } = await startServer(resolver, context, true);

  const unprefixed = await fetch(`${baseUrl}/drive/entries`, {
    headers: { Cookie: `squid_session=${material.token}` }
  });
  assert.equal(unprefixed.status, HTTP_STATUS.unauthorized);
  const prefixed = await fetch(`${baseUrl}/drive/entries`, {
    headers: { Cookie: `${cookieName}=${material.token}` }
  });
  assert.equal(prefixed.status, HTTP_STATUS.ok);
  assert.deepEqual(await prefixed.json(), { ownerId: "secure-owner" });
});
