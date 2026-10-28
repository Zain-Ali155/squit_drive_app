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

const isGoogleRedirectUri = (value: string): boolean => {
  try {
    const url = new URL(value);
    const isLoopbackHttp = url.protocol === "http:" && isLoopbackHost(url.hostname);
    return (url.protocol === "https:" || isLoopbackHttp) &&
      url.href === value &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.search.length === 0 &&
      url.hash.length === 0 &&
      url.pathname === "/auth/google/callback";
  } catch {
    return false;
  }
};

export const apiEnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  AUTH_MODE: z.enum(["local-demo", "google"]),
  API_HOST: z.string().refine(isLoopbackHost, "API_HOST must be localhost or a loopback address."),
  API_PORT: z.coerce.number().int().min(1).max(65_535),
  WEB_ORIGIN: z.url().refine(isLocalWebOrigin, "WEB_ORIGIN must be an exact localhost or loopback origin."),
  GOOGLE_CLIENT_ID: z.string().min(1).max(512).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).max(512).optional(),
  GOOGLE_REDIRECT_URI: z.string().refine(isGoogleRedirectUri, "GOOGLE_REDIRECT_URI must be a secure Google callback URL.").optional(),
  MONGODB_URI: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]),
  SUPABASE_URL: z.url().refine(isSupabaseProjectUrl).optional(),
  SUPABASE_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/u).optional(),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
}).refine(({ NODE_ENV }) => NODE_ENV !== "production", {
  path: ["NODE_ENV"],
  message: "Production mode is not supported by the local-only demo."
}).refine(({ SUPABASE_URL, SUPABASE_BUCKET, SUPABASE_SECRET_KEY }) => {
  const configuredCount = [SUPABASE_URL, SUPABASE_BUCKET, SUPABASE_SECRET_KEY].filter((value) => value !== undefined).length;
  return configuredCount === 0 || configuredCount === 3;
}, {
  path: ["SUPABASE_URL"],
  message: "Supabase URL, bucket, and server secret must be configured together."
}).refine(({ AUTH_MODE, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, MONGODB_URI }) => {
  if (AUTH_MODE === "google") {
    return GOOGLE_CLIENT_ID !== undefined && GOOGLE_CLIENT_SECRET !== undefined &&
      GOOGLE_REDIRECT_URI !== undefined && MONGODB_URI !== undefined;
  }
  return GOOGLE_CLIENT_ID === undefined && GOOGLE_CLIENT_SECRET === undefined &&
    GOOGLE_REDIRECT_URI === undefined;
}, {
  path: ["AUTH_MODE"],
  message: "Google authentication requires complete Google credentials and MongoDB; local-demo mode must not include Google credentials."
}) satisfies z.ZodType<ValidatedApiEnvironment>;

export const validateApiEnvironment = (input: unknown): ValidatedApiEnvironment =>
  Object.freeze(apiEnvironmentSchema.parse(input));
