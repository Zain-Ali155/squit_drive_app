import type { ApiConfiguration, ValidatedWebEnvironment } from "@/types";

const localHosts = new Set(["localhost", "127.0.0.1"]);

export const createApiConfiguration = (
  environment: ValidatedWebEnvironment
): ApiConfiguration => Object.freeze({
  baseUrl: environment.NEXT_PUBLIC_API_BASE_URL
});

export const resolveBrowserApiBaseUrl = (
  configuredBaseUrl: string,
  browserHostname?: string
): string => {
  const hostname = browserHostname ?? (typeof window === "undefined" ? undefined : window.location.hostname);
  if (!hostname || !localHosts.has(hostname.toLowerCase())) return configuredBaseUrl;

  try {
    const apiUrl = new URL(configuredBaseUrl);
    if (localHosts.has(apiUrl.hostname.toLowerCase())) apiUrl.hostname = hostname.toLowerCase();
    return apiUrl.toString().replace(/\/$/u, "");
  } catch {
    return configuredBaseUrl;
  }
};
