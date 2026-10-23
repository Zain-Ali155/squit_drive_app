import test from "node:test";
import assert from "node:assert/strict";
import type { Logger } from "@workspace/logging";
import { createApp, createServer } from "../bootstrap/index.js";
import { ERROR_CODES, ERROR_MESSAGES, HTTP_STATUS } from "../constants/index.js";
import type { ApiConfig } from "../types/index.js";

const logger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};
const config: ApiConfig = {
  environment: "test",
  host: "127.0.0.1",
  port: 0,
  webOrigin: "http://localhost:3000",
  logLevel: "silent"
};

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
