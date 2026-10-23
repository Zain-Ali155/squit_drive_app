import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DriveImagePreview } from "../components/drive-image-preview.js";
import { DrivePreviewSurface, DriveUnsupportedPreview } from "../components/drive-preview-shell.js";

void test("shared preview shell renders a compact accessible dark toolbar with close and download", (): void => {
  const markup = renderToStaticMarkup(createElement(
    DrivePreviewSurface,
    {
      fileName: "quarterly-report.pdf",
      mimeType: "application/pdf",
      sizeLabel: "PDF document · 2.4 MB",
      downloading: false,
      onDownload: () => undefined,
      onClose: () => undefined
    },
    createElement("p", null, "Preview content")
  ));

  assert.match(markup, /aria-label="File preview: quarterly-report\.pdf"/u);
  assert.match(markup, /bg-\[#202124\]/u);
  assert.match(markup, /aria-label="Close preview"/u);
  assert.match(markup, /aria-label="Download file"/u);
  assert.match(markup, /size-8/u);
  assert.match(markup, /data-file-type="pdf"/u);
  assert.doesNotMatch(markup, /File menu|View menu|Hide file details|Show file details/u);
  assert.match(markup, /quarterly-report\.pdf/u);
  assert.match(markup, /Preview content/u);
});

void test("unsupported previews show the generic download-only fallback and action", (): void => {
  const markup = renderToStaticMarkup(createElement(DriveUnsupportedPreview, {
    fileName: "backup.rar",
    downloading: false,
    onDownload: () => undefined
  }));

  assert.match(markup, /Preview not available/u);
  assert.match(markup, /backup\.rar can’t be previewed/u);
  assert.match(markup, /Download file/u);
  assert.match(markup, /<svg/u);
});

void test("preview toolbar reuses the listing PNG override, thumbnail and fallback icon", (): void => {
  const renderPreview = (mimeType?: string, thumbnailUrl?: string): string => renderToStaticMarkup(createElement(
    DrivePreviewSurface,
    {
      fileName: "photo.final.PNG",
      mimeType,
      thumbnailUrl,
      sizeLabel: "Image · 2 MB",
      downloading: false,
      onDownload: () => undefined,
      onClose: () => undefined
    }
  ));

  const fallbackMarkup = renderPreview("application/pdf");
  assert.match(fallbackMarkup, /<rect/u);
  assert.match(fallbackMarkup, /text-violet-600/u);
  assert.match(fallbackMarkup, /aria-hidden="true"/u);
  assert.match(fallbackMarkup, /size-8/u);
  assert.doesNotMatch(fallbackMarkup, /<text|>PNG</u);

  const thumbnailMarkup = renderPreview("application/octet-stream", "blob:png-thumbnail");
  assert.match(thumbnailMarkup, /<img/u);
  assert.match(thumbnailMarkup, /rounded-md object-cover/u);
  assert.match(thumbnailMarkup, /src="blob:png-thumbnail"/u);
  assert.doesNotMatch(thumbnailMarkup, /<text|>PNG</u);
});

void test("image preview centers a contained image in a neutral, keyboard-scrollable gallery", (): void => {
  const markup = renderToStaticMarkup(createElement(DriveImagePreview, {
    fileName: "photo.final.PNG",
    src: "blob:image-preview",
    onError: () => undefined
  }));

  assert.match(markup, /aria-label="Image preview: photo\.final\.PNG"/u);
  assert.match(markup, /role="region"/u);
  assert.match(markup, /tabindex="0"/u);
  assert.match(markup, /bg-\[#e8eaed\]/u);
  assert.match(markup, /place-items-center/u);
  assert.match(markup, /object-contain/u);
  assert.match(markup, /alt="photo\.final\.PNG"/u);
  assert.match(markup, /src="blob:image-preview"/u);
});
