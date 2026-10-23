import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { adjustDrivePdfZoom, DrivePdfPreview, getDrivePdfFitScale } from "../components/drive-pdf.js";

void test("PDF zoom controls stay within the supported range", (): void => {
  assert.equal(adjustDrivePdfZoom(1, 1), 1.25);
  assert.equal(adjustDrivePdfZoom(0.75, -1), 0.75);
  assert.equal(adjustDrivePdfZoom(2, 1), 2);
});

void test("PDF page viewport is named and keyboard-scrollable", (): void => {
  const markup = renderToStaticMarkup(createElement(DrivePdfPreview, {
    blob: new Blob(),
    fileName: "report.pdf"
  }));

  assert.match(markup, /aria-label="PDF page preview: report\.pdf"/u);
  assert.match(markup, /role="region"/u);
  assert.match(markup, /tabindex="0"/u);
  assert.match(markup, /items-start justify-center overflow-auto/u);
  assert.match(markup, /mx-auto h-auto max-w-none shrink-0 bg-white shadow-lg/u);
});

void test("PDF fit scale contains pages at the baseline and tolerates unavailable dimensions", (): void => {
  assert.equal(getDrivePdfFitScale(1_200, 600), 0.5);
  assert.equal(getDrivePdfFitScale(600, 1_200), 1);
  assert.equal(getDrivePdfFitScale(0, 600), 1);
  assert.equal(getDrivePdfFitScale(600, Number.NaN), 1);
});
