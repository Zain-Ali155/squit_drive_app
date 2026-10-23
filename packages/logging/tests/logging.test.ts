import test from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { createServer } from "node:http";
import type { DestinationStream } from "pino";
import { createHttpLogger, createLogger } from "../src/index.js";
import type { Logger } from "../src/index.js";

const isLogEntry = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

void test("writes machine-readable JSON application logs", () => {
  const messages: string[] = [];
  const destination: DestinationStream = { write: (message: string) => { messages.push(message); } };
  const logger = createLogger({ service: "test-service", destination });
  logger.info("runtime ready", { port: 4000 });
  const entry: unknown = JSON.parse(messages[0] ?? "null");
  assert.deepEqual(isLogEntry(entry) ? {
    service: entry.service,
    message: entry.msg,
    port: entry.port
  } : null, { service: "test-service", message: "runtime ready", port: 4000 });
});

void test("writes readable structured terminal logs", () => {
  const messages: string[] = [];
  const destination = new Writable({
    write: (chunk: Buffer, _encoding, callback) => {
      messages.push(chunk.toString("utf8"));
      callback();
    }
  });
  const logger = createLogger({
    service: "test-service",
    destination,
    format: "pretty",
    colorize: false
  });

  logger.info("API server started.", { host: "127.0.0.1", port: 4000 });

  const output = messages.join("");
  assert.match(output, /INFO.*\(test-service\): API server started\./);
  assert.match(output, /host: "127\.0\.0\.1"/);
  assert.match(output, /port: 4000/);
  assert.doesNotMatch(output, /^\{/);
});

void test("redacts request query values when safe HTTP logging is enabled", async (context) => {
  const messages: string[] = [];
  const logger: Logger = {
    info: (_message, values): void => { messages.push(JSON.stringify(values)); },
    warn: () => undefined,
    error: () => undefined
  };
  const middleware = createHttpLogger({ logger, redactQuery: true });
  const server = createServer((request, response) => {
    middleware(request, response, () => { response.end("ok"); });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => {
      if (error) reject(error);
      else resolve();
    }));
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const response = await fetch(`http://127.0.0.1:${String(address.port)}/drive/entries?search=private-title-phrase`);
  await response.text();

  assert.match(messages[0] ?? "", /\/drive\/entries/u);
  assert.doesNotMatch(messages.join(""), /private-title-phrase/u);
});
