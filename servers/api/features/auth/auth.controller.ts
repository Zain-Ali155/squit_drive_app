import type { Request, RequestHandler } from "express";
import type { ApiEnvironment } from "@workspace/types";
import { ERROR_CODES, ERROR_MESSAGES, HTTP_STATUS } from "../../constants/index.js";
import { createApplicationError } from "../../errors/index.js";
import { createPrincipalGuard } from "../../middleware/index.js";
import type { AuthRepository } from "./integrations/auth.mongodb.integration.js";
import type { GoogleOidcProvider } from "./google-oidc.integration.js";
import { createOAuthFlowService } from "./oauth.service.js";
import {
  getOAuthBindingCookieName,
  getOAuthBindingCookieOptions,
  getOAuthPkceCookieName,
  getOAuthPkceCookieOptions,
  getSessionCookieName,
  getSessionCookieOptions
} from "./auth.cookies.js";
import { createSessionService } from "./session.service.js";
import { createValidatedSessionResolver } from "./session-principal.js";

const oauthTransactionLifetimeMs = 10 * 60 * 1000;

export type AuthControllerDependencies = Readonly<{
  repository: AuthRepository;
  provider: GoogleOidcProvider;
  cookieSecure: boolean;
  origin: string;
  redirectUri: string;
  environment: ApiEnvironment;
  now?: () => Date;
}>;

export type AuthController = Readonly<{
  googleLogin: RequestHandler;
  currentUser: RequestHandler;
  googleCallback: RequestHandler;
  logout: RequestHandler;
}>;

const readCookie = (request: Request, name: string): string | null => {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;

  const values = cookieHeader.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) return [];
    return [part.slice(separator + 1).trim()];
  });
  if (values.length !== 1) return null;
  const value = values[0];
  return value && /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : null;
};

const loopbackHosts = new Set(["localhost", "127.0.0.1"]);

const requestHostContext = (
  request: Request,
  origin: string,
  configuredRedirectUri: string,
  environment: AuthControllerDependencies["environment"]
): Readonly<{ callbackUri: string; returnOrigin: string }> | null => {
  const callbackUrl = new URL(configuredRedirectUri);
  const webUrl = new URL(origin);
  const requestHost = request.hostname.toLowerCase();
  const configuredHost = callbackUrl.hostname.toLowerCase();
  const isLoopbackAlias = requestHost !== configuredHost &&
    environment !== "production" &&
    loopbackHosts.has(requestHost) &&
    loopbackHosts.has(configuredHost) &&
    loopbackHosts.has(webUrl.hostname.toLowerCase());
  if (requestHost !== configuredHost && !isLoopbackAlias) {
    return null;
  }
  callbackUrl.hostname = requestHost;
  if (isLoopbackAlias) webUrl.hostname = requestHost;
  return Object.freeze({ callbackUri: callbackUrl.toString(), returnOrigin: webUrl.origin });
};

const queryString = (request: Request, name: string): string | null | undefined => {
  const value: unknown = request.query[name];
  if (typeof value === "string") return value;
  return value === undefined ? null : undefined;
};

export const createAuthController = (dependencies: AuthControllerDependencies): AuthController => {
  const { cookieSecure, now = () => new Date(), repository, origin, redirectUri, environment } = dependencies;
  const service = createOAuthFlowService({ ...dependencies, redirectUri });
  const legacyBindingCookieName = getOAuthBindingCookieName(cookieSecure);
  const legacyPkceCookieName = getOAuthPkceCookieName(cookieSecure);
  const authSessionCookieName = getSessionCookieName(cookieSecure);
  const bindingCookieOptions = getOAuthBindingCookieOptions(cookieSecure);
  const pkceCookieOptions = getOAuthPkceCookieOptions(cookieSecure);
  const sessionCookieOptions = getSessionCookieOptions(cookieSecure);
  const resolveSession = createValidatedSessionResolver(dependencies);
  const resolvePrincipal = createPrincipalGuard(async (request) =>
    (await resolveSession(request))?.principal ?? null
  );
  const sessionService = createSessionService({ repository, now });

  const googleLogin: RequestHandler = (request, response, next): void => {
    const hostContext = requestHostContext(request, origin, redirectUri, environment);
    if (!hostContext) {
      next(createApplicationError({
        code: ERROR_CODES.authenticationFailed,
        message: ERROR_MESSAGES.authenticationFailed,
        status: HTTP_STATUS.badRequest
      }));
      return;
    }
    void service.startLogin(hostContext.callbackUri)
      .then(({ authorizationUrl, state, browserBindingSecret, codeVerifier }) => {
        response.cookie(getOAuthBindingCookieName(cookieSecure, state), browserBindingSecret, {
          ...bindingCookieOptions,
          maxAge: oauthTransactionLifetimeMs
        });
        response.cookie(getOAuthPkceCookieName(cookieSecure, state), codeVerifier, {
          ...pkceCookieOptions,
          maxAge: oauthTransactionLifetimeMs
        });
        response.redirect(authorizationUrl);
      })
      .catch(next);
  };

  const currentUser = resolvePrincipal((_request, response): void => {
    response.status(HTTP_STATUS.ok).json({ authenticated: true });
  });

  const googleCallback: RequestHandler = (request, response, next): void => {
    const hostContext = requestHostContext(request, origin, redirectUri, environment);
    if (!hostContext) {
      next(createApplicationError({
        code: ERROR_CODES.authenticationFailed,
        message: ERROR_MESSAGES.authenticationFailed,
        status: HTTP_STATUS.badRequest
      }));
      return;
    }
    const state = queryString(request, "state");
    const bindingCookieName = getOAuthBindingCookieName(cookieSecure, state ?? undefined);
    const pkceCookieName = getOAuthPkceCookieName(cookieSecure, state ?? undefined);
    void service.completeCallback({
      state,
      code: queryString(request, "code"),
      providerError: queryString(request, "error"),
      browserBindingSecret: readCookie(request, bindingCookieName),
      codeVerifier: readCookie(request, pkceCookieName),
      redirectUri: hostContext.callbackUri
    }).then(({ sessionToken, expiresAt }) => {
      response.clearCookie(bindingCookieName, bindingCookieOptions);
      response.clearCookie(pkceCookieName, pkceCookieOptions);
      const maxAge = Math.max(0, expiresAt.getTime() - now().getTime());
      response.cookie(authSessionCookieName, sessionToken, {
        ...sessionCookieOptions,
        expires: expiresAt,
        maxAge
      });
      response.redirect(new URL("/drive", hostContext.returnOrigin).toString());
    }).catch((error: unknown) => {
      try {
        response.clearCookie(bindingCookieName, bindingCookieOptions);
        response.clearCookie(pkceCookieName, pkceCookieOptions);
      } catch {
        next(error);
        return;
      }
      next(error);
    });
  };

  const logout: RequestHandler = (request, response, next): void => {
    void resolveSession(request)
      .then((session) => sessionService.revokeCurrentSession(session))
      .then(() => {
        response.clearCookie(authSessionCookieName, sessionCookieOptions);
        response.clearCookie(legacyBindingCookieName, bindingCookieOptions);
        response.clearCookie(legacyPkceCookieName, pkceCookieOptions);
        response.status(HTTP_STATUS.noContent).end();
      })
      .catch((error: unknown) => {
        try {
          response.clearCookie(authSessionCookieName, sessionCookieOptions);
          response.clearCookie(legacyBindingCookieName, bindingCookieOptions);
          response.clearCookie(legacyPkceCookieName, pkceCookieOptions);
        } catch {
          next(error);
          return;
        }
        next(error);
      });
  };

  return Object.freeze({ googleLogin, currentUser, googleCallback, logout });
};
