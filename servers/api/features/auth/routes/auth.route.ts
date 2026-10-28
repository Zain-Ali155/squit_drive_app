import { Router } from "express";
import type { ApiEnvironment } from "@workspace/types";
import { createRateLimitMiddleware, createTrustedOriginGuard } from "../../../middleware/index.js";
import { createAuthController, type AuthControllerDependencies } from "../auth.controller.js";

type AuthRouteDependencies = AuthControllerDependencies & Readonly<{
  environment: ApiEnvironment;
}>;

export const createAuthRoutes = (dependencies: AuthRouteDependencies): Router => {
  const router = Router();
  const controller = createAuthController(dependencies);
  const trustedOrigin = createTrustedOriginGuard({
    origin: dependencies.origin,
    environment: dependencies.environment
  });
  const loginRateLimit = createRateLimitMiddleware({ maxRequests: 10, windowMs: 15 * 60 * 1_000 });

  router.get("/auth/google/login", loginRateLimit, controller.googleLogin);
  router.get("/auth/me", controller.currentUser);
  router.get("/auth/google/callback", controller.googleCallback);
  router.post("/auth/logout", trustedOrigin, controller.logout);

  return router;
};
