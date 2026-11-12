import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { ControllerDeps } from "../controllers/context.js";
import { createModerationController } from "../controllers/moderation.controller.js";
import { banUserRouteSchema, unbanUserRouteSchema } from "../docs/openapi-schemas.js";

export async function registerModerationRoutes(
  app: FastifyInstance,
  deps: ControllerDeps,
  requireAuth: preHandlerHookHandler,
): Promise<void> {
  const controller = createModerationController(deps);

  app.post(
    "/api/v1/moderation/bans",
    { preHandler: requireAuth, schema: banUserRouteSchema },
    controller.banUser,
  );
  app.delete(
    "/api/v1/moderation/bans/:username",
    { preHandler: requireAuth, schema: unbanUserRouteSchema },
    controller.unbanUser,
  );
}
