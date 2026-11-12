import type { FastifyRequest } from "fastify";
import type { MediaStorageService } from "../lib/cloudinary.js";
import { HttpApiError } from "../lib/errors.js";
import type { EventPublisher } from "../lib/events.js";
import type { AsymmetricJwtService } from "../lib/jwt.js";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import type { CoreModels } from "../models/index.js";

export interface ControllerDeps {
  models?: CoreModels;
  jwtService?: AsymmetricJwtService;
  events?: EventPublisher;
  mediaStorage?: MediaStorageService;
  accessTokenTtl: string;
  refreshTokenTtlDays: number;
}

export function requireModels(models?: CoreModels): CoreModels {
  if (!models) {
    throw new HttpApiError(
      503,
      "DATABASE_UNCONFIGURED",
      "PostgreSQL database is not configured. Check DATABASE_URL in backend/fastify/.env.",
    );
  }
  return models;
}

export function requireJwtService(jwtService?: AsymmetricJwtService): AsymmetricJwtService {
  if (!jwtService) {
    throw new HttpApiError(
      503,
      "AUTH_UNCONFIGURED",
      "Asymmetric JWT keys are not configured on this instance.",
    );
  }
  return jwtService;
}

export function requireAuthUser(request: FastifyRequest): AuthenticatedUser {
  if (!request.authUser) {
    throw new HttpApiError(401, "UNAUTHORIZED", "Authentication required.");
  }
  return request.authUser;
}

export function requireMediaStorage(mediaStorage?: MediaStorageService): MediaStorageService {
  if (!mediaStorage) {
    throw new HttpApiError(
      503,
      "MEDIA_STORAGE_UNCONFIGURED",
      "Cloudinary media storage is not configured. Check CLOUDINARY_URL in backend/fastify/.env.",
    );
  }
  return mediaStorage;
}
