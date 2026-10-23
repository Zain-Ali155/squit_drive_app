import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseZip, RECOMMENDED_ZIP_LIMITS } from "@aiden0z/pptx-renderer/browser";
import { cleanupDrivePptxViewer, createDrivePptxViewerOptions, DrivePptxPreview, getDrivePptxContentWidth, handleDrivePptxLoadError, validateDrivePptxPackage } from "../components/drive-pptx-preview.js";

type ZipEntry = Readonly<{ name: string; bytes: Uint8Array }>;

const createStoredZip = (entries: readonly ZipEntry[]): ArrayBuffer => {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const local = new Uint8Array(30 + name.length + entry.bytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(18, entry.bytes.length, true);
    localView.setUint16(20, entry.bytes.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(entry.bytes, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(20, entry.bytes.length, true);
    centralView.setUint32(24, entry.bytes.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralParts.push(central);
    localOffset += local.length;
  }

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const archive = new Uint8Array(localOffset + centralSize + 22);
  let cursor = 0;
  for (const part of localParts) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  const centralOffset = cursor;
  for (const part of centralParts) {
    archive.set(part, cursor);
    cursor += part.length;
  }

  const end = new DataView(archive.buffer);
  end.setUint32(cursor, 0x06054b50, true);
  end.setUint16(cursor + 8, entries.length, true);
  end.setUint16(cursor + 10, entries.length, true);
  end.setUint32(cursor + 12, centralSize, true);
  end.setUint32(cursor + 16, centralOffset, true);
  return archive.buffer;
};

void test("PPTX viewer options block external media, bound ZIP parsing, and disable the incompatible PDF.js fallback", (): void => {
  const onSlideChange = (): void => undefined;
  const onSlideError = (): void => undefined;
  const options = createDrivePptxViewerOptions(RECOMMENDED_ZIP_LIMITS, 640, onSlideChange, onSlideError);

  assert.equal(options.externalMedia, "block");
  assert.equal(options.zipLimits, RECOMMENDED_ZIP_LIMITS);
  assert.equal(options.pdfjs, false);
  assert.equal(options.width, 640);
  assert.equal(options.lazyMedia, true);
  assert.equal(options.lazySlides, true);
  assert.equal(options.onSlideChange, onSlideChange);
  assert.equal(options.onSlideError, onSlideError);
});

void test("PPTX preview constrains its host and reserves scrollbar width before measuring slides", (): void => {
  const markup = renderToStaticMarkup(createElement(DrivePptxPreview, {
    blob: new Blob(),
    fileName: "layout.pptx"
  }));

  assert.match(markup, /class="flex h-full min-h-\[320px\] min-w-0 w-full max-w-full flex-col"/u);
  assert.match(markup, /w-full min-w-0 max-w-full flex-1 overflow-auto \[scrollbar-gutter:stable\]/u);
  assert.match(markup, /aria-label="PowerPoint slides"[^>]*role="region" tabindex="0"/u);
});

void test("PPTX fit width excludes host padding and cannot become zero", (): void => {
  assert.equal(getDrivePptxContentWidth(524, 12, 12), 500);
  assert.equal(getDrivePptxContentWidth(10, 12, 12), 1);
});

void test("closing the PPTX preview aborts pending work and destroys the viewer", (): void => {
  let abortCount = 0;
  let destroyCount = 0;
  cleanupDrivePptxViewer(
    () => { abortCount += 1; },
    { destroy: () => { destroyCount += 1; } }
  );

  assert.equal(abortCount, 1);
  assert.equal(destroyCount, 1);
  cleanupDrivePptxViewer(
    () => { abortCount += 1; },
    undefined
  );
  assert.equal(abortCount, 2);
});

void test("PPTX rendering errors are reported when viewer cleanup aborts the controller", (): void => {
  let aborted = false;
  let errorDisplayed = false;
  handleDrivePptxLoadError(
    true,
    () => aborted,
    () => { aborted = true; },
    () => { errorDisplayed = true; }
  );

  assert.equal(aborted, true);
  assert.equal(errorDisplayed, true);
});

void test("PPTX cancellation does not display a rendering error", (): void => {
  let aborted = true;
  let errorDisplayed = false;
  handleDrivePptxLoadError(
    true,
    () => aborted,
    () => { aborted = true; },
    () => { errorDisplayed = true; }
  );

  assert.equal(aborted, true);
  assert.equal(errorDisplayed, false);
});

void test("PPTX preview rejects an archive without its required presentation parts", (): void => {
  assert.throws(
    () => validateDrivePptxPackage({
      contentTypes: "",
      presentation: "",
      presentationRels: "",
      slides: new Map()
    }),
    /package is incomplete/iu
  );
});

void test("PPTX preview accepts the required presentation package parts", (): void => {
  assert.doesNotThrow(() => validateDrivePptxPackage({
    contentTypes: "<Types/>",
    presentation: "<p:presentation/>",
    presentationRels: "<Relationships/>",
    slides: new Map([["ppt/slides/slide1.xml", "<p:sld/>"]])
  }));
});

void test("PPTX ZIP parser rejects malformed archives", async (): Promise<void> => {
  await assert.rejects(
    parseZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer, RECOMMENDED_ZIP_LIMITS),
    /zip|data|end/iu
  );
});

void test("PPTX ZIP parser rejects an entry exceeding its expanded-size limit", async (): Promise<void> => {
  const archive = createStoredZip([{ name: "ppt/slides/slide1.xml", bytes: new Uint8Array(128) }]);

  await assert.rejects(
    parseZip(archive, { maxEntryUncompressedBytes: 64 }),
    /maxEntryUncompressedBytes/iu
  );
});

void test("PPTX ZIP parser rejects aggregate expanded data beyond its limit", async (): Promise<void> => {
  const archive = createStoredZip([
    { name: "ppt/slides/slide1.xml", bytes: new Uint8Array(60) },
    { name: "ppt/slides/slide2.xml", bytes: new Uint8Array(60) }
  ]);

  await assert.rejects(
    parseZip(archive, { maxEntryUncompressedBytes: 100, maxTotalUncompressedBytes: 100 }),
    /maxTotalUncompressedBytes/iu
  );
});
