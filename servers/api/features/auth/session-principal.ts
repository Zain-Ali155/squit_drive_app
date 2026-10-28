import type { Request } from "express";
import type { DrivePrincipal } from "../../types/index.js";
import type { AuthRepository } from "./integrations/auth.mongodb.integration.js";
import { getSessionCookieName } from "./auth.cookies.js";
import { hashSessionToken, isOpaqueSessionToken, type SessionTokenHash } from "./session-token.js";

type SessionPrincipalResolverDependencies = Readonly<{
  repository: AuthRepository;
  cookieSecure: boolean;
  now?: () => Date;
}>;

export type ValidatedSession = Readonly<{
  principal: DrivePrincipal;
  tokenHash: SessionTokenHash;
}>;

const readSessionToken = (request: Request, cookieName: string): string | null => {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;

  const values = cookieHeader.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== cookieName) return [];
    return [part.slice(separator + 1).trim()];
  });
  if (values.length !== 1) return null;
  const token = values[0];
  return token && isOpaqueSessionToken(token) ? token : null;
};

export const createValidatedSessionResolver = ({
  repository,
  cookieSecure,
  now = () => new Date()
}: SessionPrincipalResolverDependencies) => {
  const cookieName = getSessionCookieName(cookieSecure);

  return async (request: Request): Promise<ValidatedSession | null> => {
    const token = readSessionToken(request, cookieName);
    if (!token) return null;

    const at = now();
    const session = await repository.findActiveSession(hashSessionToken(token), at);
    if (
      !session ||
      !Number.isFinite(session.expiresAt.getTime()) ||
      session.expiresAt <= at ||
      session.revokedAt !== undefined ||
      typeof session.ownerId !== "string" ||
      session.ownerId.trim().length === 0
    ) return null;

    const user = await repository.findUserById(session.ownerId);
    if (!user || user._id !== session.ownerId || user._id.trim().length === 0) return null;
    return Object.freeze({
      principal: Object.freeze({ ownerId: user._id, email: user.email }),
      tokenHash: session.tokenHash
    });
  };
};

export const createSessionPrincipalResolver = (
  dependencies: SessionPrincipalResolverDependencies
) => {
  const resolveSession = createValidatedSessionResolver(dependencies);
  return async (request: Request): Promise<DrivePrincipal | null> =>
    (await resolveSession(request))?.principal ?? null;
};
