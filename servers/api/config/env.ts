import {
  validateApiEnvironment
} from "../validation/env.validation.js";
import type { ApiEnvironmentSource, ValidatedApiEnvironment } from "../types/index.js";

export const readApiEnvironment = (
  source: ApiEnvironmentSource = process.env
): ValidatedApiEnvironment => validateApiEnvironment({
  NODE_ENV: source.NODE_ENV,
  AUTH_MODE: source.AUTH_MODE,
  API_HOST: source.API_HOST,
  API_PORT: source.API_PORT,
  WEB_ORIGIN: source.WEB_ORIGIN,
  GOOGLE_CLIENT_ID: source.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: source.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: source.GOOGLE_REDIRECT_URI,
  MONGODB_URI: source.MONGODB_URI,
  SUPABASE_URL: source.SUPABASE_URL,
  SUPABASE_BUCKET: source.SUPABASE_BUCKET,
  SUPABASE_SECRET_KEY: source.SUPABASE_SECRET_KEY,
  LOG_LEVEL: source.LOG_LEVEL
});
