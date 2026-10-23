import type { LogLevel } from "@workspace/logging";
import type { ApiEnvironment } from "@workspace/types";

export type ApiConfig = Readonly<{
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
