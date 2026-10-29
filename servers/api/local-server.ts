import "dotenv/config";
import { createLogger } from "@workspace/logging";
import { createApp, createServer, createShutdown } from "./bootstrap/index.js";
import { createApiConfig, readApiEnvironment } from "./config/index.js";
import { apiRuntime } from "./constants/index.js";
import { createMongoDbIntegration } from "./integrations/index.js";

const config = createApiConfig(readApiEnvironment());
const logger = createLogger({
  service: apiRuntime.serviceName,
  level: config.logLevel,
  format: config.environment === "production" ? "json" : "pretty"
});
const database = createMongoDbIntegration({
  logger,
  ...(config.mongodbUri ? { uri: config.mongodbUri } : {})
});
const app = createApp({ config, logger });
const server = createServer({ app, config, logger });

const shutdown = createShutdown({ database, logger, server });

await database.connect();
await server.start();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal)
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        logger.error("API shutdown failed.", { errorType: error instanceof Error ? error.name : "unknown" });
        process.exit(1);
      });
  });
}
