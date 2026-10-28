import test from "node:test";
import assert from "node:assert/strict";
import {
  driveEntryOpenAction,
  drivePreviewKind,
  drivePreviewTypeLabel,
  hasPdfFileSignature,
  maxDriveImagePreviewBytes,
  maxDrivePreviewBytes,
  maxDrivePptxPreviewBytes,
  normalizeDriveMimeType
} from "../utils/drive-preview.logic.js";

void test("Drive preview policy allows passive formats and excludes active or unknown content", (): void => {
  assert.equal(drivePreviewKind("image/png"), "image");
  assert.equal(drivePreviewKind("image/jpeg; charset=binary"), "image");
  assert.equal(drivePreviewKind("application/pdf"), "pdf");
  assert.equal(drivePreviewKind("application/vnd.openxmlformats-officedocument.presentationml.presentation"), "pptx");
  assert.equal(drivePreviewKind("application/octet-stream", "slides.pptx"), "pptx");
  assert.equal(drivePreviewKind("application/zip", "slides.pptx"), "pptx");
  assert.equal(drivePreviewKind("text/plain; charset=utf-8"), "text");
  assert.equal(drivePreviewKind("text/csv; charset=utf-8"), "csv");
  assert.equal(drivePreviewKind("application/octet-stream", "ledger.CSV"), "csv");
  assert.equal(drivePreviewKind("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), "xlsx");
  assert.equal(drivePreviewKind("application/octet-stream", "budget.xlsx"), "xlsx");
  assert.equal(drivePreviewKind("application/vnd.ms-excel", "budget.xls"), "xlsx");
  assert.equal(normalizeDriveMimeType("image/svg+xml"), undefined);
  assert.equal(drivePreviewKind("text/html"), undefined);
  assert.equal(drivePreviewKind("text/html", "unsafe.pptx"), undefined);
  assert.equal(drivePreviewKind("application/vnd.ms-powerpoint", "legacy.ppt"), undefined);
  assert.equal(drivePreviewKind("application/octet-stream"), undefined);
});

void test("opening an entry selects folder navigation, supported preview, or an unsupported-file message", (): void => {
  assert.equal(driveEntryOpenAction({ kind: "folder" }), "folder");
  for (const mimeType of [
    "text/plain",
    "text/csv",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp"
  ]) {
    assert.equal(driveEntryOpenAction({ kind: "file", mimeType }), "preview", `${mimeType} should preview`);
  }
  assert.equal(driveEntryOpenAction({ kind: "file", mimeType: "application/octet-stream", name: "ledger.csv" }), "preview");
  assert.equal(driveEntryOpenAction({ kind: "file", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "preview");
  assert.equal(driveEntryOpenAction({ kind: "file", mimeType: "application/octet-stream", name: "deck.pptx" }), "preview");
  assert.equal(driveEntryOpenAction({ kind: "file", mimeType: "application/msword" }), "unsupported");
  assert.equal(driveEntryOpenAction({ kind: "file", mimeType: "application/vnd.ms-powerpoint", name: "deck.ppt" }), "unsupported");
  assert.equal(driveEntryOpenAction({ kind: "file", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", name: "budget.xlsx" }), "preview");
  assert.equal(driveEntryOpenAction({ kind: "file", mimeType: "application/octet-stream", name: "budget.xlsx" }), "preview");
  assert.equal(driveEntryOpenAction({ kind: "file", mimeType: "application/vnd.rar", name: "backup.rar" }), "unsupported");
  assert.equal(driveEntryOpenAction({ kind: "file", mimeType: "image/svg+xml" }), "unsupported");
});

void test("PDF preview verifies the file signature", async (): Promise<void> => {
  assert.equal(await hasPdfFileSignature(new Blob(["%PDF-1.7"])), true);
  assert.equal(await hasPdfFileSignature(new Blob(["not a PDF"])), false);
});

void test("preview labels prefer the selected preview kind and provide safe visual fallbacks", (): void => {
  assert.equal(drivePreviewTypeLabel("pdf"), "PDF document");
  assert.equal(drivePreviewTypeLabel("text"), "Plain text");
  assert.equal(drivePreviewTypeLabel(undefined, "application/vnd.ms-excel"), "Excel spreadsheet");
  assert.equal(drivePreviewTypeLabel(undefined, "application/octet-stream", "budget.xlsx"), "Excel spreadsheet");
  assert.equal(drivePreviewTypeLabel(undefined), "Unknown file type");
  assert.equal(drivePreviewTypeLabel(undefined, "application/octet-stream", "backup.rar"), "Archive file");
  assert.equal(drivePreviewTypeLabel(undefined, "application/custom"), "application/custom");
  assert.equal(drivePreviewTypeLabel(undefined, "application/octet-stream", "backup.xyz"), "XYZ file");
});

void test("preview byte limits preserve the existing defaults for full previews, PPTX and images", (): void => {
  assert.equal(maxDrivePreviewBytes, 50_000_000);
  assert.equal(maxDrivePptxPreviewBytes, 50_000_000);
  assert.equal(maxDriveImagePreviewBytes, 15_000_000);
});
