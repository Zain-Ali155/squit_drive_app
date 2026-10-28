import type { LogLevel } from "@workspace/logging";
import type { ApiEnvironment } from "@workspace/types";

type ApiConfigBase = Readonly<{
  environment: ApiEnvironment;
  host: string;
  port: number;
  webOrigin: string;
  mongodbUri?: string;
  supabaseUrl?: string;
  supabaseBucket?: string;
  supabaseSecretKey?: string;
  logLevel: LogLevel;
}>;

export type ApiConfig = ApiConfigBase & (
  | Readonly<{ authMode: "local-demo" }>
  | Readonly<{
    authMode: "google";
    mongodbUri: string;
    googleClientId: string;
    googleClientSecret: string;
    googleRedirectUri: string;
  }>
);
