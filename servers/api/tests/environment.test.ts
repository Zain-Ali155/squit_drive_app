import test from "node:test";
import assert from "node:assert/strict";
import { ZodError } from "zod";
import { createApiConfig, readApiEnvironment } from "../config/index.js";

void test("derives API configuration from validated environment input", () => {
  const environment = readApiEnvironment({
    NODE_ENV: "development",
    API_HOST: "127.0.0.1",
    API_PORT: "8080",
    WEB_ORIGIN: "http://localhost:3000",
    LOG_LEVEL: "warn"
  });
  assert.deepEqual(createApiConfig(environment), {
    environment: "development",
    host: "127.0.0.1",
    port: 8080,
    webOrigin: "http://localhost:3000",
    logLevel: "warn"
  });
});

void test("accepts localhost and IPv6 loopback origins", () => {
  const environment = readApiEnvironment({
    NODE_ENV: "test",
    API_HOST: "localhost",
    API_PORT: "8080",
    WEB_ORIGIN: "http://[::1]:3000",
    LOG_LEVEL: "warn"
  });
  assert.equal(environment.API_HOST, "localhost");
});

void test("rejects production mode and non-loopback bind hosts or web origins", () => {
  const valid = {
    NODE_ENV: "development",
    API_HOST: "127.0.0.1",
    API_PORT: "8080",
    WEB_ORIGIN: "http://localhost:3000",
    LOG_LEVEL: "warn"
  };

  assert.throws(() => readApiEnvironment({ ...valid, NODE_ENV: "production" }));
  for (const host of ["0.0.0.0", "::", "192.168.1.20", "drive.example.test"]) {
    assert.throws(() => readApiEnvironment({ ...valid, API_HOST: host }), host);
  }
  for (const origin of ["https://example.test", "http://localhost:3000/path", "http://localhost.evil.test"]) {
    assert.throws(() => readApiEnvironment({ ...valid, WEB_ORIGIN: origin }), origin);
  }
});

void test("rejects invalid server environment input", () => {
  assert.throws(() => readApiEnvironment({ API_PORT: "70000" }));
});

void test("requires runtime values from the environment", () => {
  assert.throws(() => readApiEnvironment({}), ZodError);
});

void test("accepts complete Supabase server configuration and rejects partial or non-project settings", () => {
  const valid = {
    NODE_ENV: "development",
    API_HOST: "127.0.0.1",
    API_PORT: "8080",
    WEB_ORIGIN: "http://localhost:3000",
    LOG_LEVEL: "warn"
  };
  const environment = readApiEnvironment({
    ...valid,
    SUPABASE_URL: "https://qhzbwvrytpsfdocrvqxp.supabase.co",
    SUPABASE_BUCKET: "squid-drive-files",
    SUPABASE_SECRET_KEY: "test-only-placeholder"
  });
  assert.equal(environment.SUPABASE_URL, "https://qhzbwvrytpsfdocrvqxp.supabase.co");
  assert.equal(environment.SUPABASE_BUCKET, "squid-drive-files");
  assert.throws(() => readApiEnvironment({ ...valid, SUPABASE_BUCKET: "squid-drive-files" }));
  assert.throws(() => readApiEnvironment({ ...valid, SUPABASE_URL: "http://example.test" }));
});
