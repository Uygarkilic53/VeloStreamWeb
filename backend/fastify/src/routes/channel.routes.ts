import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { createChannelController } from "../controllers/channel.controller.js";
import type { ControllerDeps } from "../controllers/context.js";
import {
  getLiveChannelsRouteSchema,
  rotateStreamKeyRouteSchema,
  setChannelLiveRouteSchema,
  updateChannelRouteSchema,
} from "../docs/openapi-schemas.js";

export async function registerChannelRoutes(
  app: FastifyInstance,
  deps: ControllerDeps,
  requireAuth: preHandlerHookHandler,
  optionalAuth?: preHandlerHookHandler,
): Promise<void> {
  const controller = createChannelController(deps);

  app.get(
    "/api/v1/channels/live",
    {
      ...(optionalAuth ? { preHandler: optionalAuth } : {}),
      schema: getLiveChannelsRouteSchema,
    },
    controller.getLiveChannels,
  );
  app.patch(
    "/api/v1/channels/me",
    { preHandler: requireAuth, schema: updateChannelRouteSchema },
    controller.updateSettings,
  );
  app.post(
    "/api/v1/channels/me/live",
    { preHandler: requireAuth, schema: setChannelLiveRouteSchema },
    controller.setLiveStatus,
  );
  app.post(
    "/api/v1/channels/me/stream-key/rotate",
    { preHandler: requireAuth, schema: rotateStreamKeyRouteSchema },
    controller.rotateStreamKey,
  );
}
