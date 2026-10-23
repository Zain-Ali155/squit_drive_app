import { createServer, type RequestListener, type Server } from "node:http";
import next from "next";
import { pathToFileURL } from "node:url";

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

export const listenOnLoopbackAddresses = async (handler: RequestListener, requestedPort: number) => {
  const ipv4Server = createServer(handler);
  const ipv6Server = createServer(handler);
  try {
    await listen(ipv4Server, "127.0.0.1", requestedPort);
    const address = ipv4Server.address();
    if (!address || typeof address === "string") throw new Error("The web server did not report its loopback address.");
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

  const app = next({ dev, hostname: "127.0.0.1", port });
  await app.prepare();
  let server: Awaited<ReturnType<typeof listenOnLoopbackAddresses>>;
  try {
    server = await listenOnLoopbackAddresses(app.getRequestHandler(), port);
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
