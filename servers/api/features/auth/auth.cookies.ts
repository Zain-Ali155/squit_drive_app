import type { CookieOptions } from "express";
import { hashOAuthValue } from "./session-token.js";

export const oauthBindingCookiePath = "/auth/google/callback";

const oauthFlowCookieSuffix = (state?: string): string =>
  state && /^[A-Za-z0-9_-]{43}$/u.test(state) ? `_${hashOAuthValue(state)}` : "";

export const getOAuthBindingCookieName = (secure: boolean, state?: string): string =>
  `${secure ? "__Secure-squid_oauth_binding" : "squid_oauth_binding"}${oauthFlowCookieSuffix(state)}`;

export const getOAuthPkceCookieName = (secure: boolean, state?: string): string =>
  `${secure ? "__Secure-squid_oauth_pkce" : "squid_oauth_pkce"}${oauthFlowCookieSuffix(state)}`;

export const getSessionCookieName = (secure: boolean): string =>
  secure ? "__Host-squid_session" : "squid_session";

export const getOAuthBindingCookieOptions = (secure: boolean): CookieOptions => ({
  httpOnly: true,
  secure,
  sameSite: "lax",
  path: oauthBindingCookiePath
});

export const getOAuthPkceCookieOptions = (secure: boolean): CookieOptions => ({
  httpOnly: true,
  secure,
  sameSite: "lax",
  path: oauthBindingCookiePath
});

export const getSessionCookieOptions = (secure: boolean): CookieOptions => ({
  httpOnly: true,
  secure,
  sameSite: "lax",
  path: "/"
});
