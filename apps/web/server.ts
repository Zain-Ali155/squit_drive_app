import { createServer, type IncomingMessage, type RequestListener, type Server } from "node:http";
import { createConnection } from "node:net";
import type { Duplex } from "node:stream";
import next from "next";
import { pathToFileURL } from "node:url";

type UpgradeHandler = (request: IncomingMessage, socket: Duplex, head: Buffer) => Promise<void>;

const listen = (server: Server, host: string, port: number): Promise<void> => new Promise((resolve, reject) => {
  const onError = (error: Error): void => reject(error);
  server.once("error", onError);
  server.listen(port, host, () => {
    server.off("error", onError);
    resolve();
  });
});

const close = (server: Server): Promise<void> => new Promise((resolve, reject) => {
  if (!server.listening) {
    resolve();
    return;
  }
  server.close((error) => error ? reject(error) : resolve());
});

const forwardIpv6UpgradeToIpv4 = (port: number): UpgradeHandler => (request, socket, head) => new Promise((resolve) => {
  const upstream = createConnection({ host: "127.0.0.1", port });
  const headers = Array.from({ length: Math.floor(request.rawHeaders.length / 2) }, (_, index) =>
    `${request.rawHeaders[index * 2]}: ${request.rawHeaders[index * 2 + 1]}`
  ).join("\r\n");

  upstream.once("connect", () => {
    upstream.write(`${request.method ?? "GET"} ${request.url ?? "/"} HTTP/${request.httpVersion}\r\n${headers}\r\n\r\n`);
    if (head.length > 0) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
    resolve();
  });
  upstream.once("error", () => {
    socket.destroy();
    resolve();
  });
  socket.once("error", () => upstream.destroy());
  socket.once("close", () => upstream.destroy());
  upstream.once("close", () => socket.destroy());
});

export const listenOnLoopbackAddresses = async (
  handler: RequestListener,
  requestedPort: number,
  upgradeHandler?: UpgradeHandler,
  primaryServer?: Server
) => {
  const ipv4Server = primaryServer ?? createServer();
  ipv4Server.on("request", handler);
  const ipv6Server = createServer(handler);
  if (upgradeHandler) ipv4Server.on("upgrade", upgradeHandler);
  try {
    await listen(ipv4Server, "127.0.0.1", requestedPort);
    const address = ipv4Server.address();
    if (!address || typeof address === "string") throw new Error("The web server did not report its loopback address.");
    if (primaryServer) ipv6Server.on("upgrade", forwardIpv6UpgradeToIpv4(address.port));
    else if (upgradeHandler) ipv6Server.on("upgrade", upgradeHandler);
    await listen(ipv6Server, "::1", address.port);
    return Object.freeze({
      port: address.port,
      close: async (): Promise<void> => {
        await Promise.all([close(ipv4Server), close(ipv6Server)]);
      }
    });
  } catch (cause) {
    await Promise.all([close(ipv4Server), close(ipv6Server)]);
    throw cause;
  }
};

const start = async (): Promise<void> => {
  const dev = process.argv.includes("--dev");
  const port = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const ipv4Server = createServer();
  const app = next({ dev, hostname: "127.0.0.1", port, httpServer: ipv4Server });
  await app.prepare();
  let server: Awaited<ReturnType<typeof listenOnLoopbackAddresses>>;
  try {
    server = await listenOnLoopbackAddresses(app.getRequestHandler(), port, undefined, ipv4Server);
  } catch (cause) {
    await app.close();
    throw cause;
  }
  console.info(`SQUID Drive web server listening on 127.0.0.1:${server.port} and [::1]:${server.port}`);

  const shutdown = (): void => {
    void (async (): Promise<void> => {
      await server.close();
      await app.close();
    })().catch((cause: unknown) => {
      console.error("Could not close the SQUID Drive web servers.", cause);
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void start().catch((cause: unknown) => {
    console.error("Could not start the SQUID Drive web server.", cause);
    process.exitCode = 1;
  });
}
