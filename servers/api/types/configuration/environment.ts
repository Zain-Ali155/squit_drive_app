import type { LogLevel } from "@workspace/logging";
import type { ApiEnvironment } from "@workspace/types";

export type ApiEnvironmentSource = Readonly<Record<string, string | undefined>>;

export type AuthMode = "local-demo" | "google";

export type ValidatedApiEnvironment = Readonly<{
  NODE_ENV: ApiEnvironment;
  AUTH_MODE: AuthMode;
  API_HOST: string;
  API_PORT: number;
  WEB_ORIGIN: string;
  GOOGLE_CLIENT_ID?: string | undefined;
  GOOGLE_CLIENT_SECRET?: string | undefined;
  GOOGLE_REDIRECT_URI?: string | undefined;
  MONGODB_URI?: string | undefined;
  SUPABASE_URL?: string | undefined;
  SUPABASE_BUCKET?: string | undefined;
  SUPABASE_SECRET_KEY?: string | undefined;
  LOG_LEVEL: LogLevel;
}>;
