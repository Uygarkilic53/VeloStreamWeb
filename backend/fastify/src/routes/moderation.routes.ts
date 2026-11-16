import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { ControllerDeps } from "../controllers/context.js";
import { createModerationController } from "../controllers/moderation.controller.js";
import {
  addModeratorRouteSchema,
  banUserRouteSchema,
  listModeratorsRouteSchema,
  listSilencesRouteSchema,
  removeModeratorRouteSchema,
  silenceUserRouteSchema,
  unbanUserRouteSchema,
  unsilenceUserRouteSchema,
  warnUserRouteSchema,
} from "../docs/openapi-schemas.js";

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

  app.get(
    "/api/v1/moderation/moderators",
    { preHandler: requireAuth, schema: listModeratorsRouteSchema },
    controller.listModerators,
  );
  app.post(
    "/api/v1/moderation/moderators",
    { preHandler: requireAuth, schema: addModeratorRouteSchema },
    controller.addModerator,
  );
  app.delete(
    "/api/v1/moderation/moderators/:username",
    { preHandler: requireAuth, schema: removeModeratorRouteSchema },
    controller.removeModerator,
  );

  app.get(
    "/api/v1/moderation/silences",
    { preHandler: requireAuth, schema: listSilencesRouteSchema },
    controller.listSilences,
  );
  app.post(
    "/api/v1/moderation/silences",
    { preHandler: requireAuth, schema: silenceUserRouteSchema },
    controller.silenceUser,
  );
  app.delete(
    "/api/v1/moderation/silences/:username",
    { preHandler: requireAuth, schema: unsilenceUserRouteSchema },
    controller.unsilenceUser,
  );

  app.post(
    "/api/v1/moderation/warnings",
    { preHandler: requireAuth, schema: warnUserRouteSchema },
    controller.warnUser,
  );
}
