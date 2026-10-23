import { z } from "zod";
import type { ValidatedApiEnvironment } from "../types/index.js";

const localLoopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);

const normalizeHost = (host: string): string => host.toLowerCase().replace(/^\[|\]$/g, "");

const isLoopbackHost = (host: string): boolean => localLoopbackHosts.has(normalizeHost(host));

const isLocalWebOrigin = (origin: string): boolean => {
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      url.origin === origin &&
      isLoopbackHost(url.hostname);
  } catch {
    return false;
  }
};

const isSupabaseProjectUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value && url.pathname === "/" &&
      url.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
};

export const apiEnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  API_HOST: z.string().refine(isLoopbackHost, "API_HOST must be localhost or a loopback address."),
  API_PORT: z.coerce.number().int().min(1).max(65_535),
  WEB_ORIGIN: z.url().refine(isLocalWebOrigin, "WEB_ORIGIN must be an exact localhost or loopback origin."),
  MONGODB_URI: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]),
  SUPABASE_URL: z.url().refine(isSupabaseProjectUrl).optional(),
  SUPABASE_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/u).optional(),
  SUPABASE_SECRET_KEY: z.string().min(1).optional()
}).refine(({ NODE_ENV }) => NODE_ENV !== "production", {
  path: ["NODE_ENV"],
  message: "Production mode is not supported by the local-only demo."
}).refine(({ SUPABASE_URL, SUPABASE_BUCKET, SUPABASE_SECRET_KEY }) => {
  const configuredCount = [SUPABASE_URL, SUPABASE_BUCKET, SUPABASE_SECRET_KEY].filter((value) => value !== undefined).length;
  return configuredCount === 0 || configuredCount === 3;
}, {
  path: ["SUPABASE_URL"],
  message: "Supabase URL, bucket, and server secret must be configured together."
}) satisfies z.ZodType<ValidatedApiEnvironment>;

export const validateApiEnvironment = (input: unknown): ValidatedApiEnvironment =>
  Object.freeze(apiEnvironmentSchema.parse(input));
