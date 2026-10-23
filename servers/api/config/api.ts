import type { ApiConfig, ValidatedApiEnvironment } from "../types/index.js";

export const createApiConfig = (environment: ValidatedApiEnvironment): ApiConfig => Object.freeze({
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
});
