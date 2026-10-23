import test from "node:test";
import assert from "node:assert/strict";
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
