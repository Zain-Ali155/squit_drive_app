import type { ApiConfig, ValidatedApiEnvironment } from "../types/index.js";

export const createApiConfig = (environment: ValidatedApiEnvironment): ApiConfig => {
  const baseConfig = {
    environment: environment.NODE_ENV,
    host: environment.API_HOST,
    port: environment.API_PORT,
    webOrigin: environment.WEB_ORIGIN,
    logLevel: environment.LOG_LEVEL,
    ...(environment.MONGODB_URI ? { mongodbUri: environment.MONGODB_URI } : {}),
    ...(environment.SUPABASE_URL && environment.SUPABASE_BUCKET && environment.SUPABASE_SECRET_KEY ? {
      supabaseUrl: environment.SUPABASE_URL,
      supabaseBucket: environment.SUPABASE_BUCKET,
      supabaseSecretKey: environment.SUPABASE_SECRET_KEY
    } : {})
  };

  if (environment.AUTH_MODE === "local-demo") {
    return Object.freeze({ ...baseConfig, authMode: "local-demo" });
  }
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, MONGODB_URI } = environment;
  if (
    GOOGLE_CLIENT_ID === undefined ||
    GOOGLE_CLIENT_SECRET === undefined ||
    GOOGLE_REDIRECT_URI === undefined ||
    MONGODB_URI === undefined
  ) {
    throw new Error("Google authentication configuration was not fully validated.");
  }
  return Object.freeze({
    ...baseConfig,
    authMode: "google",
    mongodbUri: MONGODB_URI,
    googleClientId: GOOGLE_CLIENT_ID,
    googleClientSecret: GOOGLE_CLIENT_SECRET,
    googleRedirectUri: GOOGLE_REDIRECT_URI
  });
};
