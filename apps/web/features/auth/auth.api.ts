export class AuthApiUnavailableError extends Error {
  constructor() {
    super("Authentication is not enabled for this API.");
    this.name = "AuthApiUnavailableError";
  }
}

type AuthApiDependencies = Readonly<{
  baseUrl: string;
  fetchImpl?: typeof fetch;
}>;

const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const payload: unknown = await response.json();
    if (typeof payload === "object" && payload !== null && "error" in payload) {
      const apiError = payload.error;
      if (
        typeof apiError === "object" &&
        apiError !== null &&
        "message" in apiError &&
        typeof apiError.message === "string"
      ) return apiError.message;
    }
  } catch {
    return "The authentication request could not be completed.";
  }
  return "The authentication request could not be completed.";
};

export const createAuthApi = ({ baseUrl, fetchImpl = fetch }: AuthApiDependencies) => {
  const apiBaseUrl = baseUrl.replace(/\/$/u, "");

  return Object.freeze({
    loginUrl: `${apiBaseUrl}/auth/google/login`,
    currentUser: async (): Promise<boolean> => {
      let response: Response;
      try {
        response = await fetchImpl(`${apiBaseUrl}/auth/me`, {
          credentials: "include",
          cache: "no-store"
        });
      } catch {
        throw new Error("The authentication API is unavailable.");
      }
      if (response.status === 401) return false;
      if (response.status === 404) throw new AuthApiUnavailableError();
      if (!response.ok) throw new Error(await readErrorMessage(response));
      const payload: unknown = await response.json();
      if (
        typeof payload === "object" &&
        payload !== null &&
        "authenticated" in payload &&
        payload.authenticated === true
      ) return true;
      throw new Error("The authentication API returned an invalid status.");
    },
    logout: async (): Promise<void> => {
      let response: Response;
      try {
        response = await fetchImpl(`${apiBaseUrl}/auth/logout`, {
          method: "POST",
          credentials: "include"
        });
      } catch {
        throw new Error("The authentication API is unavailable.");
      }
      if (!response.ok) throw new Error(await readErrorMessage(response));
    }
  });
};

export type AuthApi = ReturnType<typeof createAuthApi>;
