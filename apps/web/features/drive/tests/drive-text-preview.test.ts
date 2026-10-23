import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DriveTextPreview } from "../components/drive-text-preview.js";

void test("plain text preview preserves text safely in a named keyboard-scrollable region", (): void => {
  const markup = renderToStaticMarkup(createElement(DriveTextPreview, {
    fileName: "notes.txt",
    text: "<script>alert(1)</script>\nA long line"
  }));

  assert.match(markup, /aria-label="Text preview: notes\.txt"/u);
  assert.match(markup, /role="region"/u);
  assert.match(markup, /tabindex="0"/u);
  assert.match(markup, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
  assert.doesNotMatch(markup, /<script>/u);
});
