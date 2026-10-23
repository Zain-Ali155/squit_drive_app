import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DriveFileTypeIcon, DriveFileVisual } from "../components/drive-file-icon.js";
import { driveFileVisual } from "../utils/drive-file-visual.js";

void test("Drive maps supported document and spreadsheet MIME types and extensions to distinct visuals", (): void => {
  const cases = [
    ["application/pdf", "annual.pdf", "pdf", "PDF"],
    ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "slides.pptx", "pptx", "PPTX"],
    ["application/vnd.ms-powerpoint", "slides.ppt", "ppt", "PPT"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "report.docx", "docx", "DOCX"],
    ["application/msword", "report.doc", "doc", "DOC"],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "budget.xlsx", "xlsx", "XLSX"],
    ["application/vnd.ms-excel", "budget.xls", "xls", "XLS"],
    ["text/csv", "ledger.csv", "csv", "CSV"],
    ["text/plain", "notes.txt", "txt", "TXT"]
  ] as const;

  for (const [mimeType, fileName, type, badge] of cases) {
    const visual = driveFileVisual(mimeType, fileName);
    assert.equal(visual.type, type, fileName);
    assert.equal(visual.badge, badge, fileName);
  }
});

void test("common image extensions share image visuals and only safe preview formats get thumbnails", (): void => {
  for (const extension of ["png", "jpg", "jpeg", "jpe", "jfif", "gif", "apng", "webp", "jp2", "bmp", "avif", "heic", "heif", "tif", "tiff", "ico", "svg"]) {
    assert.equal(driveFileVisual("application/octet-stream", `photo.${extension}`).type, "image", extension);
  }

  assert.equal(driveFileVisual("image/jpeg", "photo.jpeg").supportsThumbnail, true);
  assert.equal(driveFileVisual("application/octet-stream", "photo.webp").supportsThumbnail, true);
  assert.equal(driveFileVisual("image/svg+xml", "photo.svg").supportsThumbnail, false);
  assert.equal(driveFileVisual("application/octet-stream", "photo.bmp").supportsThumbnail, false);
});

void test("unknown file types retain a clear generic visual fallback", (): void => {
  assert.deepEqual(driveFileVisual("application/octet-stream", "backup.unknown"), {
    type: "generic",
    label: "Unknown file type",
    badge: "FILE",
    iconClass: "text-muted-foreground",
    badgeClass: "bg-slate-100 text-slate-700",
    supportsThumbnail: false
  });
  assert.equal(driveFileVisual("application/octet-stream", "backup.constructor").type, "generic");
  assert.equal(driveFileVisual("constructor", "backup.unknown").type, "generic");
  assert.equal(driveFileVisual(undefined, "budget.PDF").type, "pdf");
  assert.equal(driveFileVisual(undefined, "legacy.PPT").type, "ppt");
});

void test("archive extensions share the archive glyph and retain their specific badges", (): void => {
  for (const extension of ["rar", "zip", "7z", "tar", "gz", "tgz", "bz2", "xz", "zst", "zstd"]) {
    const fileName = `backup.${extension}`;
    const visual = driveFileVisual("application/octet-stream", fileName);
    assert.equal(visual.type, "archive", fileName);
    assert.equal(visual.badge, extension.toUpperCase(), fileName);

    const props = { fileName, mimeType: "application/octet-stream" };
    const listingMarkup = renderToStaticMarkup(createElement(DriveFileVisual, props));
    assert.match(listingMarkup, /data-file-type="archive"/u, fileName);
    assert.match(listingMarkup, /text-orange-600/u, fileName);
    assert.doesNotMatch(listingMarkup, /viewBox="0 0 24 28"/u, fileName);
  }
});

void test("listing renders matching type-specific document symbols", (): void => {
  const cases = [
    ["report.final.PDF", "pdf", "text-red-600"],
    ["report.final.DOC", "doc", "text-blue-600"],
    ["report.final.DOCX", "docx", "text-blue-600"],
    ["report.final.PPT", "ppt", "text-orange-600"],
    ["report.final.PPTX", "pptx", "text-orange-600"],
    ["report.final.XLS", "xls", "text-emerald-700"],
    ["report.final.XLSX", "xlsx", "text-emerald-700"],
    ["report.final.CSV", "csv", "text-green-700"],
    ["report.final.TXT", "txt", "text-slate-600"]
  ] as const;

  for (const [fileName, fileType, colorClass] of cases) {
    const fileProps = { fileName, mimeType: "application/octet-stream" };
    const listingMarkup = renderToStaticMarkup(createElement(DriveFileVisual, fileProps));

    assert.match(listingMarkup, new RegExp(`data-file-type="${fileType}"`, "u"), fileName);
    assert.match(listingMarkup, new RegExp(colorClass, "u"), fileName);
    assert.doesNotMatch(listingMarkup, /<text|absolute bottom|bg-(red|blue|orange|emerald|green|slate)-100/u, fileName);
  }
});

void test("unknown files retain the generic icon fallback", (): void => {
  const fileProps = { fileName: "annual.pdf", mimeType: "application/pdf" };
  const listingMarkup = renderToStaticMarkup(createElement(DriveFileVisual, {
    ...fileProps,
    fileId: "pdf-id",
    loadThumbnail: () => Promise.resolve(new Blob())
  }));

  assert.match(listingMarkup, /data-file-type="pdf"/u);
  assert.match(listingMarkup, /text-red-600/u);
  assert.match(listingMarkup, /viewBox="0 0 24 28"/u);
  assert.match(listingMarkup, /stroke="currentColor"/u);
  assert.doesNotMatch(listingMarkup, /bg-red-100|absolute bottom|rounded-sm/u);

  const fallbackMarkup = renderToStaticMarkup(createElement(DriveFileTypeIcon, { fileName: "backup.unknown" }));
  assert.match(fallbackMarkup, /text-muted-foreground/u);
  assert.match(fallbackMarkup, /data-file-type="generic"/u);
  assert.doesNotMatch(fallbackMarkup, /<text/u);
});

void test("Workspace listing renders PNG thumbnails without document overlays for extension edge cases", (): void => {
  const cases = [
    ["photo.png", "image/png"],
    ["photo.PNG", undefined],
    ["photo.final.png", "application/octet-stream"],
    ["photo.final.PNG", "application/pdf"]
  ] as const;

  for (const [fileName, mimeType] of cases) {
    const thumbnailMarkup = renderToStaticMarkup(createElement(DriveFileVisual, {
      fileName,
      fileId: "image-id",
      mimeType,
      thumbnailUrl: "blob:photo"
    }));

    assert.match(thumbnailMarkup, /<img/u, fileName);
    assert.match(thumbnailMarkup, /rounded-md object-cover/u, fileName);
    assert.doesNotMatch(thumbnailMarkup, /<svg|<text|clip-path|>PNG</u, fileName);
  }
});

void test("Workspace listing uses a single image glyph when image thumbnails are unavailable", (): void => {
  for (const [fileName, mimeType] of [
    ["photo.final.PNG", "application/octet-stream"],
    ["photo.jpg", "image/jpeg"],
    ["photo.svg", "image/svg+xml"]
  ] as const) {
    const fallbackMarkup = renderToStaticMarkup(createElement(DriveFileTypeIcon, { fileName, mimeType }));

    assert.match(fallbackMarkup, /<svg/u, fileName);
    assert.match(fallbackMarkup, /<rect/u, fileName);
    assert.doesNotMatch(fallbackMarkup, /<text|viewBox="0 0 24 28"|clip-path/u, fileName);
  }
});
