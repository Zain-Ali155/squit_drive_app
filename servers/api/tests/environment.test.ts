import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ZodError } from "zod";
import { createApiConfig, readApiEnvironment } from "../config/index.js";

void test("derives API configuration from validated environment input", () => {
  const environment = readApiEnvironment({
    NODE_ENV: "development",
    AUTH_MODE: "local-demo",
    API_HOST: "127.0.0.1",
    API_PORT: "8080",
    WEB_ORIGIN: "http://localhost:3000",
    LOG_LEVEL: "warn"
  });
  assert.deepEqual(createApiConfig(environment), {
    environment: "development",
    authMode: "local-demo",
    host: "127.0.0.1",
    port: 8080,
    webOrigin: "http://localhost:3000",
    logLevel: "warn"
  });
});

void test("Vercel API service uses an explicit ESM entrypoint", async () => {
  const [configText, entrypoint, wrapper, localServer, packageText] = await Promise.all([
    readFile(new URL("../../../vercel.json", import.meta.url), "utf8"),
    readFile(new URL("../vercel-app-source.mts", import.meta.url), "utf8"),
    readFile(new URL("../app.mjs", import.meta.url), "utf8"),
    readFile(new URL("../local-server.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8")
  ]);
  const config = JSON.parse(configText) as {
    services: { api: { entrypoint: string } };
  };
  const apiPackage = JSON.parse(packageText) as {
    scripts: { build: string; dev: string; start: string };
  };

  assert.equal(config.services.api.entrypoint, "app.mjs");
  assert.match(entrypoint, /export default app;/u);
  assert.doesNotMatch(entrypoint, /dotenv\/config/u);
  assert.match(wrapper, /export \{ default \} from ["']\.\/dist\/vercel-app\.mjs["'];/u);
  assert.match(localServer, /dotenv\/config/u);
  assert.equal(apiPackage.scripts.dev, "tsx watch local-server.ts");
  assert.equal(apiPackage.scripts.start, "node dist/local-server.js");
  assert.match(apiPackage.scripts.build, /pnpm --dir \.\.\/\.\.\/packages\/logging run build/u);
  assert.match(apiPackage.scripts.build, /esbuild vercel-app-source\.mts --bundle --platform=node --format=esm/u);
  assert.match(apiPackage.scripts.build, /--outfile=dist\/vercel-app\.mjs/u);
  await assert.rejects(readFile(new URL("../server.ts", import.meta.url)), { code: "ENOENT" });
});

void test("accepts localhost and IPv6 loopback origins", () => {
  const environment = readApiEnvironment({
    NODE_ENV: "test",
    AUTH_MODE: "local-demo",
    API_HOST: "localhost",
    API_PORT: "8080",
    WEB_ORIGIN: "http://[::1]:3000",
    LOG_LEVEL: "warn"
  });
  assert.equal(environment.API_HOST, "localhost");
});

void test("rejects non-loopback bind hosts and invalid environment-specific web origins", () => {
  const valid = {
    NODE_ENV: "development",
    AUTH_MODE: "local-demo",
    API_HOST: "127.0.0.1",
    API_PORT: "8080",
    WEB_ORIGIN: "http://localhost:3000",
    LOG_LEVEL: "warn"
  };

  for (const host of ["0.0.0.0", "::", "192.168.1.20", "drive.example.test"]) {
    assert.throws(() => readApiEnvironment({ ...valid, API_HOST: host }), host);
  }
  for (const origin of ["https://example.test", "http://localhost:3000/path", "http://localhost.evil.test"]) {
    assert.throws(() => readApiEnvironment({ ...valid, WEB_ORIGIN: origin }), origin);
  }
  assert.throws(() => readApiEnvironment({ ...valid, NODE_ENV: "production" }), /AUTH_MODE/u);
});

void test("accepts production Google authentication only for an HTTPS same-origin callback", () => {
  const production = {
    NODE_ENV: "production",
    AUTH_MODE: "google",
    API_HOST: "127.0.0.1",
    API_PORT: "4000",
    WEB_ORIGIN: "https://squid-drive-demo.vercel.app",
    LOG_LEVEL: "info",
    MONGODB_URI: "mongodb://localhost:27017/squid-drive",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    GOOGLE_REDIRECT_URI: "https://squid-drive-demo.vercel.app/auth/google/callback"
  };

  assert.equal(readApiEnvironment(production).NODE_ENV, "production");
  assert.throws(() => readApiEnvironment({
    ...production,
    GOOGLE_REDIRECT_URI: "https://other-origin.vercel.app/auth/google/callback"
  }));
  assert.throws(() => readApiEnvironment({ ...production, WEB_ORIGIN: "http://localhost:3000" }));
  assert.throws(() => readApiEnvironment({ ...production, AUTH_MODE: "local-demo" }));
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
    AUTH_MODE: "local-demo",
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

void test("does not require email delivery configuration for Drive link sharing", () => {
  const valid = {
    NODE_ENV: "development",
    AUTH_MODE: "local-demo",
    API_HOST: "127.0.0.1",
    API_PORT: "8080",
    WEB_ORIGIN: "http://localhost:3000",
    LOG_LEVEL: "warn"
  };
  const environment = readApiEnvironment(valid);
  assert.equal(createApiConfig(environment).authMode, "local-demo");
});

void test("requires complete Google authentication configuration and a safe callback URL", () => {
  const valid = {
    NODE_ENV: "test",
    AUTH_MODE: "google",
    API_HOST: "127.0.0.1",
    API_PORT: "8080",
    WEB_ORIGIN: "http://localhost:3000",
    LOG_LEVEL: "warn",
    MONGODB_URI: "mongodb://localhost:27017/squid-drive",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    GOOGLE_REDIRECT_URI: "http://localhost:8080/auth/google/callback"
  };

  const googleEnvironment = readApiEnvironment(valid);
  assert.equal(googleEnvironment.AUTH_MODE, "google");
  assert.deepEqual(createApiConfig(googleEnvironment), {
    environment: "test",
    authMode: "google",
    host: "127.0.0.1",
    port: 8080,
    webOrigin: "http://localhost:3000",
    logLevel: "warn",
    mongodbUri: "mongodb://localhost:27017/squid-drive",
    googleClientId: "test-client-id",
    googleClientSecret: "test-client-secret",
    googleRedirectUri: "http://localhost:8080/auth/google/callback"
  });
  assert.throws(() => readApiEnvironment({ ...valid, GOOGLE_CLIENT_SECRET: undefined }));
  assert.throws(() => readApiEnvironment({ ...valid, MONGODB_URI: undefined }));
  assert.throws(() => readApiEnvironment({
    ...valid, GOOGLE_REDIRECT_URI: "http://example.test/auth/google/callback"
  }));
  assert.throws(() => readApiEnvironment({
    ...valid, GOOGLE_REDIRECT_URI: "https://example.test/auth/google/callback?next=evil"
  }));
  assert.throws(() => readApiEnvironment({
    ...valid, AUTH_MODE: "local-demo"
  }));
});
