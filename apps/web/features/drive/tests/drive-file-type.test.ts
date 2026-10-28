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
    badge: "UNKN",
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
    assert.match(listingMarkup, /#d94b45/u, fileName);
  }
});

void test("listing renders familiar app marks on document-style file icons", (): void => {
  const cases = [
    ["report.final.PDF", "pdf", "PDF", "bg-red-600"],
    ["report.final.DOC", "doc", "W", "bg-blue-700"],
    ["report.final.DOCX", "docx", "W", "bg-blue-700"],
    ["report.final.PPT", "ppt", "P", "bg-orange-600"],
    ["report.final.PPTX", "pptx", "P", "bg-orange-600"],
    ["report.final.XLS", "xls", "X", "bg-green-700"],
    ["report.final.XLSX", "xlsx", "X", "bg-green-700"],
    ["report.final.CSV", "csv", "X", "bg-green-700"],
    ["report.final.TXT", "txt", "T", "bg-slate-600"]
  ] as const;

  for (const [fileName, fileType, mark, colorClass] of cases) {
    const fileProps = { fileName, mimeType: "application/octet-stream" };
    const listingMarkup = renderToStaticMarkup(createElement(DriveFileVisual, fileProps));

    assert.match(listingMarkup, new RegExp(`data-file-type="${fileType}"`, "u"), fileName);
    assert.match(listingMarkup, new RegExp(colorClass, "u"), fileName);
    assert.match(listingMarkup, new RegExp(`data-file-mark="${fileType}"`, "u"), fileName);
    assert.match(listingMarkup, new RegExp(`>${mark}<\\/span>`, "u"), fileName);
    assert.doesNotMatch(listingMarkup, /<text/u, fileName);
  }
});

void test("PDF files retain their document icon and show a type badge", (): void => {
  const fileProps = { fileName: "annual.pdf", mimeType: "application/pdf" };
  const listingMarkup = renderToStaticMarkup(createElement(DriveFileVisual, {
    ...fileProps,
    fileId: "pdf-id",
    loadThumbnail: () => Promise.resolve(new Blob())
  }));

  assert.match(listingMarkup, /data-file-type="pdf"/u);
  assert.match(listingMarkup, /bg-red-600/u);
  assert.match(listingMarkup, /viewBox="0 0 32 36"/u);
  assert.match(listingMarkup, /stroke="#94a3b8"/u);
  assert.match(listingMarkup, /data-file-mark="pdf">PDF<\/span>/u);

  const fallbackMarkup = renderToStaticMarkup(createElement(DriveFileTypeIcon, { fileName: "backup.unknown" }));
  assert.match(fallbackMarkup, /bg-slate-500/u);
  assert.match(fallbackMarkup, /data-file-type="generic"/u);
  assert.match(fallbackMarkup, />UNK<\/span>/u);
  assert.doesNotMatch(fallbackMarkup, /<text/u);
});

void test("all accepted audio, video, code, and OpenDocument extensions get recognizable icons and labels", (): void => {
  const cases = [
    ["application/octet-stream", "track.mp3", "audio", "♪", "bg-purple-700"],
    ["audio/wav", "recording.wav", "audio", "♪", "bg-purple-700"],
    ["application/octet-stream", "clip.mkv", "video", "▶", "bg-rose-600"],
    ["application/octet-stream", "source.tsx", "code", "</>", "bg-cyan-700"],
    ["text/plain", "config.yaml", "code", "</>", "bg-cyan-700"],
    ["application/vnd.oasis.opendocument.text", "letter.odt", "odt", "T", "bg-slate-600"],
    ["application/vnd.oasis.opendocument.spreadsheet", "ledger.ods", "ods", "X", "bg-green-700"],
    ["application/vnd.oasis.opendocument.presentation", "briefing.odp", "odp", "P", "bg-orange-600"]
  ] as const;

  for (const [mimeType, fileName, type, mark, color] of cases) {
    const visual = driveFileVisual(mimeType, fileName);
    assert.equal(visual.type, type, fileName);
    const markup = renderToStaticMarkup(createElement(DriveFileVisual, { mimeType, fileName }));
    assert.match(markup, new RegExp(`data-file-type="${type}"`, "u"), fileName);
    assert.match(markup, new RegExp(`data-file-mark="${type}"`, "u"), fileName);
    const renderedMark = mark === "</>" ? "&lt;/&gt;" : mark;
    assert.match(markup, new RegExp(`>${renderedMark}<\\/span>`, "u"), fileName);
    assert.match(markup, new RegExp(color, "u"), fileName);
  }
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
    assert.match(fallbackMarkup, /data-file-mark="image">IMG<\/span>/u, fileName);
    assert.doesNotMatch(fallbackMarkup, /<text|viewBox="0 0 24 28"|clip-path/u, fileName);
  }
});
