import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DriveCsvTable } from "../components/drive.csv-preview.js";
import { parseDriveCsv } from "../utils/drive.csv.js";

void test("CSV parser handles commas, escaped quotes, newlines, CRLF, and a byte-order mark", (): void => {
  const preview = parseDriveCsv("\uFEFFName,Note\r\n\"Smith, Jane\",\"line 1\nline 2\"\r\nQuote,\"She said \"\"hello\"\"\"\r\n");

  assert.deepEqual(preview.headers, ["Name", "Note"]);
  assert.deepEqual(preview.rows, [
    ["Smith, Jane", "line 1\nline 2"],
    ["Quote", "She said \"hello\""]
  ]);
  assert.equal(preview.truncated, false);
});

void test("CSV parser reports malformed quote sequences", (): void => {
  assert.throws(() => parseDriveCsv("Name,Note\nSmith,\"unfinished"), /unterminated quoted field/u);
  assert.throws(() => parseDriveCsv("Name,Note\nSmith,Ja\"ne"), /unexpected quote/u);
  assert.throws(() => parseDriveCsv("Name,Note\nSmith,\"Jane\" invalid"), /after a quoted field/u);
});

void test("CSV parser enforces byte, row, and column preview limits", (): void => {
  assert.throws(() => parseDriveCsv("a,b", { maxBytes: 2 }), /too large to preview/u);

  const rowLimited = parseDriveCsv("A,B\n1,2\n3,4\n", { maxRows: 1 });
  assert.deepEqual(rowLimited.rows, [["1", "2"]]);
  assert.equal(rowLimited.truncated, true);

  const columnLimited = parseDriveCsv("A,B,C\n1,2,3", { maxColumns: 2 });
  assert.deepEqual(columnLimited.headers, ["A", "B"]);
  assert.deepEqual(columnLimited.rows, [["1", "2"]]);
  assert.equal(columnLimited.truncated, true);
});

void test("CSV preview renders cell content as escaped text rather than executable markup", (): void => {
  const markup = renderToStaticMarkup(createElement(DriveCsvTable, {
    preview: {
      headers: ["Value"],
      rows: [["<img src=x onerror=alert(1)>"]],
      truncated: false
    }
  }));

  assert.match(markup, /&lt;img src=x onerror=alert\(1\)&gt;/u);
  assert.doesNotMatch(markup, /<img\b/u);
  assert.match(markup, /aria-label="CSV spreadsheet preview"/u);
  assert.match(markup, /role="region"/u);
  assert.match(markup, /tabindex="0"/u);
  assert.match(markup, />A</u);
  assert.match(markup, /aria-label="Row 1"/u);
  assert.match(markup, /scope="row">2<\/th>/u);
  assert.match(markup, /border-b border-r border-slate-200/u);
});
