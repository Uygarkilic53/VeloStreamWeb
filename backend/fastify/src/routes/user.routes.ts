import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { ControllerDeps } from "../controllers/context.js";
import { createUserController } from "../controllers/user.controller.js";
import {
  deleteAvatarRouteSchema,
  followChannelRouteSchema,
  getFollowingUsersRouteSchema,
  publicUserProfileRouteSchema,
  searchUsersRouteSchema,
  unfollowChannelRouteSchema,
  updateProfileRouteSchema,
  updateThemeRouteSchema,
  uploadAvatarRouteSchema,
} from "../docs/openapi-schemas.js";

export async function registerUserRoutes(
  app: FastifyInstance,
  deps: ControllerDeps,
  requireAuth: preHandlerHookHandler,
  optionalAuth?: preHandlerHookHandler,
): Promise<void> {
  const controller = createUserController(deps);

  app.get(
    "/api/v1/users/search",
    {
      ...(optionalAuth ? { preHandler: optionalAuth } : {}),
      schema: searchUsersRouteSchema,
    },
    controller.searchUsers,
  );
  app.get(
    "/api/v1/users/:username",
    {
      ...(optionalAuth ? { preHandler: optionalAuth } : {}),
      schema: publicUserProfileRouteSchema,
    },
    controller.getPublicProfile,
  );

  app.get(
    "/api/v1/users/me/following",
    { preHandler: requireAuth, schema: getFollowingUsersRouteSchema },
    controller.getFollowingUsers,
  );
  app.patch(
    "/api/v1/users/me",
    { preHandler: requireAuth, schema: updateProfileRouteSchema },
    controller.updateProfile,
  );
  app.patch(
    "/api/v1/users/me/theme",
    { preHandler: requireAuth, schema: updateThemeRouteSchema },
    controller.updateTheme,
  );
  app.post(
    "/api/v1/users/me/avatar",
    { preHandler: requireAuth, schema: uploadAvatarRouteSchema },
    controller.uploadAvatar,
  );
  app.delete(
    "/api/v1/users/me/avatar",
    { preHandler: requireAuth, schema: deleteAvatarRouteSchema },
    controller.deleteAvatar,
  );
  app.post(
    "/api/v1/users/me/follows/:slug",
    { preHandler: requireAuth, schema: followChannelRouteSchema },
    controller.followChannel,
  );
  app.delete(
    "/api/v1/users/me/follows/:slug",
    { preHandler: requireAuth, schema: unfollowChannelRouteSchema },
    controller.unfollowChannel,
  );
}
