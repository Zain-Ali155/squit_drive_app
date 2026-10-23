import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import express from "express";
import type { Logger } from "@workspace/logging";
import type { ApiDriveEntry } from "@workspace/types";
import { createServer } from "../bootstrap/index.js";
import { HTTP_STATUS } from "../constants/index.js";
import { createErrorHandler } from "../middleware/index.js";
import { createDriveRoutes } from "../features/drive/index.js";
import type { DriveEntryRecord, DriveRepository, SupabaseStorageIntegration } from "../features/drive/index.js";
import type { ApiConfig } from "../types/index.js";

const logger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
const config: ApiConfig = {
  environment: "test", host: "127.0.0.1", port: 0, webOrigin: "http://localhost:3000", logLevel: "silent"
};

const createMemoryRepository = (initialEntries: readonly DriveEntryRecord[] = []): DriveRepository => {
  const entries = new Map(initialEntries.map((entry) => [entry._id, entry]));
  const findOwnedEntry = (ownerId: string, entryId: string): Promise<DriveEntryRecord | null> => {
    const entry = entries.get(entryId);
    return Promise.resolve(entry?.ownerId === ownerId && entry.state === "active" ? entry : null);
  };
  const findOwnedEntryForDeletion = (ownerId: string, entryId: string): Promise<DriveEntryRecord | null> => {
    const entry = entries.get(entryId);
    return Promise.resolve(entry?.ownerId === ownerId && ["active", "pending_delete"].includes(entry.state) ? entry : null);
  };
  const createEntry = (entry: Omit<DriveEntryRecord, "createdAt" | "updatedAt">): Promise<DriveEntryRecord> => {
    if ([...entries.values()].some((existing) => existing.ownerId === entry.ownerId && existing.parentId === entry.parentId && existing.normalizedName === entry.normalizedName)) {
      return Promise.reject(Object.assign(new Error("Duplicate sibling name."), { code: 11000 }));
    }
    const now = new Date();
    const saved = Object.freeze({ ...entry, createdAt: now, updatedAt: now });
    entries.set(saved._id, saved);
    return Promise.resolve(saved);
  };
  return {
    findOwnedEntry,
    recordOwnedFileAccess: (ownerId, entryId, accessedAt) => {
      const entry = entries.get(entryId);
      if (!entry || entry.ownerId !== ownerId || entry.state !== "active" || entry.kind !== "file") {
        return Promise.resolve(null);
      }
      const updated = Object.freeze({ ...entry, lastAccessedAt: accessedAt });
      entries.set(entryId, updated);
      return Promise.resolve(updated);
    },
    findOwnedEntryForDeletion,
    listOwnedEntries: (ownerId, parentId, options) => {
      const owned = [...entries.values()].filter((entry) => entry.ownerId === ownerId && entry.state === "active");
      const searched = options.search
        ? owned.filter((entry) => entry.normalizedName.includes(options.search?.toLowerCase() ?? ""))
        : owned;
      const matching = options.recent
        ? searched.filter((entry) => entry.kind === "file" && entry.lastAccessedAt !== undefined)
        : options.favorites
        ? searched.filter((entry) => entry.isStarred)
        : options.search ? searched : searched.filter((entry) => entry.parentId === parentId);
      const offset = (options.page - 1) * options.pageSize;
      const sorted = options.recent
        ? matching.slice().sort((left, right) =>
          (right.lastAccessedAt?.getTime() ?? 0) - (left.lastAccessedAt?.getTime() ?? 0) || left._id.localeCompare(right._id))
        : matching;
      return Promise.resolve({ entries: sorted.slice(offset, offset + options.pageSize), total: sorted.length });
    },
    getOwnedStorageUsage: (ownerId) => Promise.resolve([...entries.values()]
      .filter((entry) => entry.ownerId === ownerId && entry.state === "active" && entry.kind === "file")
      .reduce((total, entry) => total + (entry.sizeBytes ?? 0), 0)),
    createEntry,
    hasOwnedUploadEntry: (ownerId, entryId, storageKey) => {
      const entry = entries.get(entryId);
      return Promise.resolve(entry?.ownerId === ownerId && entry.storageKey === storageKey);
    },
    updateOwnedEntry: async (ownerId, entryId, changes) => {
      const entry = await findOwnedEntry(ownerId, entryId);
      if (!entry) return null;
      const updated = Object.freeze({ ...entry, ...changes, updatedAt: new Date() });
      entries.set(entryId, updated);
      return updated;
    },
    hasOwnedChildren: (ownerId, parentId) => Promise.resolve([...entries.values()].some((entry) => entry.ownerId === ownerId && entry.parentId === parentId && entry.state === "active")),
    deleteOwnedEntry: (ownerId, entryId) => {
      const entry = entries.get(entryId);
      return Promise.resolve(entry?.ownerId === ownerId && ["active", "pending_delete"].includes(entry.state) ? entries.delete(entryId) : false);
    },
    ensureRoot: async (ownerId) => {
      const existing = [...entries.values()].find((entry) => entry.ownerId === ownerId && entry.parentId === null);
      if (existing) return existing;
      return createEntry({
        _id: "00000000-0000-4000-8000-000000000001", ownerId, kind: "folder", name: "My Drive",
        normalizedName: "my drive", parentId: null, isStarred: false, state: "active"
      });
    }
  };
};

void test("Drive HTTP routes scope operations to the local owner and enforce folder rules", async (context) => {
  const app = express();
  app.use(express.json());
  app.use(createDriveRoutes({ repository: createMemoryRepository(), enabled: true, logger }));
  app.use(createErrorHandler({ logger }));
  const server = createServer({ app, config, logger });
  await server.start();
  context.after(async () => { await server.stop(); });
  const address = server.raw.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${String(address.port)}`;

  const initial = await fetch(`${base}/drive/entries`);
  assert.equal(initial.status, HTTP_STATUS.ok);
  const root = await initial.json() as { parentId: string; entries: readonly unknown[] };
  assert.equal(root.entries.length, 0);
  const usageBefore = await fetch(`${base}/drive/storage-usage`);
  assert.equal(usageBefore.status, HTTP_STATUS.ok);
  assert.deepEqual(await usageBefore.json(), { usedBytes: 0 });

  const created = await fetch(`${base}/drive/folders`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Reports" })
  });
  assert.equal(created.status, HTTP_STATUS.created);
  const folder = await created.json() as ApiDriveEntry;
  assert.equal("ownerId" in folder, false);
  assert.equal("storageKey" in folder, false);
  assert.equal(folder.parentId, root.parentId);

  const duplicate = await fetch(`${base}/drive/folders`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "reports" })
  });
  assert.equal(duplicate.status, HTTP_STATUS.conflict);

  const nested = await fetch(`${base}/drive/folders`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Nested", parentId: folder.id })
  });
  assert.equal(nested.status, HTTP_STATUS.created);
  const nestedFolder = await nested.json() as ApiDriveEntry;
  const nonEmptyDelete = await fetch(`${base}/drive/entries/${folder.id}`, { method: "DELETE" });
  assert.equal(nonEmptyDelete.status, HTTP_STATUS.conflict);
  const renamed = await fetch(`${base}/drive/entries/${folder.id}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Reports 2026" })
  });
  assert.equal(renamed.status, HTTP_STATUS.ok);
  assert.equal((await renamed.json() as ApiDriveEntry).name, "Reports 2026");

  const archiveResponse = await fetch(`${base}/drive/folders`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Archive" })
  });
  const archive = await archiveResponse.json() as ApiDriveEntry;
  const moved = await fetch(`${base}/drive/entries/${nestedFolder.id}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ parentId: archive.id })
  });
  assert.equal(moved.status, HTTP_STATUS.ok);
  assert.equal((await moved.json() as ApiDriveEntry).parentId, archive.id);

  const empty = await fetch(`${base}/drive/folders`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Empty" })
  });
  const emptyFolder = await empty.json() as ApiDriveEntry;
  const emptyDelete = await fetch(`${base}/drive/entries/${emptyFolder.id}`, { method: "DELETE" });
  assert.equal(emptyDelete.status, HTTP_STATUS.noContent);

  const foreignParent = "00000000-0000-4000-8000-000000000099";
  const foreignList = await fetch(`${base}/drive/entries?parentId=${foreignParent}`);
  assert.equal(foreignList.status, HTTP_STATUS.notFound);
  const foreignPath = await fetch(`${base}/drive/folders/${foreignParent}/path`);
  assert.equal(foreignPath.status, HTTP_STATUS.notFound);

  const search = await fetch(`${base}/drive/entries?search=nested`);
  assert.equal(search.status, HTTP_STATUS.ok);
  const searched = await search.json() as { entries: readonly ApiDriveEntry[] };
  assert.equal(searched.entries.length, 1);
  assert.equal(searched.entries[0]?.name, "Nested");
  const unknownQueryResponse = await fetch(`${base}/drive/entries?search=missing&type=pdf`);
  assert.equal(unknownQueryResponse.status, HTTP_STATUS.badRequest);
  const emptyResultsResponse = await fetch(`${base}/drive/entries?search=missing%20document&fileType=pdf&page=1&pageSize=1`);
  assert.equal(emptyResultsResponse.status, HTTP_STATUS.ok);
  const emptyResults = await emptyResultsResponse.json() as { entries: readonly ApiDriveEntry[]; total: number };
  assert.deepEqual(emptyResults.entries, []);
  assert.equal(emptyResults.total, 0);
  const ambiguousScope = await fetch(`${base}/drive/entries?parentId=${folder.id}&search=Nested`);
  assert.equal(ambiguousScope.status, HTTP_STATUS.badRequest);
  const ambiguousCollections = await fetch(`${base}/drive/entries?favorites=true&recent=true`);
  assert.equal(ambiguousCollections.status, HTTP_STATUS.badRequest);

  const searchParent = await fetch(`${base}/drive/folders`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Search parent" })
  });
  const parentFolder = await searchParent.json() as ApiDriveEntry;
  const searchChild = await fetch(`${base}/drive/folders`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Search child", parentId: parentFolder.id })
  });
  const childFolder = await searchChild.json() as ApiDriveEntry;
  const searchForChild = await fetch(`${base}/drive/entries?search=Search%20child`);
  const childSearchResults = await searchForChild.json() as { entries: readonly ApiDriveEntry[] };
  assert.equal(childSearchResults.entries[0]?.id, childFolder.id);
  const ancestryResponse = await fetch(`${base}/drive/folders/${childFolder.id}/path`);
  assert.equal(ancestryResponse.status, HTTP_STATUS.ok);
  const ancestry = await ancestryResponse.json() as { breadcrumbs: readonly Readonly<{ id: string; name: string }>[] };
  assert.deepEqual(ancestry.breadcrumbs, [
    { id: root.parentId, name: "My Drive" },
    { id: parentFolder.id, name: "Search parent" },
    { id: childFolder.id, name: "Search child" }
  ]);
  assert.equal("ownerId" in (ancestry.breadcrumbs[0] ?? {}), false);
});

void test("Drive HTTP streams files through private storage and permanently deletes them", async (context) => {
  const objects = new Map<string, Buffer>();
  const operations: string[] = [];
  let failDelete = false;
  let delayNextUploadRead = false;
  const storage: SupabaseStorageIntegration = {
    verifyPrivateBucket: () => Promise.resolve(true),
    uploadObject: async ({ objectKey, body }) => {
      if (delayNextUploadRead) {
        delayNextUploadRead = false;
        await new Promise<void>((resolve) => setTimeout(resolve, 30));
      }
      const bytes = Buffer.from(await new Response(Readable.toWeb(body)).arrayBuffer());
      objects.set(objectKey, bytes);
      operations.push(`upload:${objectKey}`);
    },
    downloadObject: (objectKey) => {
      operations.push(`download:${objectKey}`);
      const bytes = objects.get(objectKey);
      return Promise.resolve(bytes ? {
        body: Readable.from([bytes]), contentType: "application/pdf", contentLength: String(bytes.length)
      } : null);
    },
    removeObject: (objectKey) => {
      operations.push(`delete:${objectKey}`);
      if (failDelete) return Promise.reject(new Error("provider response details"));
      objects.delete(objectKey);
      return Promise.resolve();
    }
  };
  const app = express();
  app.use(express.json());
  app.use(createDriveRoutes({ repository: createMemoryRepository(), enabled: true, logger, storage }));
  app.use(createErrorHandler({ logger }));
  const server = createServer({ app, config, logger });
  await server.start();
  context.after(async () => { await server.stop(); });
  const address = server.raw.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${String(address.port)}`;
  const bytes = Buffer.from("%PDF-1.7 local document");

  const uploaded = await fetch(`${base}/drive/files`, {
    method: "PUT",
    headers: { "content-type": "application/pdf", "x-file-name": "report.pdf" },
    body: bytes
  });
  assert.equal(uploaded.status, HTTP_STATUS.created);
  const file = await uploaded.json() as ApiDriveEntry;
  assert.equal(file.kind, "file");
  assert.equal(file.sizeBytes, bytes.length);
  assert.equal("ownerId" in file, false);
  assert.equal("storageKey" in file, false);

  delayNextUploadRead = true;
  const executable = await fetch(`${base}/drive/files`, {
    method: "PUT",
    headers: { "content-type": "application/pdf", "x-file-name": "bad.pdf" },
    body: Buffer.from("MZ executable")
  });
  assert.equal(executable.status, HTTP_STATUS.badRequest);
  assert.equal(objects.size, 1);

  const subsequentBytes = Buffer.from("%PDF-1.7 subsequent valid document");
  const subsequentUpload = await fetch(`${base}/drive/files`, {
    method: "PUT",
    headers: { "content-type": "application/pdf", "x-file-name": "subsequent.pdf" },
    body: subsequentBytes
  });
  assert.equal(subsequentUpload.status, HTTP_STATUS.created);
  const subsequentFile = await subsequentUpload.json() as ApiDriveEntry;
  assert.equal(subsequentFile.sizeBytes, subsequentBytes.length);
  assert.equal(objects.size, 2);
  const subsequentDelete = await fetch(`${base}/drive/entries/${subsequentFile.id}`, { method: "DELETE" });
  assert.equal(subsequentDelete.status, HTTP_STATUS.noContent);
  assert.equal(objects.size, 1);

  const downloaded = await fetch(`${base}/drive/files/${file.id}/download`);
  assert.equal(downloaded.status, HTTP_STATUS.ok);
  assert.equal(downloaded.headers.get("content-disposition")?.startsWith("attachment;"), true);
  assert.equal(downloaded.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);

  const deleted = await fetch(`${base}/drive/entries/${file.id}`, { method: "DELETE" });
  assert.equal(deleted.status, HTTP_STATUS.noContent);
  assert.equal(objects.size, 0);

  const stuckUpload = await fetch(`${base}/drive/files`, {
    method: "PUT", headers: { "content-type": "application/pdf", "x-file-name": "stuck.pdf" }, body: bytes
  });
  const stuckFile = await stuckUpload.json() as ApiDriveEntry;
  failDelete = true;
  const failedDelete = await fetch(`${base}/drive/entries/${stuckFile.id}`, { method: "DELETE" });
  assert.equal(failedDelete.status, HTTP_STATUS.serviceUnavailable);
  assert.equal(objects.size, 1);
  const visibleEntries = await fetch(`${base}/drive/entries`);
  const visible = await visibleEntries.json() as { entries: readonly ApiDriveEntry[] };
  assert.equal(visible.entries.length, 0);
  const permanentFailure = await fetch(`${base}/drive/entries/${stuckFile.id}`, { method: "DELETE" });
  assert.equal(permanentFailure.status, HTTP_STATUS.serviceUnavailable);
  assert.equal(objects.size, 1);
  const stillHidden = await fetch(`${base}/drive/entries`);
  assert.equal((await stillHidden.json() as { entries: readonly ApiDriveEntry[] }).entries.length, 0);
  failDelete = false;
  const recovered = await fetch(`${base}/drive/entries/${stuckFile.id}`, { method: "DELETE" });
  assert.equal(recovered.status, HTTP_STATUS.noContent);
  assert.equal(objects.size, 0);
  const repeatedDelete = await fetch(`${base}/drive/entries/${stuckFile.id}`, { method: "DELETE" });
  assert.equal(repeatedDelete.status, HTTP_STATUS.notFound);
  assert.equal(operations.filter((operation) => operation.startsWith("delete:")).length, 6);
  assert.deepEqual(operations.map((operation) => operation.split(":")[0]), [
    "upload", "delete", "upload", "delete", "download", "delete", "upload", "delete", "delete", "delete"
  ]);
});

void test("Drive HTTP lists and downloads RAR and unknown files with original bytes and safe MIME metadata", async (context) => {
  const objects = new Map<string, Readonly<{ bytes: Buffer; contentType: string }>>();
  const storage: SupabaseStorageIntegration = {
    verifyPrivateBucket: () => Promise.resolve(true),
    uploadObject: async ({ objectKey, contentType, body }) => {
      const bytes = Buffer.from(await new Response(Readable.toWeb(body)).arrayBuffer());
      objects.set(objectKey, Object.freeze({ bytes, contentType }));
    },
    downloadObject: (objectKey) => {
      const object = objects.get(objectKey);
      return Promise.resolve(object ? {
        body: Readable.from([object.bytes]), contentType: object.contentType, contentLength: String(object.bytes.length)
      } : null);
    },
    removeObject: (objectKey) => {
      objects.delete(objectKey);
      return Promise.resolve();
    }
  };
  const app = express();
  app.use(express.json());
  app.use(createDriveRoutes({ repository: createMemoryRepository(), enabled: true, logger, storage }));
  app.use(createErrorHandler({ logger }));
  const server = createServer({ app, config, logger });
  await server.start();
  context.after(async () => { await server.stop(); });
  const address = server.raw.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${String(address.port)}`;

  const uploads = [
    {
      name: "archive.rar",
      contentType: "application/vnd.rar",
      bytes: Buffer.from("Rar!\x1a\x07\x00 original archive bytes")
    },
    {
      name: "backup.custom",
      contentType: "application/x-custom",
      bytes: Buffer.from([0x00, 0xff, 0x13, 0x37, 0x01])
    }
  ] as const;

  for (const upload of uploads) {
    const response = await fetch(`${base}/drive/files`, {
      method: "PUT",
      headers: { "content-type": upload.contentType, "x-file-name": upload.name },
      body: upload.bytes
    });
    assert.equal(response.status, HTTP_STATUS.created, `${upload.name}: ${await response.clone().text()}`);
    const entry = await response.json() as ApiDriveEntry;
    assert.equal(entry.name, upload.name);
    assert.equal(entry.mimeType, upload.name.endsWith(".rar") ? "application/vnd.rar" : "application/octet-stream");
    assert.equal(entry.sizeBytes, upload.bytes.length);

    const listingResponse = await fetch(`${base}/drive/entries?search=${encodeURIComponent(upload.name)}`);
    assert.equal(listingResponse.status, HTTP_STATUS.ok);
    const listing = await listingResponse.json() as { entries: readonly ApiDriveEntry[] };
    assert.equal(listing.entries[0]?.id, entry.id);

    const downloadResponse = await fetch(`${base}/drive/files/${entry.id}/download`);
    assert.equal(downloadResponse.status, HTTP_STATUS.ok);
    assert.equal(downloadResponse.headers.get("content-type"), entry.mimeType);
    assert.equal(downloadResponse.headers.get("content-disposition")?.includes(encodeURIComponent(upload.name)), true);
    assert.deepEqual(Buffer.from(await downloadResponse.arrayBuffer()), upload.bytes);
  }
});

void test("Drive delete retry cannot access a pending record owned by another user", async (context) => {
  const foreignEntry: DriveEntryRecord = {
    _id: "00000000-0000-4000-8000-000000000099", ownerId: "another-owner", kind: "file", name: "private.pdf",
    normalizedName: "private.pdf", parentId: "another-folder", isStarred: false, mimeType: "application/pdf", sizeBytes: 10,
    storageKey: "another-users-object", state: "pending_delete", createdAt: new Date(), updatedAt: new Date()
  };
  const storageCalls: string[] = [];
  const storage: SupabaseStorageIntegration = {
    verifyPrivateBucket: () => Promise.resolve(true),
    uploadObject: () => Promise.resolve(),
    downloadObject: () => Promise.resolve(null),
    removeObject: (objectKey) => { storageCalls.push(objectKey); return Promise.resolve(); }
  };
  const app = express();
  app.use(express.json());
  app.use(createDriveRoutes({ repository: createMemoryRepository([foreignEntry]), enabled: true, logger, storage }));
  app.use(createErrorHandler({ logger }));
  const server = createServer({ app, config, logger });
  await server.start();
  context.after(async () => { await server.stop(); });
  const address = server.raw.address();
  assert.ok(address && typeof address === "object");

  const response = await fetch(`http://127.0.0.1:${String(address.port)}/drive/entries/${foreignEntry._id}`, { method: "DELETE" });

  assert.equal(response.status, HTTP_STATUS.notFound);
  assert.deepEqual(storageCalls, []);
});

void test("Drive favorites list and star routes are scoped to active entries owned by the current user", async (context) => {
  const now = new Date("2026-10-22T00:00:00.000Z");
  const makeEntry = (input: Readonly<{
    id: string;
    ownerId: string;
    name: string;
    isStarred: boolean;
    state: "active" | "pending_delete";
  }>): DriveEntryRecord => ({
    _id: input.id,
    ownerId: input.ownerId,
    kind: "file",
    name: input.name,
    normalizedName: input.name.toLowerCase(),
    parentId: "00000000-0000-4000-8000-000000000001",
    isStarred: input.isStarred,
    mimeType: "text/plain",
    sizeBytes: 10,
    storageKey: `storage-${input.id}`,
    state: input.state,
    createdAt: now,
    updatedAt: now
  });

  const ownStarred = makeEntry({
    id: "00000000-0000-4000-8000-000000000011",
    ownerId: "local-demo-owner",
    name: "Already starred.txt",
    isStarred: true,
    state: "active"
  });
  const ownUnstarred = makeEntry({
    id: "00000000-0000-4000-8000-000000000012",
    ownerId: "local-demo-owner",
    name: "New favorite.txt",
    isStarred: false,
    state: "active"
  });
  const ownDeleted = makeEntry({
    id: "00000000-0000-4000-8000-000000000013",
    ownerId: "local-demo-owner",
    name: "Deleted favorite.txt",
    isStarred: true,
    state: "pending_delete"
  });
  const foreignStarred = makeEntry({
    id: "00000000-0000-4000-8000-000000000014",
    ownerId: "another-owner",
    name: "Another owner's favorite.txt",
    isStarred: true,
    state: "active"
  });
  const app = express();
  app.use(express.json());
  app.use(createDriveRoutes({
    repository: createMemoryRepository([ownStarred, ownUnstarred, ownDeleted, foreignStarred]),
    enabled: true,
    logger
  }));
  app.use(createErrorHandler({ logger }));
  const server = createServer({ app, config, logger });
  await server.start();
  context.after(async () => { await server.stop(); });
  const address = server.raw.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${String(address.port)}`;

  const initialFavoritesResponse = await fetch(`${base}/drive/entries?favorites=true`);
  assert.equal(initialFavoritesResponse.status, HTTP_STATUS.ok);
  const initialFavorites = await initialFavoritesResponse.json() as { entries: readonly ApiDriveEntry[] };
  assert.deepEqual(initialFavorites.entries.map((entry) => entry.name), ["Already starred.txt"]);

  const starResponse = await fetch(`${base}/drive/entries/${ownUnstarred._id}/favorite`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ isStarred: true })
  });
  assert.equal(starResponse.status, HTTP_STATUS.ok);
  assert.equal((await starResponse.json() as ApiDriveEntry).isStarred, true);

  const starredList = await fetch(`${base}/drive/entries?favorites=true&search=new%20favorite`);
  const starredEntries = await starredList.json() as { entries: readonly ApiDriveEntry[] };
  assert.deepEqual(starredEntries.entries.map((entry) => entry.name), ["New favorite.txt"]);

  const unstarResponse = await fetch(`${base}/drive/entries/${ownUnstarred._id}/favorite`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ isStarred: false })
  });
  assert.equal(unstarResponse.status, HTTP_STATUS.ok);
  assert.equal((await unstarResponse.json() as ApiDriveEntry).isStarred, false);

  for (const entry of [foreignStarred, ownDeleted]) {
    const response = await fetch(`${base}/drive/entries/${entry._id}/favorite`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isStarred: false })
    });
    assert.equal(response.status, HTTP_STATUS.notFound);
  }
  const invalidFavorite = await fetch(`${base}/drive/entries/${ownStarred._id}/favorite`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ isStarred: "false" })
  });
  assert.equal(invalidFavorite.status, HTTP_STATUS.badRequest);

  const finalFavoritesResponse = await fetch(`${base}/drive/entries?favorites=true`);
  const finalFavorites = await finalFavoritesResponse.json() as { entries: readonly ApiDriveEntry[] };
  assert.deepEqual(finalFavorites.entries.map((entry) => entry.name), ["Already starred.txt"]);
});

void test("Drive Recent records only owner-owned active file access and returns unique files newest first with pagination", async (context) => {
  const now = new Date("2026-10-22T00:00:00.000Z");
  const makeEntry = (input: Readonly<{
    id: string;
    ownerId: string;
    name: string;
    state: "active" | "pending_delete";
    lastAccessedAt?: Date;
    kind?: "file" | "folder";
  }>): DriveEntryRecord => ({
    _id: input.id,
    ownerId: input.ownerId,
    kind: input.kind ?? "file",
    name: input.name,
    normalizedName: input.name.toLowerCase(),
    parentId: "00000000-0000-4000-8000-000000000001",
    isStarred: false,
    mimeType: "text/plain",
    sizeBytes: 10,
    storageKey: `storage-${input.id}`,
    state: input.state,
    createdAt: now,
    updatedAt: now,
    ...(input.lastAccessedAt ? { lastAccessedAt: input.lastAccessedAt } : {})
  });

  void test("Drive storage usage sums only active files owned by the current demo owner", async (context) => {
    const createdAt = new Date("2026-10-22T00:00:00.000Z");
    const makeEntry = (input: Readonly<{
      id: string;
      ownerId: string;
      kind: "file" | "folder";
      state: "active" | "pending_delete";
      sizeBytes?: number;
    }>): DriveEntryRecord => ({
      _id: input.id,
      ownerId: input.ownerId,
      kind: input.kind,
      name: input.id,
      normalizedName: input.id,
      parentId: "00000000-0000-4000-8000-000000000001",
      isStarred: false,
      ...(input.kind === "file" ? { mimeType: "application/pdf", storageKey: `storage-${input.id}` } : {}),
      ...(input.sizeBytes !== undefined ? { sizeBytes: input.sizeBytes } : {}),
      state: input.state,
      createdAt,
      updatedAt: createdAt
    });
    const entries = [
      makeEntry({ id: "owner-file-a", ownerId: "local-demo-owner", kind: "file", state: "active", sizeBytes: 1_250_000 }),
      makeEntry({ id: "owner-file-b", ownerId: "local-demo-owner", kind: "file", state: "active", sizeBytes: 750 }),
      makeEntry({ id: "owner-empty-file", ownerId: "local-demo-owner", kind: "file", state: "active" }),
      makeEntry({ id: "deleted-file", ownerId: "local-demo-owner", kind: "file", state: "pending_delete", sizeBytes: 900_000 }),
      makeEntry({ id: "owner-folder", ownerId: "local-demo-owner", kind: "folder", state: "active", sizeBytes: 500_000 }),
      makeEntry({ id: "foreign-file", ownerId: "another-owner", kind: "file", state: "active", sizeBytes: 4_000_000 })
    ];
    const app = express();
    app.use(express.json());
    app.use(createDriveRoutes({ repository: createMemoryRepository(entries), enabled: true, logger }));
    app.use(createErrorHandler({ logger }));
    const server = createServer({ app, config, logger });
    await server.start();
    context.after(async () => { await server.stop(); });
    const address = server.raw.address();
    assert.ok(address && typeof address === "object");

    const response = await fetch(`http://127.0.0.1:${String(address.port)}/drive/storage-usage`);

    assert.equal(response.status, HTTP_STATUS.ok);
    assert.deepEqual(await response.json(), { usedBytes: 1_250_750 });
  });
  const older = makeEntry({
    id: "00000000-0000-4000-8000-000000000021",
    ownerId: "local-demo-owner",
    name: "Older.txt",
    state: "active",
    lastAccessedAt: new Date("2026-10-20T00:00:00.000Z")
  });
  const newer = makeEntry({
    id: "00000000-0000-4000-8000-000000000022",
    ownerId: "local-demo-owner",
    name: "Newer.txt",
    state: "active",
    lastAccessedAt: new Date("2026-10-21T00:00:00.000Z")
  });
  const neverOpened = makeEntry({
    id: "00000000-0000-4000-8000-000000000023",
    ownerId: "local-demo-owner",
    name: "Never opened.txt",
    state: "active"
  });
  const deleted = makeEntry({
    id: "00000000-0000-4000-8000-000000000024",
    ownerId: "local-demo-owner",
    name: "Deleted.txt",
    state: "pending_delete",
    lastAccessedAt: new Date("2026-10-22T00:00:00.000Z")
  });
  const foreign = makeEntry({
    id: "00000000-0000-4000-8000-000000000025",
    ownerId: "another-owner",
    name: "Foreign.txt",
    state: "active",
    lastAccessedAt: new Date("2026-10-22T00:00:00.000Z")
  });
  const folder = makeEntry({
    id: "00000000-0000-4000-8000-000000000026",
    ownerId: "local-demo-owner",
    name: "Folder",
    state: "active",
    kind: "folder",
    lastAccessedAt: new Date("2026-10-23T00:00:00.000Z")
  });
  const app = express();
  app.use(express.json());
  app.use(createDriveRoutes({
    repository: createMemoryRepository([older, newer, neverOpened, deleted, foreign, folder]),
    enabled: true,
    logger
  }));
  app.use(createErrorHandler({ logger }));
  const server = createServer({ app, config, logger });
  await server.start();
  context.after(async () => { await server.stop(); });
  const address = server.raw.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${String(address.port)}`;

  const firstPageResponse = await fetch(`${base}/drive/entries?recent=true&page=1&pageSize=1`);
  assert.equal(firstPageResponse.status, HTTP_STATUS.ok);
  const firstPage = await firstPageResponse.json() as { entries: readonly ApiDriveEntry[]; total: number };
  assert.equal(firstPage.total, 2);
  assert.deepEqual(firstPage.entries.map((entry) => entry.name), ["Newer.txt"]);
  const secondPageResponse = await fetch(`${base}/drive/entries?recent=true&page=2&pageSize=1`);
  const secondPage = await secondPageResponse.json() as { entries: readonly ApiDriveEntry[] };
  assert.deepEqual(secondPage.entries.map((entry) => entry.name), ["Older.txt"]);

  const accessResponse = await fetch(`${base}/drive/entries/${older._id}/access`, { method: "POST" });
  assert.equal(accessResponse.status, HTTP_STATUS.noContent);
  const repeatedAccessResponse = await fetch(`${base}/drive/entries/${older._id}/access`, { method: "POST" });
  assert.equal(repeatedAccessResponse.status, HTTP_STATUS.noContent);

  const refreshedResponse = await fetch(`${base}/drive/entries?recent=true`);
  const refreshed = await refreshedResponse.json() as { entries: readonly ApiDriveEntry[]; total: number };
  assert.equal(refreshed.total, 2);
  assert.deepEqual(refreshed.entries.map((entry) => entry.name), ["Older.txt", "Newer.txt"]);
  assert.equal(refreshed.entries.filter((entry) => entry.id === older._id).length, 1);

  for (const entry of [foreign, deleted, folder]) {
    const response = await fetch(`${base}/drive/entries/${entry._id}/access`, { method: "POST" });
    assert.equal(response.status, HTTP_STATUS.notFound);
  }
});
