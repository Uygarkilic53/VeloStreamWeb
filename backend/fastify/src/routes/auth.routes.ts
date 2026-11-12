import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { createAuthController } from "../controllers/auth.controller.js";
import type { ControllerDeps } from "../controllers/context.js";
import {
  changePasswordRouteSchema,
  jwksRouteSchema,
  loginRouteSchema,
  logoutRouteSchema,
  meRouteSchema,
  refreshRouteSchema,
  registerRouteSchema,
} from "../docs/openapi-schemas.js";

export async function registerAuthRoutes(
  app: FastifyInstance,
  deps: ControllerDeps,
  requireAuth: preHandlerHookHandler,
): Promise<void> {
  const controller = createAuthController(deps);

  app.get("/.well-known/jwks.json", { schema: jwksRouteSchema }, controller.getJwks);
  app.post("/api/v1/auth/register", { schema: registerRouteSchema }, controller.register);
  app.post("/api/v1/auth/login", { schema: loginRouteSchema }, controller.login);
  app.post("/api/v1/auth/refresh", { schema: refreshRouteSchema }, controller.refresh);
  app.post("/api/v1/auth/logout", { schema: logoutRouteSchema }, controller.logout);
  app.get("/api/v1/auth/me", { preHandler: requireAuth, schema: meRouteSchema }, controller.me);
  app.patch(
    "/api/v1/auth/password",
    { preHandler: requireAuth, schema: changePasswordRouteSchema },
    controller.changePassword,
  );
}
