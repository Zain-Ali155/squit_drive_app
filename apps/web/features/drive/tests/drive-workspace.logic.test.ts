import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanupDrivePreview,
  createDriveListFilterOptions,
  createFolderAndClearName,
  driveStorageUsagePercent,
  formatDriveStorageUsage,
  driveFavoriteActionLabel,
  driveFiltersAreActive,
  driveListParentId,
  emptyDriveFilters,
  folderLocationAtBreadcrumb,
  folderLocationFromBreadcrumbs,
  isDriveFileType,
  isDriveRowActionTarget,
  isDriveSortSelection,
  runDriveAction
} from "../utils/drive-workspace.logic.js";

void test("storage usage formatting uses readable units and bounded rounding", (): void => {
  assert.equal(formatDriveStorageUsage(0), "0 B");
  assert.equal(formatDriveStorageUsage(999), "999 B");
  assert.equal(formatDriveStorageUsage(1_250), "1.3 kB");
  assert.equal(formatDriveStorageUsage(1_250_000), "1.3 MB");
  assert.equal(formatDriveStorageUsage(1_250_000_000), "1.25 GB");
});

void test("storage quota meter percentage stays between zero and one hundred", (): void => {
  assert.equal(driveStorageUsagePercent(100_000_000, 1_000_000_000), 10);
  assert.equal(driveStorageUsagePercent(1_200_000_000, 1_000_000_000), 100);
  assert.equal(driveStorageUsagePercent(-5, 1_000_000_000), 0);
  assert.equal(driveStorageUsagePercent(5, 0), 0);
});

void test("opening a nested folder from search uses its full ancestry and breadcrumb navigation selects its parent", (): void => {
  const searchResultPath = [
    { id: "root-id", name: "My Drive" },
    { id: "projects-id", name: "Projects" },
    { id: "research-id", name: "Research" }
  ];
  const opened = folderLocationFromBreadcrumbs(searchResultPath);

  assert.deepEqual(opened, { breadcrumbs: searchResultPath, parentId: "research-id" });
  assert.deepEqual(folderLocationAtBreadcrumb(searchResultPath, 1), {
    breadcrumbs: searchResultPath.slice(0, 2), parentId: "projects-id"
  });
  assert.deepEqual(folderLocationAtBreadcrumb(searchResultPath, 0), {
    breadcrumbs: searchResultPath.slice(0, 1), parentId: "root-id"
  });
});

void test("root listings omit a redundant explicit parent while nested listings retain their parent", (): void => {
  assert.equal(driveListParentId(undefined, undefined), undefined);
  assert.equal(driveListParentId("root-id", "root-id"), undefined);
  assert.equal(driveListParentId("nested-id", "root-id"), "nested-id");
});

void test("folder creation preserves the name when creation fails and clears it after success", async (): Promise<void> => {
  let folderName = "Quarterly reports";
  const clearName = (): void => { folderName = ""; };

  await assert.rejects(createFolderAndClearName(() => Promise.reject(new Error("Name already exists.")), clearName), /Name already exists/u);
  assert.equal(folderName, "Quarterly reports");

  await createFolderAndClearName(() => Promise.resolve({ id: "created-folder" }), clearName);
  assert.equal(folderName, "");
});

void test("Drive actions refresh storage only after uploads and file deletions", async (): Promise<void> => {
  const mutations = [
    { mutation: "upload", expectedStorageRefresh: true },
    { mutation: "file-delete", expectedStorageRefresh: true },
    { mutation: "create-folder", expectedStorageRefresh: false },
    { mutation: "folder-delete", expectedStorageRefresh: false },
    { mutation: "trash", expectedStorageRefresh: false },
    { mutation: "restore", expectedStorageRefresh: false },
    { mutation: "permanent-delete", expectedStorageRefresh: true },
    { mutation: "rename", expectedStorageRefresh: false },
    { mutation: "move", expectedStorageRefresh: false },
    { mutation: "favorite", expectedStorageRefresh: false }
  ] as const;

  for (const { mutation, expectedStorageRefresh } of mutations) {
    const calls: string[] = [];
    await runDriveAction(
      async () => { calls.push("action"); },
      async () => { calls.push("reload"); },
      async () => { calls.push("storage"); },
      mutation
    );

    assert.deepEqual(calls, expectedStorageRefresh
      ? ["action", "reload", "storage"]
      : ["action", "reload"]);
  }
});

void test("failed Drive actions do not reload entries or refresh storage", async (): Promise<void> => {
  const calls: string[] = [];

  await assert.rejects(runDriveAction(
    () => Promise.reject(new Error("Upload failed.")),
    async () => { calls.push("reload"); },
    async () => { calls.push("storage"); },
    "upload"
  ), /Upload failed/u);

  assert.deepEqual(calls, []);
});

void test("row click handling ignores nested buttons and menu actions but opens on non-action row space", (): void => {
  const actionTarget = (matchedAction: boolean) => ({
    closest: (selector: string): unknown => {
      assert.match(selector, /button/u);
      assert.match(selector, /menuitem/u);
      return matchedAction ? {} : null;
    }
  });

  assert.equal(isDriveRowActionTarget(actionTarget(true)), true);
  assert.equal(isDriveRowActionTarget(actionTarget(false)), false);
  assert.equal(isDriveRowActionTarget(null), false);
});

void test("closing or changing a preview aborts its request and revokes its temporary URL", (): void => {
  let aborted = false;
  const revoked: string[] = [];

  cleanupDrivePreview(() => { aborted = true; }, "blob:preview-url", (url) => revoked.push(url));

  assert.equal(aborted, true);
  assert.deepEqual(revoked, ["blob:preview-url"]);
});

void test("Drive filter controls map to query fields, identify active filters, and reset to the default state", (): void => {
  assert.deepEqual(createDriveListFilterOptions(emptyDriveFilters), {});
  assert.equal(driveFiltersAreActive(emptyDriveFilters), false);

  const filters = {
    ...emptyDriveFilters,
    fileType: "pdf" as const,
    sort: "updatedAt-desc" as const
  };
  assert.deepEqual(createDriveListFilterOptions(filters), {
    fileType: "pdf",
    sortBy: "updatedAt",
    sortOrder: "desc"
  });
  assert.equal(driveFiltersAreActive(filters), true);
  assert.deepEqual(emptyDriveFilters, {
    fileType: "",
    sort: "default"
  });
  assert.equal(driveFiltersAreActive({ fileType: "", sort: "default" }), false);
  assert.equal(isDriveFileType("pdf"), true);
  assert.equal(isDriveFileType("unknown"), false);
  assert.equal(isDriveSortSelection("sizeBytes-desc"), true);
  assert.equal(isDriveSortSelection("invalid"), false);
  assert.equal(driveFavoriteActionLabel({ name: "plan.pdf", isStarred: false }), "Add plan.pdf to favorites");
  assert.equal(driveFavoriteActionLabel({ name: "plan.pdf", isStarred: true }), "Remove plan.pdf from favorites");
});
