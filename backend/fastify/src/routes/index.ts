import type { FastifyInstance } from "fastify";
import type { ControllerDeps } from "../controllers/context.js";
import { optionalAuthMiddleware, requireAuthMiddleware } from "../middlewares/auth.middleware.js";
import { registerAuthRoutes } from "./auth.routes.js";
import { registerChannelRoutes } from "./channel.routes.js";
import { registerModerationRoutes } from "./moderation.routes.js";
import { registerUserRoutes } from "./user.routes.js";

export async function registerAllRoutes(
  app: FastifyInstance,
  deps: ControllerDeps,
): Promise<void> {
  const requireAuth = requireAuthMiddleware(deps.jwtService);
  const optionalAuth = optionalAuthMiddleware(deps.jwtService);

  await registerAuthRoutes(app, deps, requireAuth);
  await registerUserRoutes(app, deps, requireAuth, optionalAuth);
  await registerChannelRoutes(app, deps, requireAuth, optionalAuth);
  await registerModerationRoutes(app, deps, requireAuth);
}
