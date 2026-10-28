import express, { type Express } from "express";
import { createHttpLogger, type Logger } from "@workspace/logging";
import type { ApiConfig } from "../types/index.js";
import { apiRuntime } from "../constants/index.js";
import {
  createAuthRepository,
  createAuthRoutes,
  createGoogleOidcProvider,
  createSessionPrincipalResolver
} from "../features/auth/index.js";
import { createDriveRepository, createDriveRoutes, createSupabaseStorageIntegration } from "../features/drive/index.js";
import { createHealthRoutes } from "../features/health/index.js";
import {
  createCorsMiddleware,
  createErrorHandler,
  createLocalDemoPrincipalResolver,
  createTrustedOriginGuard,
  createNotFoundHandler
} from "../middleware/index.js";

type AppDependencies = Readonly<{ config: ApiConfig; logger: Logger }>;

export const createApp = ({ config, logger }: AppDependencies): Express => {
  const app = express();
  const googleAuthentication = config.authMode === "google"
    ? {
      repository: createAuthRepository(),
      provider: createGoogleOidcProvider({
        config: {
          clientId: config.googleClientId,
          clientSecret: config.googleClientSecret,
          redirectUri: config.googleRedirectUri
        },
        onVerificationFailure: (failure) => {
          logger.warn("Google OIDC verification failed", failure);
        }
      }),
      cookieSecure: new URL(config.googleRedirectUri).protocol === "https:",
      origin: config.webOrigin,
      redirectUri: config.googleRedirectUri,
      environment: config.environment
    }
    : null;
  app.disable("x-powered-by");
  app.use(createHttpLogger({
    logger,
    format: config.environment === "production" ? "combined" : "dev",
    redactQuery: true
  }));
  app.use(createCorsMiddleware({ origin: config.webOrigin, environment: config.environment }));
  app.use(express.json({ limit: apiRuntime.jsonBodyLimit }));
  const featureRouters = [createHealthRoutes({
    environment: config.environment,
    serviceName: apiRuntime.serviceName
  }), createDriveRoutes({
    repository: createDriveRepository(),
    enabled: Boolean(config.mongodbUri),
    logger,
    resolvePrincipal: googleAuthentication
      ? createSessionPrincipalResolver(googleAuthentication)
      : createLocalDemoPrincipalResolver(config.environment),
    ...(googleAuthentication ? {
      originGuard: createTrustedOriginGuard({
        origin: config.webOrigin,
        environment: config.environment
      })
    } : {}),
    ...(config.supabaseUrl && config.supabaseBucket && config.supabaseSecretKey ? {
      storage: createSupabaseStorageIntegration({
        config: { url: config.supabaseUrl, bucket: config.supabaseBucket, secretKey: config.supabaseSecretKey }
      })
    } : {})
  })];
  if (googleAuthentication) {
    featureRouters.push(createAuthRoutes(googleAuthentication));
  }
  for (const featureRouter of featureRouters) app.use(featureRouter);
  app.use(createNotFoundHandler());
  app.use(createErrorHandler({ logger }));
  return app;
};
