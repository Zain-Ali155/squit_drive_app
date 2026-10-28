import test from "node:test";
import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { createConnection } from "node:net";
import { listenOnLoopbackAddresses } from "../server";

void test("web server accepts localhost and IPv4 loopback while binding only loopback interfaces", async () => {
  const server = await listenOnLoopbackAddresses((_request, response) => {
    response.end("SQUID Drive");
  }, 0);

  try {
    for (const host of ["127.0.0.1", "[::1]"]) {
      const response = await fetch(`http://${host}:${server.port}`);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), "SQUID Drive");
    }
  } finally {
    await server.close();
  }
});

void test("web server forwards localhost IPv6 WebSocket upgrades to its IPv4 primary server", async () => {
  let upgrades = 0;
  const server = await listenOnLoopbackAddresses(
    (_request, response) => response.end("SQUID Drive"),
    0,
    (_request, socket) => {
      upgrades += 1;
      socket.end("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
      return Promise.resolve();
    },
    createHttpServer()
  );

  try {
    for (const host of ["127.0.0.1", "::1"]) {
      const response = await new Promise<string>((resolve, reject) => {
        const socket = createConnection({ host, port: server.port });
        let received = "";
        const timeout = setTimeout(() => {
          socket.destroy();
          reject(new Error(`${host} WebSocket handshake timed out.`));
        }, 2_000);
        socket.once("connect", () => {
          socket.write("GET /_next/hmr?id=test HTTP/1.1\r\nHost: localhost:3000\r\nOrigin: http://localhost:3000\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n");
        });
        socket.on("data", (chunk) => {
          received += chunk.toString("latin1");
          if (received.includes("\r\n\r\n")) {
            clearTimeout(timeout);
            resolve(received.split("\r\n")[0] ?? "");
            socket.destroy();
          }
        });
        socket.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      assert.equal(response, "HTTP/1.1 101 Switching Protocols");
    }
    assert.equal(upgrades, 2);
  } finally {
    await server.close();
  }
});
