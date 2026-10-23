import test from "node:test";
import assert from "node:assert/strict";
import { createDriveApi } from "../drive.api.js";
import { maxDrivePptxPreviewBytes } from "../utils/drive-preview.logic.js";

void test("Drive client retrieves owner-scoped storage usage and reports API failures", async (): Promise<void> => {
  let requestedUrl = "";
  const api = createDriveApi({
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: (input) => {
      requestedUrl = String(input);
      return Promise.resolve(Response.json({ usedBytes: 1_250_000 }));
    }
  });

  assert.deepEqual(await api.storageUsage(), { usedBytes: 1_250_000 });
  assert.equal(requestedUrl, "http://127.0.0.1:4000/drive/storage-usage");

  const failed = createDriveApi({
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: () => Promise.resolve(Response.json({ error: { message: "Usage unavailable." } }, { status: 503 }))
  });
  await assert.rejects(failed.storageUsage(), /Usage unavailable/u);
});

void test("Drive client builds list queries and uses the shared response contract", async (): Promise<void> => {
  let requestedUrl = "";
  const api = createDriveApi({
    baseUrl: "http://127.0.0.1:4000/",
    fetchImpl: (input) => {
      requestedUrl = String(input);
      return Promise.resolve(Response.json({ entries: [], total: 0, parentId: "root-id" }));
    }
  });
  const result = await api.list({
    search: "quarterly report", page: 2, pageSize: 100, fileType: "pdf",
    modifiedAfter: "2026-10-01", modifiedBefore: "2026-10-22", minSizeBytes: 100, maxSizeBytes: 500,
    sortBy: "updatedAt", sortOrder: "desc", favorites: true
  });

  assert.equal(new URL(requestedUrl).pathname, "/drive/entries");
  assert.equal(new URL(requestedUrl).searchParams.has("parentId"), false);
  assert.equal(new URL(requestedUrl).searchParams.get("search"), "quarterly report");
  assert.equal(new URL(requestedUrl).searchParams.get("pageSize"), "100");
  assert.equal(new URL(requestedUrl).searchParams.get("fileType"), "pdf");
  assert.equal(new URL(requestedUrl).searchParams.get("modifiedAfter"), "2026-10-01");
  assert.equal(new URL(requestedUrl).searchParams.get("modifiedBefore"), "2026-10-22");
  assert.equal(new URL(requestedUrl).searchParams.get("minSizeBytes"), "100");
  assert.equal(new URL(requestedUrl).searchParams.get("maxSizeBytes"), "500");
  assert.equal(new URL(requestedUrl).searchParams.get("sortBy"), "updatedAt");
  assert.equal(new URL(requestedUrl).searchParams.get("sortOrder"), "desc");
  assert.equal(new URL(requestedUrl).searchParams.get("favorites"), "true");
  assert.equal(new URL(requestedUrl).searchParams.has("recent"), false);
  assert.deepEqual(result, { entries: [], total: 0, parentId: "root-id" });
});

void test("Drive client records successful preview access with an owner-authorized API request", async (): Promise<void> => {
  let requestedUrl = "";
  let requestedMethod = "";
  const api = createDriveApi({
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: (input, init) => {
      requestedUrl = String(input);
      requestedMethod = init?.method ?? "GET";
      return Promise.resolve(new Response(null, { status: 204 }));
    }
  });

  await api.recordFileAccess("selected/id");

  assert.equal(requestedUrl, "http://127.0.0.1:4000/drive/entries/selected%2Fid/access");
  assert.equal(requestedMethod, "POST");
});

void test("Drive client stars and unstars entries through the favorite API and reports failures", async (): Promise<void> => {
  let requestedUrl = "";
  let requestedMethod = "";
  let requestedBody = "";
  const api = createDriveApi({
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: (input, init) => {
      requestedUrl = String(input);
      requestedMethod = init?.method ?? "GET";
      requestedBody = String(init?.body ?? "");
      return Promise.resolve(Response.json({
        id: "selected-id", kind: "folder", name: "Reports", parentId: "root-id", isStarred: true,
        createdAt: "2026-10-14T00:00:00.000Z", updatedAt: "2026-10-14T00:00:00.000Z"
      }));
    }
  });

  const starred = await api.setFavorite("selected/id", true);
  assert.equal(requestedUrl, "http://127.0.0.1:4000/drive/entries/selected%2Fid/favorite");
  assert.equal(requestedMethod, "PUT");
  assert.deepEqual(JSON.parse(requestedBody), { isStarred: true });
  assert.equal(starred.isStarred, true);

  const failed = createDriveApi({
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: () => Promise.resolve(Response.json({ error: { code: "drive_entry_not_found", message: "Drive entry not found." } }, { status: 404 }))
  });
  await assert.rejects(failed.setFavorite("missing-id", false), /Drive entry not found/u);
});

void test("Drive client retrieves the owner-authorized ancestry for a folder opened from search", async (): Promise<void> => {
  let requestedUrl = "";
  const api = createDriveApi({
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: (input) => {
      requestedUrl = String(input);
      return Promise.resolve(Response.json({ breadcrumbs: [
        { id: "root-id", name: "My Drive" },
        { id: "parent-id", name: "Projects" },
        { id: "nested-id", name: "Research" }
      ] }));
    }
  });

  const result = await api.folderPath("nested/id");

  assert.equal(requestedUrl, "http://127.0.0.1:4000/drive/folders/nested%2Fid/path");
  assert.deepEqual(result.breadcrumbs.map(({ id }) => id), ["root-id", "parent-id", "nested-id"]);
});

void test("Drive client sends browser uploads to the API with encoded names and parent scope", async (): Promise<void> => {
  let capturedUrl = "";
  const capturedHeaders = new Headers();
  let capturedBody: File | undefined;
  const fakeXhr = {
    upload: { onprogress: null as ((event: ProgressEvent) => void) | null },
    status: 201,
    responseText: JSON.stringify({
      id: "file-id", kind: "file", name: "résumé.pdf", parentId: "folder-id", sizeBytes: 5,
      createdAt: "2026-10-14T00:00:00.000Z", updatedAt: "2026-10-14T00:00:00.000Z"
    }),
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
    open: (_method: string, url: string): void => { capturedUrl = url; },
    setRequestHeader: (name: string, value: string): void => { capturedHeaders.set(name, value); },
    send: (body: File): void => { capturedBody = body; fakeXhr.onload?.(); }
  };
  const api = createDriveApi({
    baseUrl: "http://127.0.0.1:4000",
    xhrFactory: () => fakeXhr as unknown as XMLHttpRequest
  });
  const file = new File(["%PDF-"], "résumé.pdf", { type: "application/pdf" });
  const result = await api.uploadFile(file, "folder-id");

  assert.equal(capturedUrl, "http://127.0.0.1:4000/drive/files");
  assert.equal(capturedHeaders.get("x-file-name"), encodeURIComponent(file.name));
  assert.equal(capturedHeaders.get("x-drive-parent-id"), "folder-id");
  assert.equal(capturedBody, file);
  assert.equal(result.id, "file-id");
  assert.equal(api.downloadUrl(result.id), "http://127.0.0.1:4000/drive/files/file-id/download");
});

void test("Drive client reports upload progress and completes the shared response contract", async (): Promise<void> => {
  const progress: number[] = [];
  const file = new File(["%PDF-"], "report.pdf", { type: "application/pdf" });
  const fakeXhr = {
    upload: { onprogress: null as ((event: ProgressEvent) => void) | null },
    status: 201,
    responseText: JSON.stringify({
      id: "file-id", kind: "file", name: file.name, parentId: "folder-id", sizeBytes: file.size,
      createdAt: "2026-10-14T00:00:00.000Z", updatedAt: "2026-10-14T00:00:00.000Z"
    }),
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
    open: () => undefined,
    setRequestHeader: () => undefined,
    send: () => {
      fakeXhr.upload.onprogress?.({ lengthComputable: true, loaded: 3, total: file.size } as ProgressEvent);
      fakeXhr.onload?.();
    }
  };
  const api = createDriveApi({ baseUrl: "http://127.0.0.1:4000", xhrFactory: () => fakeXhr as unknown as XMLHttpRequest });

  const result = await api.uploadFile(file, "folder-id", ({ loaded }) => progress.push(loaded));

  assert.equal(result.id, "file-id");
  assert.deepEqual(progress, [3, file.size]);
});

void test("Drive client reports safe API errors and local connection failures", async (): Promise<void> => {
  const apiError = createDriveApi({
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: () => Promise.resolve(Response.json({ error: { code: "drive_conflict", message: "Name already exists." } }, { status: 409 }))
  });
  await assert.rejects(apiError.list(), /Name already exists/u);

  const unavailable = createDriveApi({ baseUrl: "http://127.0.0.1:4000", fetchImpl: () => Promise.reject(new Error("socket details")) });
  await assert.rejects(unavailable.list(), /local Drive API is unavailable/u);
});

void test("Drive download action fetches the selected file from its authorized API endpoint", async (): Promise<void> => {
  let requestedUrl = "";
  const api = createDriveApi({
    baseUrl: "http://127.0.0.1:4000/",
    fetchImpl: (input) => {
      requestedUrl = String(input);
      return Promise.resolve(new Response(new Blob(["verified file bytes"], { type: "text/plain" })));
    }
  });

  const blob = await api.downloadFile("selected/file-id");

  assert.equal(requestedUrl, "http://127.0.0.1:4000/drive/files/selected%2Ffile-id/download");
  assert.equal(await blob.text(), "verified file bytes");
});

void test("Drive download action reports API failures without returning file content", async (): Promise<void> => {
  const api = createDriveApi({
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: () => Promise.resolve(Response.json({ error: { code: "drive_entry_not_found", message: "Drive entry not found." } }, { status: 404 }))
  });

  await assert.rejects(api.downloadFile("missing-id"), /Drive entry not found/u);
});

void test("Drive rename updates the selected entry and reports a failed rename", async (): Promise<void> => {
  let requestedUrl = "";
  let requestedMethod = "";
  let requestBody = "";
  const entry = {
    id: "selected-id", kind: "file", name: "renamed.txt", parentId: "folder-id", sizeBytes: 4,
    createdAt: "2026-10-14T00:00:00.000Z", updatedAt: "2026-10-14T00:00:00.000Z"
  } as const;
  const api = createDriveApi({
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: (input, init) => {
      requestedUrl = String(input);
      requestedMethod = init?.method ?? "GET";
      requestBody = String(init?.body ?? "");
      return Promise.resolve(Response.json(entry));
    }
  });

  assert.equal((await api.updateEntry(entry.id, { name: entry.name })).name, "renamed.txt");
  assert.equal(requestedUrl, "http://127.0.0.1:4000/drive/entries/selected-id");
  assert.equal(requestedMethod, "PATCH");
  assert.deepEqual(JSON.parse(requestBody), { name: "renamed.txt" });

  const failedRename = createDriveApi({
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: () => Promise.resolve(Response.json({ error: { code: "drive_conflict", message: "Name already exists." } }, { status: 409 }))
  });
  await assert.rejects(failedRename.updateEntry(entry.id, { name: entry.name }), /Name already exists/u);
});

void test("Drive delete requires the selected entry's DELETE endpoint and reports failures", async (): Promise<void> => {
  let requestedUrl = "";
  let requestedMethod = "";
  const api = createDriveApi({
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: (input, init) => {
      requestedUrl = String(input);
      requestedMethod = init?.method ?? "GET";
      return Promise.resolve(new Response(null, { status: 204 }));
    }
  });

  await api.deleteEntry("selected-id");
  assert.equal(requestedUrl, "http://127.0.0.1:4000/drive/entries/selected-id");
  assert.equal(requestedMethod, "DELETE");

  const failedDelete = createDriveApi({
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: () => Promise.resolve(Response.json({ error: { code: "drive_storage_failure", message: "File deletion could not be completed." } }, { status: 502 }))
  });
  await assert.rejects(failedDelete.deleteEntry("selected-id"), /File deletion could not be completed/u);
});

void test("Drive preview fetches bytes from the authorized download endpoint and validates response MIME", async (): Promise<void> => {
  let requestedUrl = "";
  const api = createDriveApi({
    baseUrl: "http://127.0.0.1:4000/",
    fetchImpl: (input) => {
      requestedUrl = String(input);
      return Promise.resolve(new Response(new Blob(["plain text"], { type: "text/plain; charset=utf-8" })));
    }
  });
  const blob = await api.previewFile("file/id", new AbortController().signal);

  assert.equal(requestedUrl, "http://127.0.0.1:4000/drive/files/file%2Fid/download");
  assert.equal(blob.type, "text/plain;charset=utf-8");
  assert.equal(await blob.text(), "plain text");
});

void test("PPTX preview retrieves bounded bytes only from the authorized Drive download endpoint", async (): Promise<void> => {
  let requestedUrl = "";
  let requestedSignal: AbortSignal | undefined;
  const api = createDriveApi({
    baseUrl: "http://127.0.0.1:4000/",
    fetchImpl: (input, init) => {
      requestedUrl = String(input);
      requestedSignal = init?.signal as AbortSignal | undefined;
      return Promise.resolve(new Response(new Blob(["pptx bytes"], {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      })));
    }
  });
  const controller = new AbortController();

  const blob = await api.previewFile("deck/id", controller.signal, maxDrivePptxPreviewBytes, "deck.pptx");

  assert.equal(requestedUrl, "http://127.0.0.1:4000/drive/files/deck%2Fid/download");
  assert.equal(requestedSignal, controller.signal);
  assert.equal(await blob.text(), "pptx bytes");
});

void test("PPTX preview accepts ZIP or octet-stream responses only for a PPTX filename", async (): Promise<void> => {
  const api = createDriveApi({
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: () => Promise.resolve(new Response(new Blob(["zip bytes"], { type: "application/octet-stream" })))
  });

  const blob = await api.previewFile("deck-id", new AbortController().signal, maxDrivePptxPreviewBytes, "deck.pptx");
  assert.equal(await blob.text(), "zip bytes");
  await assert.rejects(
    api.previewFile("deck-id", new AbortController().signal, maxDrivePptxPreviewBytes, "deck.html"),
    /Preview is not available/u
  );
});

void test("Drive preview rejects HTML responses and reports API errors safely", async (): Promise<void> => {
  const htmlResponse = createDriveApi({
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: () => Promise.resolve(new Response("<script>unsafe</script>", { headers: { "content-type": "text/html" } }))
  });
  await assert.rejects(htmlResponse.previewFile("file-id", new AbortController().signal), /Preview is not available/u);

  const missingFile = createDriveApi({
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: () => Promise.resolve(Response.json({ error: { code: "drive_entry_not_found", message: "Drive entry not found." } }, { status: 404 }))
  });
  await assert.rejects(missingFile.previewFile("missing-id", new AbortController().signal), /Drive entry not found/u);
});

void test("CSV previews accept the selected filename as a safe text fallback and enforce the byte limit", async (): Promise<void> => {
  const api = createDriveApi({
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: () => Promise.resolve(new Response("Name,Value\nAlpha,1", { headers: { "content-type": "application/octet-stream" } }))
  });
  const blob = await api.previewFile("csv-id", new AbortController().signal, 100, "ledger.csv");
  assert.equal(await blob.text(), "Name,Value\nAlpha,1");

  let cancelled = false;
  const oversized = createDriveApi({
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: () => Promise.resolve(new Response(new ReadableStream({
      start: () => undefined,
      cancel: () => { cancelled = true; }
    }), {
      headers: { "content-type": "text/csv", "content-length": "50" }
    }))
  });
  await assert.rejects(
    oversized.previewFile("large-csv", new AbortController().signal, 10, "large.csv"),
    /too large to preview/u
  );
  assert.equal(cancelled, true);
});
