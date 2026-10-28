import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  convertDocxBlob,
  getSafeDocxTextAlignment,
  mammothAlignmentStyleMap,
  maxDocxArchiveEntries,
  maxDocxEntryBytes,
  maxDocxExpandedBytes,
  maxDocxInputBytes,
  sanitizeDocxNodes,
  transformDocxAlignment,
  validateDocxArchive
} from "../utils/drive.docx.js";
import { SafeDocxPreview } from "../components/drive.docx-preview.js";

const formattedDocxFixture = "UEsDBBQAAAAIAAAAAADwSsJ/+gAAACwCAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbK2Ry07DMBBFf8XytkpcWCCE4nTBYwksygdY9iSxsMeWZxqSv0dpSheowIb1vXPOlabZTTGIEQr5hFpe1VspAG1yHnst3/ZP1a0UxAadCQlByxlI7tpmP2cgMcWApOXAnO+UIjtANFSnDDjF0KUSDVOdSq+yse+mB3W93d4om5ABueKFIdvmATpzCCweJwZcdxQIJMX9WlxcWpqcg7eGfUI1ovtmqU6GukA4dmjwmTZTDFJdNCzJz4LT3csIpXgH4tUUfjYRtFQfqTjlkj1EQK5/x1zYmbrOWzjfL7RckgUij30M9TmJxuPmrx3EcwD6/xUr90uvjt9uPwFQSwMEFAAAAAgAAAAAAJv9N+qxAAAAKQEAAAsAAABfcmVscy8ucmVsc43PwWrDMBAE0F8Re6/l5BBCsOxLCORa3A8Q0toWlXaFVk2dv88lhzj00OswvGG6YU1R3bBIYDKwa1pQSI59oNnA13j5OIKSasnbyIQG7igw9N0nRlsDkywhi1pTJDGw1JpPWotbMFlpOCOtKU5ckq3ScJl1tu7bzqj3bXvQ5dWAramu3kC5+h2o8Z7xPzZPU3B4ZveTkOofE28NUKMtM1YDv1y89s+4WVME3Xd6c7F/AFBLAwQUAAAACAAAAAAAL8RCM90AAABfAQAADwAAAHdvcmQvc3R5bGVzLnhtbEWO3UrEMBCFXyXMvU27gkjZ7N4tCqJe6APMtmNbSCYxE/vj00v/1qs58H1nOMfz6KzqKUrn2UCR5aCIK1933Bj4/LjcPYKShFyj9UwGJhI4n45DKWmyJGp0lqUcDLQphVJrqVpyKJkPxKOzXz46TJL52OjBxzpEX5FIx42z+pDnD9phx3B7qIYyTYEMBIzYRAwtqA091waeCOdlxVJgdLPfozXQrkAVoGd0RaH6jXf6Oq+wK/q+LJOWHN7jfPxPsh3TS2/3Qj67+ibE9VyXkvzu1v1h0xaut53/SU5/UEsDBBQAAAAIAAAAAADOYz29WQEAAEUDAAARAAAAd29yZC9kb2N1bWVudC54bWyNU9tOwzAM/ZUo7yztGGiq1u5hEvAI2/iANDFdUZpUjreufD3qFYY64MV2nOPjS5zV+lwYdgL0ubMxD2cBZ2CV07nNYv66f7hZcuZJWi2NsxDzGjxfJ6sq0k4dC7DEzoWxPqpifiAqIyG8OkAh/cyVYM+FeXNYSPIzh5moHOoSnQLvc5sVRsyD4F4UMre8oUydrhtdtuIZW7Wj2gCropM0MX8C2VQWcpGsxIhpBSUvR4kEaGq2hdIhNQhqcdihf3K/q4FXgSXACVbs7LS76U+UbFo8aJY6o1kpUWYoy8NkRkpNr/ro1Fz0tJepgUfMdZ/+O7BxN2aGud44w6pmzrdBEDTYK25xEUkdlRp7/7UtSZA5rCf6EAPJP6n2jqS5ziPGyibro2QLHiSqqZFeLYWSxfzPlGJ8EQ+K+iXLdh/dEMP5fBFwVkWHmId3y8Uw0QErhi0VXz8g+QRQSwECFAAUAAAACAAAAAAA8ErCf/oAAAAsAgAAEwAAAAAAAAAAAAAAAAAAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUABQAAAAIAAAAAACb/TfqsQAAACkBAAALAAAAAAAAAAAAAAAAACsBAABfcmVscy8ucmVsc1BLAQIUABQAAAAIAAAAAAAvxEIz3QAAAF8BAAAPAAAAAAAAAAAAAAAAAAUCAAB3b3JkL3N0eWxlcy54bWxQSwECFAAUAAAACAAAAAAAzmM9vVkBAABFAwAAEQAAAAAAAAAAAAAAAAAPAwAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAAAAAD2AAAAlwQAAAAA";

type TestMarkupNode = Readonly<{
  nodeType: number;
  textContent: string | null;
  tagName?: string;
  childNodes?: readonly TestMarkupNode[];
  getAttribute?: (name: string) => string | null;
}>;

const textNode = (text: string): TestMarkupNode => ({ nodeType: 3, textContent: text });
const elementNode = (
  tagName: string,
  attributes: Readonly<Record<string, string>> = {},
  children: readonly TestMarkupNode[] = []
): TestMarkupNode => ({
  nodeType: 1,
  textContent: null,
  tagName,
  childNodes: children,
  getAttribute: (name) => attributes[name] ?? null
});

const formattedDocxBytes = (): Uint8Array => {
  const bytes = Uint8Array.from(Buffer.from(formattedDocxFixture, "base64"));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOfCentralDirectory = bytes.byteLength - 22;
  view.setUint16(endOfCentralDirectory + 8, 4, true);
  view.setUint16(endOfCentralDirectory + 10, 4, true);
  return bytes;
};

const findCentralEntries = (bytes: Uint8Array): number[] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.byteLength - 22;
  const count = view.getUint16(eocd + 10, true);
  const offsets: number[] = [];
  let cursor = view.getUint32(eocd + 16, true);
  for (let index = 0; index < count; index += 1) {
    assert.equal(view.getUint32(cursor, true), 0x02014b50);
    offsets.push(cursor);
    cursor += 46 + view.getUint16(cursor + 28, true) + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
  }
  return offsets;
};

void test("malformed DOCX content produces a safe preview error with a download fallback", async (): Promise<void> => {
  await assert.rejects(
    convertDocxBlob(new Blob(["not a Word document"])),
    /DOCX can’t be previewed.*Download it to open in Word/u
  );
  await assert.rejects(
    convertDocxBlob(new Blob(["PK\u0003\u0004truncated archive"])),
    /DOCX can’t be previewed.*Download it to open in Word/u
  );
});

void test("oversized DOCX inputs fail before archive parsing", async (): Promise<void> => {
  await assert.rejects(
    convertDocxBlob(new Blob([new Uint8Array(maxDocxInputBytes + 1)])),
    /DOCX can’t be previewed.*Download it to open in Word/u
  );
});

void test("DOCX ZIP preflight rejects oversized individual and aggregate expansion", (): void => {
  const validArchive = formattedDocxBytes();
  const entries = findCentralEntries(validArchive);
  assert.ok(entries.length > 0);

  const oversizedEntry = validArchive.slice();
  new DataView(oversizedEntry.buffer).setUint32(entries[0]! + 24, maxDocxEntryBytes + 1, true);
  assert.throws(() => validateDocxArchive(oversizedEntry), /archive entry exceeds preview limit/u);

  const oversizedArchive = validArchive.slice();
  const view = new DataView(oversizedArchive.buffer);
  for (const offset of entries) view.setUint32(offset + 24, 9_000_000, true);
  assert.throws(() => validateDocxArchive(oversizedArchive), /archive exceeds preview limit/u);
  assert.equal(maxDocxExpandedBytes, 32_000_000);
  assert.equal(maxDocxArchiveEntries, 1_024);
});

void test("DOCX ZIP preflight accepts the valid formatted document archive", (): void => {
  validateDocxArchive(formattedDocxBytes());
});

void test("valid formatted DOCX conversion retains headings, emphasis, alignment, and tables", async (): Promise<void> => {
  const bytes = formattedDocxBytes();
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) }, {
    externalFileAccess: false,
    styleMap: [...mammothAlignmentStyleMap],
    transformDocument: transformDocxAlignment
  });

  assert.match(result.value, /<h1>Quarterly Report<\/h1>/u);
  assert.match(result.value, /<strong>Centered bold paragraph<\/strong>/u);
  assert.match(result.value, /<table>/u);
  assert.match(result.value, /<td><p>Research<\/p><\/td>/u);
  assert.match(result.value, /class="docx-align-center"/u);
});

void test("DOCX rendering drops malicious markup, scripts, handlers, unsafe URLs, and unsafe styles", (): void => {
  const nodes = sanitizeDocxNodes([
    elementNode("script", {}, [textNode("alert(1)")]),
    elementNode("iframe", { src: "https://attacker.invalid/" }, [textNode("embedded")]),
    elementNode("a", { href: "javascript:alert(1)", onclick: "alert(1)" }, [textNode("link text")]),
    elementNode("img", { src: "javascript:alert(1)", onerror: "alert(1)" }),
    elementNode("p", {
      onclick: "alert(1)",
      style: "text-align: center; background-image: url(javascript:alert(1)); position: fixed",
      id: "attacker-controlled",
      class: "docx-align-center user-controlled"
    }, [textNode("Safe paragraph")]),
    elementNode("img", {
      src: "data:image/png;base64,aGVsbG8=",
      alt: "Safe image",
      onload: "alert(1)",
      style: "position: fixed"
    }),
    elementNode("h1", {}, [textNode("Legitimate heading")]),
    elementNode("table", {}, [
      elementNode("tr", {}, [elementNode("td", {}, [elementNode("p", {}, [textNode("Table content")])])])
    ])
  ]);
  const markup = renderToStaticMarkup(createElement(SafeDocxPreview, { nodes }));

  assert.match(markup, /<p[^>]*style="text-align:center"[^>]*>Safe paragraph<\/p>/u);
  assert.match(markup, /<h1[^>]*>Legitimate heading<\/h1>/u);
  assert.match(markup, /<table/u);
  assert.match(markup, /Table content/u);
  assert.match(markup, /<img[^>]*src="data:image\/png;base64,aGVsbG8="[^>]*alt="Safe image"/u);
  assert.match(markup, /aria-label="Word document preview"/u);
  assert.match(markup, /role="region"/u);
  assert.match(markup, /tabindex="0"/u);
  assert.match(markup, /bg-\[#e8eaed\]/u);
  assert.match(markup, /my-1 min-w-0 whitespace-pre-wrap break-words leading-6/u);
  assert.match(markup, /my-1 inline-block h-auto max-h-\[50vh\] max-w-full object-contain align-middle/u);
  assert.doesNotMatch(markup, /mx-auto my-5/u);
  assert.doesNotMatch(markup, /<script|<iframe|javascript:|onerror|onload|onclick|background-image|position:fixed|attacker-controlled|user-controlled/iu);
  assert.match(markup, /link text/u);
});

void test("DOCX alignment preserves only the safe paragraph alignment values", (): void => {
  assert.equal(getSafeDocxTextAlignment(null, "text-align: center; color: red"), "center");
  assert.equal(getSafeDocxTextAlignment(null, null, "user-provided docx-align-center"), "center");
  assert.equal(getSafeDocxTextAlignment("RIGHT", null), "right");
  assert.equal(getSafeDocxTextAlignment(null, "text-align: center; background: url(javascript:alert(1))"), "center");
  assert.equal(getSafeDocxTextAlignment(null, "text-align: expression(alert(1))"), undefined);
  assert.equal(getSafeDocxTextAlignment(null, "position: fixed"), undefined);
});
