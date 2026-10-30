import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ZodError } from "zod";
import { createApiConfiguration, resolveBrowserApiBaseUrl } from "../config/api";
import { readWebEnvironment } from "../config/env";

test("derives API configuration from validated environment input", () => {
  const environment = readWebEnvironment({ NEXT_PUBLIC_API_BASE_URL: "https://api.example.test" });
  assert.deepEqual(createApiConfiguration(environment), { baseUrl: "https://api.example.test" });
});

test("trims surrounding whitespace from a configured API base URL", () => {
  const environment = readWebEnvironment({ NEXT_PUBLIC_API_BASE_URL: "  https://api.example.test  " });

  assert.deepEqual(createApiConfiguration(environment), { baseUrl: "https://api.example.test" });
});

test("accepts same-origin API routing for multi-service deployments", () => {
  const environment = readWebEnvironment({ NEXT_PUBLIC_API_BASE_URL: "/" });
  assert.deepEqual(createApiConfiguration(environment), { baseUrl: "/" });
  assert.equal(resolveBrowserApiBaseUrl(environment.NEXT_PUBLIC_API_BASE_URL, "squid-drive-demo.vercel.app"), "/");
});

test("defaults a missing API base URL to same-origin routing on Vercel", () => {
  assert.deepEqual(readWebEnvironment({ VERCEL: "1" }), {
    NEXT_PUBLIC_API_BASE_URL: "/"
  });
});

test("defaults a blank API base URL to same-origin routing on Vercel", () => {
  assert.deepEqual(readWebEnvironment({ VERCEL: "1", NEXT_PUBLIC_API_BASE_URL: "" }), {
    NEXT_PUBLIC_API_BASE_URL: "/"
  });
});

test("defaults a missing or blank API base URL to same-origin routing in production", () => {
  assert.deepEqual(readWebEnvironment({ NODE_ENV: "production" }), {
    NEXT_PUBLIC_API_BASE_URL: "/"
  });
  assert.deepEqual(readWebEnvironment({ NODE_ENV: "production", NEXT_PUBLIC_API_BASE_URL: "   " }), {
    NEXT_PUBLIC_API_BASE_URL: "/"
  });
});

test("rejects an invalid API URL", () => {
  assert.throws(() => readWebEnvironment({ NEXT_PUBLIC_API_BASE_URL: "not-a-url" }));
});

test("keeps the browser API hostname aligned with either supported local web hostname", () => {
  assert.equal(
    resolveBrowserApiBaseUrl("http://localhost:4000", "localhost"),
    "http://localhost:4000"
  );
  assert.equal(
    resolveBrowserApiBaseUrl("http://localhost:4000", "127.0.0.1"),
    "http://127.0.0.1:4000"
  );
  assert.equal(
    resolveBrowserApiBaseUrl("https://api.example.test", "127.0.0.1"),
    "https://api.example.test"
  );
});

test("requires the API URL from the environment", () => {
  assert.throws(() => readWebEnvironment({}), ZodError);
});

test("still requires the API URL outside Vercel", () => {
  assert.throws(() => readWebEnvironment({ NODE_ENV: "development" }), ZodError);
});

test("rejects malformed non-empty API URLs in production", () => {
  assert.throws(() => readWebEnvironment({ NODE_ENV: "production", NEXT_PUBLIC_API_BASE_URL: "not-a-url" }), ZodError);
});

test("web server scripts use the local-only dual-loopback server", async () => {
  const packageText = await readFile(new URL("../package.json", import.meta.url), "utf8");
  const packageManifest = JSON.parse(packageText) as { scripts: Record<string, string> };

  assert.equal(packageManifest.scripts.dev, "tsx server.ts --dev");
  assert.equal(packageManifest.scripts.start, "tsx server.ts");
});

test("web build compiles the workspace UI package before Next.js", async () => {
  const packageText = await readFile(new URL("../package.json", import.meta.url), "utf8");
  const packageManifest = JSON.parse(packageText) as { scripts: Record<string, string> };

  assert.equal(packageManifest.scripts.build, "pnpm --dir ../../packages/ui run build && next build");
});

test("local web environment example targets the API on port 4000", async () => {
  const exampleText = await readFile(new URL("../.env.example", import.meta.url), "utf8");

  assert.match(exampleText, /^NEXT_PUBLIC_API_BASE_URL=http:\/\/127\.0\.0\.1:4000$/mu);
});
