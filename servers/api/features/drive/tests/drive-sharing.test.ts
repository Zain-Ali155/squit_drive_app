import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { Logger } from "@workspace/logging";
import { createDriveService, createDriveShareLinkService } from "../drive.service.js";
import type { DriveEntryRecord, DriveShareRecord } from "../drive.types.js";
import type { DriveRepository } from "../repositories/index.js";
import type { SupabaseStorageIntegration } from "../integrations/drive.integration.js";

const at = new Date("2026-10-27T12:00:00.000Z");
const ownerId = "owner-verified";
const entry: DriveEntryRecord = Object.freeze({
  _id: "file-id", ownerId, kind: "file", name: "private-report.pdf", normalizedName: "private-report.pdf",
  parentId: "folder-id", mimeType: "application/pdf", sizeBytes: 16, storageKey: "opaque-object-key",
  state: "active", createdAt: at, updatedAt: at
});
const logger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };

const createHarness = (options: Readonly<{ bucketAvailable?: boolean; now?: Date }> = {}) => {
  const shares = new Map<string, DriveShareRecord>();
  let currentTime = options.now ?? at;
  const repository: DriveRepository = {
    findOwnedEntry: (requestOwnerId, entryId) => Promise.resolve(requestOwnerId === ownerId && entryId === entry._id ? entry : null),
    recordOwnedFileAccess: () => Promise.resolve(null),
    findOwnedEntryForDeletion: () => Promise.resolve(null),
    listOwnedEntries: () => Promise.resolve({ entries: [], total: 0 }),
    getOwnedStorageUsage: () => Promise.resolve(0),
    reserveOwnedStorageQuota: () => Promise.resolve(true),
    releaseOwnedStorageQuota: () => Promise.resolve(),
    createEntry: () => Promise.reject(new Error("Unexpected entry creation.")),
    hasOwnedUploadEntry: () => Promise.resolve(false),
    updateOwnedEntry: () => Promise.resolve(null),
    moveOwnedEntryToTrash: () => Promise.resolve(null),
    restoreOwnedEntry: () => Promise.resolve(null),
    markOwnedEntryPendingDelete: () => Promise.resolve(null),
    hasOwnedChildren: () => Promise.resolve(false),
    deleteOwnedEntry: () => Promise.resolve(false),
    ensureRoot: () => Promise.resolve(entry),
    createShare: (input) => {
      const created = Object.freeze({ ...input, createdAt: at, updatedAt: at });
      shares.set(created._id, created);
      return Promise.resolve(created);
    },
    createOrRotateLinkShare: (input) => {
      const current = [...shares.values()].find((share) => share.ownerId === input.ownerId && share.entryId === input.entryId && share.tokenHash);
      const saved = Object.freeze({ ...(current ?? {}), ...input, _id: current?._id ?? input._id, createdAt: current?.createdAt ?? at, updatedAt: at });
      shares.set(saved._id, saved);
      return Promise.resolve(saved);
    },
    findSharesForOwnedEntry: (requestOwnerId, entryId) => Promise.resolve([...shares.values()].filter((share) => share.ownerId === requestOwnerId && share.entryId === entryId)),
    findShareForRecipient: (shareId, recipientEmail) => Promise.resolve(
      [...shares.values()].find((share) => share._id === shareId && share.recipientEmail === recipientEmail) ?? null
    ),
    findShareByTokenHash: (hash) => Promise.resolve([...shares.values()].find((share) => share.tokenHash === hash) ?? null),
    deleteOwnedShare: (requestOwnerId, entryId, shareId) => {
      const share = shares.get(shareId);
      return Promise.resolve(Boolean(share && share.ownerId === requestOwnerId && share.entryId === entryId && shares.delete(shareId)));
    },
    deleteOwnedEntryShares: (requestOwnerId, entryId) => {
      for (const [shareId, share] of shares) if (share.ownerId === requestOwnerId && share.entryId === entryId) shares.delete(shareId);
      return Promise.resolve();
    }
  };
  const storage: SupabaseStorageIntegration = {
    verifyPrivateBucket: () => Promise.resolve(options.bucketAvailable ?? true),
    uploadObject: () => Promise.resolve(),
    downloadObject: () => Promise.resolve({ body: Readable.from([Buffer.from("private file bytes")]), contentType: "application/pdf", contentLength: "18" }),
    removeObject: () => Promise.resolve()
  };
  const shareLinks = createDriveShareLinkService({ repository, storage, now: () => currentTime });
  return {
    repository, storage, shareLinks, shares,
    service: createDriveService({ repository, storage, logger, ownerId, shareLinkService: shareLinks }),
    setNow: (value: Date) => { currentTime = value; }
  };
};

void test("creates a private link with only a token hash stored and streams the owner-scoped file", async () => {
  const harness = createHarness();
  const created = await harness.service.createShareLink(entry._id);

  assert.match(created.token, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(created.share.tokenHash, createHash("sha256").update(created.token).digest("hex"));
  assert.equal(JSON.stringify(created.share).includes(created.token), false);
  assert.equal(created.expiresAt.toISOString(), "2026-11-03T12:00:00.000Z");
  assert.equal((await harness.shareLinks.resolve(created.token))._id, entry._id);

  const downloaded = await harness.shareLinks.download(created.token);
  assert.equal(downloaded.entry._id, entry._id);
  assert.equal(await new Response(Readable.toWeb(downloaded.body)).text(), "private file bytes");
});

void test("link creation is owner-scoped and refuses unavailable private storage", async () => {
  const harness = createHarness({ bucketAvailable: false });
  await assert.rejects(harness.shareLinks.create("other-owner", entry._id), /Drive entry was not found/u);
  await assert.rejects(harness.shareLinks.create(ownerId, entry._id), /Drive persistence or private storage is unavailable/u);
  assert.equal(harness.shares.size, 0);
});

void test("replacing or revoking a link invalidates the previous token", async () => {
  const harness = createHarness();
  const first = await harness.service.createShareLink(entry._id);
  const second = await harness.service.createShareLink(entry._id);

  assert.equal(second.share._id, first.share._id);
  await assert.rejects(harness.shareLinks.resolve(first.token), /Drive entry was not found/u);
  assert.equal((await harness.shareLinks.resolve(second.token))._id, entry._id);
  await harness.service.revokeShare(entry._id, second.share._id);
  await assert.rejects(harness.shareLinks.resolve(second.token), /Drive entry was not found/u);
});

void test("expired, malformed, and unowned link tokens reveal no file metadata", async () => {
  const harness = createHarness();
  const created = await harness.service.createShareLink(entry._id);
  harness.setNow(new Date(created.expiresAt.getTime() + 1));
  await assert.rejects(harness.shareLinks.resolve(created.token), /Drive entry was not found/u);
  await assert.rejects(harness.shareLinks.resolve("not-a-token"), /Drive entry was not found/u);

  const orphan: DriveShareRecord = Object.freeze({
    _id: "orphan-share", ownerId: "different-owner", entryId: entry._id,
    tokenHash: createHash("sha256").update("A".repeat(43)).digest("hex"), expiresAt: new Date(created.expiresAt.getTime() + 10_000),
    createdAt: at, updatedAt: at
  });
  harness.shares.set(orphan._id, orphan);
  await assert.rejects(harness.shareLinks.resolve("A".repeat(43)), /Drive entry was not found/u);
});
