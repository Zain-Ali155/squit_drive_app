import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Logger } from "@workspace/logging";
import { createApp, createServer } from "../bootstrap/index.js";
import { ERROR_CODES, ERROR_MESSAGES, HTTP_STATUS } from "../constants/index.js";
import { createRateLimitMiddleware } from "../middleware/index.js";
import type { ApiConfig } from "../types/index.js";

const logger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};
const config: ApiConfig = {
  environment: "test",
  authMode: "local-demo",
  host: "127.0.0.1",
  port: 0,
  webOrigin: "http://localhost:3000",
  logLevel: "silent"
};

void test("rate limiting returns the standard 429 contract and resets after its window", async (context) => {
  let currentTime = 1_000;
  const app = express();
  app.get("/limited", createRateLimitMiddleware({
    maxRequests: 2,
    windowMs: 60_000,
    now: () => currentTime
  }), (_request, response) => response.sendStatus(HTTP_STATUS.ok));
  const server = createServer({ app, config, logger });
  await server.start();
  context.after(async () => { await server.stop(); });
  const address = server.raw.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${String(address.port)}/limited`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url);
    assert.equal(response.status, HTTP_STATUS.ok);
    assert.equal(response.headers.get("ratelimit-limit"), "2");
  }
  const limited = await fetch(url);
  assert.equal(limited.status, HTTP_STATUS.tooManyRequests);
  assert.equal(limited.headers.get("retry-after"), "60");
  assert.deepEqual(await limited.json(), {
    error: {
      code: ERROR_CODES.rateLimitExceeded,
      message: ERROR_MESSAGES.rateLimitExceeded
    }
  });

  currentTime += 60_000;
  assert.equal((await fetch(url)).status, HTTP_STATUS.ok);
});

void test("unknown routes use the API error boundary", async (context) => {
  const server = createServer({ app: createApp({ config, logger }), config, logger });
  await server.start();
  context.after(async () => { await server.stop(); });
  const address = server.raw.address();
  assert.ok(address && typeof address === "object");
  assert.equal(address.address, config.host);
  const response = await fetch(`http://127.0.0.1:${String(address.port)}/missing`);
  assert.equal(response.status, HTTP_STATUS.notFound);
  assert.deepEqual(await response.json(), {
    error: {
      code: ERROR_CODES.routeNotFound,
      message: ERROR_MESSAGES.routeNotFound,
      details: { method: "GET", path: "/missing" }
    }
  });
});

void test("Google mode does not fall back to the local demo principal", async (context) => {
  const googleConfig: ApiConfig = {
    ...config,
    authMode: "google",
    mongodbUri: "mongodb://127.0.0.1:27017/squid-drive-test",
    googleClientId: "test-client-id",
    googleClientSecret: "test-client-secret",
    googleRedirectUri: "http://localhost:4000/auth/google/callback"
  };
  const server = createServer({ app: createApp({ config: googleConfig, logger }), config: googleConfig, logger });
  await server.start();
  context.after(async () => { await server.stop(); });
  const address = server.raw.address();
  assert.ok(address && typeof address === "object");

  const baseUrl = `http://127.0.0.1:${String(address.port)}`;
  const responses = await Promise.all([
    fetch(`${baseUrl}/drive/storage-usage?ownerId=local-demo-owner`, {
      headers: { "x-owner-id": "local-demo-owner" }
    }),
    fetch(`${baseUrl}/drive/folders`, {
      method: "POST",
      headers: {
        Origin: config.webOrigin,
        "Content-Type": "application/json",
        "x-owner-id": "local-demo-owner"
      },
      body: JSON.stringify({ ownerId: "local-demo-owner" })
    })
  ]);
  for (const response of responses) {
    assert.equal(response.status, HTTP_STATUS.unauthorized);
    assert.deepEqual(await response.json(), {
      error: {
        code: ERROR_CODES.authenticationRequired,
        message: ERROR_MESSAGES.authenticationRequired
      }
    });
  }
});

void test("Google cookie-authenticated mutations reject missing and untrusted origins", async (context) => {
  const googleConfig: ApiConfig = {
    ...config,
    authMode: "google",
    mongodbUri: "mongodb://127.0.0.1:27017/squid-drive-test",
    googleClientId: "test-client-id",
    googleClientSecret: "test-client-secret",
    googleRedirectUri: "http://localhost:4000/auth/google/callback"
  };
  const server = createServer({ app: createApp({ config: googleConfig, logger }), config: googleConfig, logger });
  await server.start();
  context.after(async () => { await server.stop(); });
  const address = server.raw.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${String(address.port)}`;

  for (const request of [
    { path: "/auth/logout", method: "POST", headers: {} },
    { path: "/auth/logout", method: "POST", headers: { Origin: "https://attacker.example" } },
    { path: "/drive/folders", method: "POST", headers: {} },
    { path: "/drive/folders", method: "POST", headers: { Origin: "https://attacker.example" } }
  ]) {
    const response = await fetch(`${baseUrl}${request.path}`, {
      method: request.method,
      headers: request.headers
    });
    assert.equal(response.status, HTTP_STATUS.forbidden, `${request.method} ${request.path}`);
    assert.deepEqual(await response.json(), {
      error: {
        code: ERROR_CODES.csrfOriginRejected,
        message: ERROR_MESSAGES.csrfOriginRejected
      }
    });
  }

  const trustedLogout = await fetch(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: { Origin: config.webOrigin }
  });
  assert.equal(trustedLogout.status, HTTP_STATUS.noContent);

  const trustedDriveRequest = await fetch(`${baseUrl}/drive/folders`, {
    method: "POST",
    headers: {
      Origin: config.webOrigin,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name: "Trusted-origin request" })
  });
  assert.equal(trustedDriveRequest.status, HTTP_STATUS.unauthorized);
  assert.deepEqual(await trustedDriveRequest.json(), {
    error: {
      code: ERROR_CODES.authenticationRequired,
      message: ERROR_MESSAGES.authenticationRequired
    }
  });
});

void test("local-demo composition does not expose Google login routes", async (context) => {
  const server = createServer({ app: createApp({ config, logger }), config, logger });
  await server.start();
  context.after(async () => { await server.stop(); });
  const address = server.raw.address();
  assert.ok(address && typeof address === "object");

  const response = await fetch(`http://127.0.0.1:${String(address.port)}/auth/google/login`);
  assert.equal(response.status, HTTP_STATUS.notFound);
});

void test("CORS grants the configured local web origin", async (context) => {
  const server = createServer({ app: createApp({ config, logger }), config, logger });
  await server.start();
  context.after(async () => { await server.stop(); });
  const address = server.raw.address();
  assert.ok(address && typeof address === "object");

  const response = await fetch(`http://127.0.0.1:${String(address.port)}/health`, {
    headers: { Origin: config.webOrigin }
  });

  assert.equal(response.status, HTTP_STATUS.ok);
  assert.equal(response.headers.get("access-control-allow-origin"), config.webOrigin);
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
});

void test("CORS grants the approved 3001 loopback origin only in development", async (context) => {
  const developmentConfig: ApiConfig = { ...config, environment: "development" };
  const server = createServer({ app: createApp({ config: developmentConfig, logger }), config: developmentConfig, logger });
  await server.start();
  context.after(async () => { await server.stop(); });
  const address = server.raw.address();
  assert.ok(address && typeof address === "object");

  const response = await fetch(`http://127.0.0.1:${String(address.port)}/drive/files`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://127.0.0.1:3001",
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type,x-file-name,x-drive-parent-id"
    }
  });

  assert.equal(response.status, HTTP_STATUS.noContent);
  assert.equal(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:3001");
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  assert.match(response.headers.get("access-control-allow-methods") ?? "", /PUT/u);
  assert.match(response.headers.get("access-control-allow-headers") ?? "", /X-File-Name/u);
});

void test("CORS allows equivalent localhost and IPv4 loopback origins for the configured port in development", async () => {
  for (const [configuredOrigin, requestOrigin] of [
    ["http://localhost:3000", "http://127.0.0.1:3000"],
    ["http://127.0.0.1:3000", "http://localhost:3000"]
  ] as const) {
    const developmentConfig: ApiConfig = { ...config, environment: "development", webOrigin: configuredOrigin };
    const server = createServer({ app: createApp({ config: developmentConfig, logger }), config: developmentConfig, logger });
    await server.start();
    const address = server.raw.address();
    assert.ok(address && typeof address === "object");

    try {
      const response = await fetch(`http://127.0.0.1:${String(address.port)}/drive/storage-usage`, {
        headers: { Origin: requestOrigin }
      });

      assert.equal(response.headers.get("access-control-allow-origin"), requestOrigin);
      for (const disallowedOrigin of ["http://localhost:3001", "http://127.0.0.1:4000", "https://127.0.0.1:3000"]) {
        const disallowedResponse = await fetch(`http://127.0.0.1:${String(address.port)}/health`, {
          headers: { Origin: disallowedOrigin }
        });
        assert.equal(disallowedResponse.headers.get("access-control-allow-origin"), null, disallowedOrigin);
      }
    } finally {
      await server.stop();
    }
  }
});

void test("CORS rejects the 3001 origin outside development and rejects other origins", async () => {
  for (const environment of ["test", "production"] as const) {
    const restrictedConfig: ApiConfig = { ...config, environment };
    const server = createServer({ app: createApp({ config: restrictedConfig, logger }), config: restrictedConfig, logger });
    await server.start();
    const address = server.raw.address();
    assert.ok(address && typeof address === "object");

    try {
      for (const origin of ["http://127.0.0.1:3001", "http://localhost:3001", "https://attacker.example"]) {
        const response = await fetch(`http://127.0.0.1:${String(address.port)}/health`, {
          headers: { Origin: origin }
        });
        assert.equal(response.headers.get("access-control-allow-origin"), null, `${environment}: ${origin}`);
      }
    } finally {
      await server.stop();
    }
  }
});

void test("CORS does not grant a different origin access", async (context) => {
  const server = createServer({ app: createApp({ config, logger }), config, logger });
  await server.start();
  context.after(async () => { await server.stop(); });
  const address = server.raw.address();
  assert.ok(address && typeof address === "object");

  const response = await fetch(`http://127.0.0.1:${String(address.port)}/health`, {
    headers: { Origin: "https://attacker.example" }
  });

  assert.equal(response.status, HTTP_STATUS.ok);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});
