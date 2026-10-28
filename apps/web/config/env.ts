import {
  validateWebEnvironment
} from "@/validation/env.validation";
import type { ValidatedWebEnvironment, WebEnvironmentSource } from "@/types";

export const readWebEnvironment = (
  source: WebEnvironmentSource = process.env
): ValidatedWebEnvironment => {
  const configuredApiBaseUrl = source.NEXT_PUBLIC_API_BASE_URL;
  const useSameOriginApi = source.NODE_ENV === "production" || source.VERCEL === "1";

  return validateWebEnvironment({
    NEXT_PUBLIC_API_BASE_URL: configuredApiBaseUrl?.trim()
      ? configuredApiBaseUrl
      : useSameOriginApi
        ? "/"
        : undefined
  });
};
