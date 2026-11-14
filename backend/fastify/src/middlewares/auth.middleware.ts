import type { FastifyRequest, preHandlerHookHandler } from "fastify";
import { HttpApiError } from "../lib/errors.js";
import type { AsymmetricJwtService } from "../lib/jwt.js";

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: string;
}

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthenticatedUser;
  }
}

export function extractBearerToken(request: FastifyRequest): string | null {
  const rawHeader = request.headers.authorization;
  if (!rawHeader || typeof rawHeader !== "string") {
    return null;
  }
  const trimmed = rawHeader.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = trimmed.slice(7).trim();
  return token.length > 0 ? token : null;
}

export function requireAuthMiddleware(jwtService?: AsymmetricJwtService): preHandlerHookHandler {
  return async function requireAuth(request: FastifyRequest): Promise<void> {
    if (!jwtService) {
      throw new HttpApiError(
        503,
        "AUTH_UNCONFIGURED",
        "Asymmetric JWT keys are not configured on this instance.",
      );
    }

    const token = extractBearerToken(request);
    if (!token) {
      throw new HttpApiError(401, "UNAUTHORIZED", "Authentication required.");
    }

    try {
      const claims = await jwtService.verifyAccessToken(token);
      request.authUser = {
        id: claims.sub,
        username: claims.username,
        role: claims.role,
      };
    } catch {
      throw new HttpApiError(401, "INVALID_TOKEN", "Session expired or token is invalid.");
    }
  };
}

export function optionalAuthMiddleware(jwtService?: AsymmetricJwtService): preHandlerHookHandler {
  return async function optionalAuth(request: FastifyRequest): Promise<void> {
    if (!jwtService) {
      return;
    }

    const token = extractBearerToken(request);
    if (!token) {
      return;
    }

    try {
      const claims = await jwtService.verifyAccessToken(token);
      request.authUser = {
        id: claims.sub,
        username: claims.username,
        role: claims.role,
      };
    } catch {
      // Ignore expired or invalid tokens on public routes.
    }
  };
}
