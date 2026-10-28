import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

void test("popover surfaces have opaque light and dark theme colors", async () => {
  const theme = await readFile(new URL("../src/styles/theme.css", import.meta.url), "utf8");

  assert.match(theme, /--color-popover:\s*var\(--popover\)/u);
  assert.match(theme, /--color-popover-foreground:\s*var\(--popover-foreground\)/u);
  assert.match(theme, /--popover:\s*#ffffff/u);
  assert.match(theme, /--popover-foreground:\s*#171717/u);
  assert.match(theme, /\.dark\s*\{[^}]*--popover:\s*hsl\(240 5\.9% 10%\)[^}]*--popover-foreground:\s*hsl\(0 0% 98%\)/u);
});
