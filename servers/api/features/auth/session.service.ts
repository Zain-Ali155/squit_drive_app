import type { AuthRepository } from "./integrations/auth.mongodb.integration.js";
import type { ValidatedSession } from "./session-principal.js";

type SessionServiceDependencies = Readonly<{
  repository: AuthRepository;
  now?: () => Date;
}>;

export const createSessionService = ({
  repository,
  now = () => new Date()
}: SessionServiceDependencies) => Object.freeze({
  revokeCurrentSession: async (session: ValidatedSession | null): Promise<void> => {
    if (!session) return;
    await repository.revokeSession(session.tokenHash, now());
  }
});
