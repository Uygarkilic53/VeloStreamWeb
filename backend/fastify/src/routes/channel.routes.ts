import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { createChannelController } from "../controllers/channel.controller.js";
import type { ControllerDeps } from "../controllers/context.js";
import {
  rotateStreamKeyRouteSchema,
  updateChannelRouteSchema,
} from "../docs/openapi-schemas.js";

export async function registerChannelRoutes(
  app: FastifyInstance,
  deps: ControllerDeps,
  requireAuth: preHandlerHookHandler,
): Promise<void> {
  const controller = createChannelController(deps);

  app.patch(
    "/api/v1/channels/me",
    { preHandler: requireAuth, schema: updateChannelRouteSchema },
    controller.updateSettings,
  );
  app.post(
    "/api/v1/channels/me/stream-key/rotate",
    { preHandler: requireAuth, schema: rotateStreamKeyRouteSchema },
    controller.rotateStreamKey,
  );
}
