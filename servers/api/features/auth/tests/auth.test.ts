import test from "node:test";
import assert from "node:assert/strict";
import {
  authSessionSchema,
  authUserSchema,
  createAuthRepository,
  createSessionToken,
  oauthTransactionSchema,
  hashSessionToken,
  isOpaqueSessionToken
} from "../index.js";
import type {
  AuthSessionModel,
  AuthSessionRecord,
  AuthUserModel,
  AuthUserRecord,
  OAuthTransactionModel,
  OAuthTransactionRecord
} from "../index.js";

void test("creates unpredictable opaque tokens and stores only their SHA-256 hashes", () => {
  const first = createSessionToken();
  const second = createSessionToken();

  assert.equal(isOpaqueSessionToken(first.token), true);
  assert.equal(first.token.length, 43);
  assert.equal(first.tokenHash, hashSessionToken(first.token));
  assert.equal(first.tokenHash.length, 64);
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.tokenHash, first.token);
  assert.equal(isOpaqueSessionToken("not-a-session-token"), false);
});

void test("defines unique external-subject and token-hash indexes plus expiry cleanup", () => {
  const userIndexes = authUserSchema.indexes();
  const sessionIndexes = authSessionSchema.indexes();

  assert.ok(userIndexes.some(([keys, options]) =>
    keys.googleSubject === 1 && options.name === "auth_google_subject_unique" && options.unique === true
  ));
  assert.ok(sessionIndexes.some(([keys, options]) =>
    keys.tokenHash === 1 && options.name === "auth_session_token_hash_unique" && options.unique === true
  ));
  assert.ok(sessionIndexes.some(([keys, options]) =>
    keys.expiresAt === 1 && options.name === "auth_session_expiry_ttl" && options.expireAfterSeconds === 0
  ));
  assert.ok(oauthTransactionSchema.indexes().some(([keys, options]) =>
    keys.stateHash === 1 && options.name === "auth_oauth_state_hash_unique" && options.unique === true
  ));
  assert.ok(oauthTransactionSchema.indexes().some(([keys, options]) =>
    keys.expiresAt === 1 && options.name === "auth_oauth_transaction_expiry_ttl" && options.expireAfterSeconds === 0
  ));
});

void test("persists only session token hashes and filters out expired or revoked sessions", async () => {
  const material = createSessionToken();
  const now = new Date("2026-01-01T00:00:00.000Z");
  const expiresAt = new Date("2026-01-02T00:00:00.000Z");
  const activeSession: AuthSessionRecord = {
    _id: "session-id",
    ownerId: "internal-owner-id",
    tokenHash: material.tokenHash,
    expiresAt,
    createdAt: now,
    updatedAt: now
  };
  const user: AuthUserRecord = {
    _id: "internal-owner-id",
    googleSubject: "verified-google-subject",
    email: "owner@example.test",
    createdAt: now,
    updatedAt: now
  };
  const persisted: Record<string, unknown>[] = [];
  const sessionFilters: Record<string, unknown>[] = [];
  const updateFilters: Record<string, unknown>[] = [];
  const userFilters: Record<string, unknown>[] = [];
  const userUpdates: Record<string, unknown>[] = [];
  const userLookupFilters: Record<string, unknown>[] = [];
  const sessionModel = {
    create: (input: Record<string, unknown>) => {
      persisted.push(input);
      return Promise.resolve({ toObject: () => ({ ...input, createdAt: now, updatedAt: now }) });
    },
    findOne: (filter: Record<string, unknown>) => {
      sessionFilters.push(filter);
      return { lean: () => ({ exec: () => Promise.resolve(activeSession) }) };
    },
    updateOne: (filter: Record<string, unknown>) => {
      updateFilters.push(filter);
      return { exec: () => Promise.resolve({ modifiedCount: 1 }) };
    }
  } as unknown as AuthSessionModel;
  const userModel = {
    findOneAndUpdate: (filter: Record<string, unknown>, update: Record<string, unknown>) => {
      userFilters.push(filter);
      userUpdates.push(update);
      return { lean: () => ({ exec: () => Promise.resolve(user) }) };
    },
    findOne: (filter: Record<string, unknown>) => {
      userLookupFilters.push(filter);
      return { lean: () => ({ exec: () => Promise.resolve(user) }) };
    }
  } as unknown as AuthUserModel;
  const repository = createAuthRepository({ sessionModel, userModel });

  await repository.createSession({
    ownerId: "internal-owner-id",
    tokenHash: material.tokenHash,
    expiresAt
  });
  const storedSession = persisted.at(0);
  assert.ok(storedSession);
  assert.equal(JSON.stringify(storedSession).includes(material.token), false);
  assert.equal(storedSession.tokenHash, material.tokenHash);
  assert.equal(storedSession.ownerId, "internal-owner-id");

  assert.equal(await repository.findActiveSession(material.tokenHash, now), activeSession);
  assert.deepEqual(sessionFilters[0], {
    tokenHash: material.tokenHash,
    expiresAt: { $gt: now },
    revokedAt: { $exists: false }
  });
  assert.equal(await repository.revokeSession(material.tokenHash, now), true);
  assert.deepEqual(updateFilters[0], {
    tokenHash: material.tokenHash,
    revokedAt: { $exists: false }
  });

  const mappedUser = await repository.findOrCreateGoogleUser("verified-google-subject", "owner@example.test");
  assert.equal(mappedUser, user);
  assert.deepEqual(userFilters[0], { googleSubject: "verified-google-subject" });
  const userUpdate = userUpdates[0];
  assert.ok(userUpdate);
  assert.deepEqual(userUpdate.$set, { email: "owner@example.test" });
  assert.equal(typeof (userUpdate.$setOnInsert as Readonly<Record<string, unknown>>)._id, "string");
  assert.equal((userUpdate.$setOnInsert as Readonly<Record<string, unknown>>).googleSubject, "verified-google-subject");
  assert.equal(await repository.findUserById("internal-owner-id"), user);
  assert.deepEqual(userLookupFilters[0], { _id: "internal-owner-id" });
});

void test("consumes an unexpired OAuth transaction atomically by its state digest", async () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const transaction: OAuthTransactionRecord = {
    _id: "transaction-id",
    stateHash: "a".repeat(64) as OAuthTransactionRecord["stateHash"],
    nonceHash: "b".repeat(64) as OAuthTransactionRecord["nonceHash"],
    browserBindingHash: "c".repeat(64) as OAuthTransactionRecord["browserBindingHash"],
    codeChallengeHash: "d".repeat(64) as OAuthTransactionRecord["codeChallengeHash"],
    redirectUriHash: "e".repeat(64) as OAuthTransactionRecord["redirectUriHash"],
    expiresAt: new Date("2026-01-02T00:00:00.000Z"),
    createdAt: now,
    updatedAt: now
  };
  const created: Record<string, unknown>[] = [];
  const filters: Record<string, unknown>[] = [];
  const oauthTransactionModel = {
    create: (input: Record<string, unknown>) => {
      created.push(input);
      return Promise.resolve(input);
    },
    findOneAndDelete: (filter: Record<string, unknown>) => {
      filters.push(filter);
      return { lean: () => ({ exec: () => Promise.resolve(transaction) }) };
    }
  } as unknown as OAuthTransactionModel;
  const repository = createAuthRepository({ oauthTransactionModel });

  await repository.createOAuthTransaction({
    stateHash: transaction.stateHash,
    nonceHash: transaction.nonceHash,
    browserBindingHash: transaction.browserBindingHash,
    codeChallengeHash: transaction.codeChallengeHash,
    redirectUriHash: transaction.redirectUriHash,
    expiresAt: transaction.expiresAt
  });
  const createdTransaction = created.at(0);
  assert.ok(createdTransaction);
  assert.equal(createdTransaction.stateHash, transaction.stateHash);
  assert.equal(createdTransaction.nonceHash, transaction.nonceHash);
  assert.equal(createdTransaction.browserBindingHash, transaction.browserBindingHash);
  assert.equal(createdTransaction.codeChallengeHash, transaction.codeChallengeHash);
  assert.equal(createdTransaction.redirectUriHash, transaction.redirectUriHash);
  assert.equal(await repository.consumeOAuthTransaction(
    transaction.stateHash,
    transaction.browserBindingHash,
    now
  ), transaction);
  assert.deepEqual(filters[0], {
    stateHash: transaction.stateHash,
    browserBindingHash: transaction.browserBindingHash,
    expiresAt: { $gt: now }
  });
});

void test("recovers a duplicate Google-subject upsert race by reading the winning user mapping", async () => {
  const user: AuthUserRecord = {
    _id: "stable-internal-owner",
    googleSubject: "verified-google-subject",
    email: "owner@example.test",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z")
  };
  const userModel = {
    findOneAndUpdate: () => ({
      lean: () => ({
        exec: () => Promise.reject(Object.assign(new Error("duplicate"), { code: 11000 }))
      })
    }),
    findOne: () => ({ lean: () => ({ exec: () => Promise.resolve(user) }) })
  } as unknown as AuthUserModel;
  const repository = createAuthRepository({ userModel });

  assert.equal(await repository.findOrCreateGoogleUser("verified-google-subject", "owner@example.test"), user);
});
