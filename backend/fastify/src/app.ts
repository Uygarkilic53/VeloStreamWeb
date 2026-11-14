import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, {
  LogController,
  type FastifyInstance,
  type FastifyLoggerOptions,
} from "fastify";
import { MAX_AVATAR_BYTES, type MediaStorageService } from "./lib/cloudinary.js";
import { HttpApiError, sendApiError } from "./lib/errors.js";
import type { EventPublisher } from "./lib/events.js";
import { AsymmetricJwtService } from "./lib/jwt.js";
import { createFastifyLoggerOptions } from "./lib/logger.js";
import {
  RecordNotFoundError,
  UniqueConstraintError,
  type CoreModels,
} from "./models/index.js";
import { registerAllRoutes } from "./routes/index.js";

export interface BuildAppOptions {
  corsOrigin?: string;
  logger?: boolean | FastifyLoggerOptions;
  disableRequestLogging?: boolean;
  jwtService?: AsymmetricJwtService;
  models?: CoreModels;
  events?: EventPublisher;
  mediaStorage?: MediaStorageService;
  accessTokenTtl?: string;
  refreshTokenTtlDays?: number;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const loggerConfig =
    options.logger === true ? createFastifyLoggerOptions() : (options.logger ?? false);

  const app = Fastify({
    logger: loggerConfig,
    // Suppress Fastify's verbose two-line JSON request logs; the onResponse hook below logs one concise line.
    logController: new LogController({ disableRequestLogging: true }),
  });

  if (loggerConfig && !options.disableRequestLogging) {
    app.addHook("onResponse", (request, reply, done) => {
      if (request.method === "OPTIONS" && reply.statusCode < 400) {
        done();
        return;
      }

      const durationMs = Math.round(reply.elapsedTime);
      const summary = `${request.method} ${request.url} -> ${reply.statusCode} (${durationMs}ms)`;

      if (reply.statusCode >= 500) {
        request.log.error(summary);
      } else if (reply.statusCode >= 400) {
        request.log.warn(summary);
      } else {
        request.log.info(summary);
      }

      done();
    });
  }

  // Zod schemas inside controllers own request validation & structured fieldErrors.
  // Keep Fastify's built-in schema compiler pass-through so OpenAPI route schemas
  // populate Swagger documentation without intercepting Zod validation errors.
  app.setValidatorCompiler(() => () => true);

  await app.register(cors, {
    origin: options.corsOrigin ?? "http://localhost:5173",
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  });

  await app.register(multipart, {
    limits: {
      fileSize: MAX_AVATAR_BYTES,
      files: 1,
    },
  });

  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "VeloStream Core API (Fastify)",
        description:
          "Authentication, profile & Cloudinary avatar management, channel metadata, and moderation endpoints.",
        version: "0.1.0",
      },
      tags: [
        { name: "Auth", description: "Asymmetric JWT signup, signin, refresh, logout, and JWKS" },
        { name: "Users", description: "User profile, search, avatar upload, and channel follow endpoints" },
        { name: "Channels", description: "Creator channel settings and stream key rotation" },
        { name: "Moderation", description: "Channel ban and unban management" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: false,
    },
  });

  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof HttpApiError) {
      return sendApiError(reply, err.statusCode, err.code, err.message, err.fieldErrors, err.details);
    }

    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE"
    ) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", "Avatar image must be 5 MB or smaller.", {
        avatar: ["Avatar image must be 5 MB or smaller."],
      });
    }

    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "FST_INVALID_MULTIPART_CONTENT_TYPE"
    ) {
      return sendApiError(
        reply,
        400,
        "VALIDATION_ERROR",
        "Request must be multipart/form-data with an image file.",
      );
    }

    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      ((err as { code?: string }).code === "FST_FILES_LIMIT" ||
        (err as { code?: string }).code === "FST_PARTS_LIMIT" ||
        (err as { code?: string }).code === "FST_FIELDS_LIMIT")
    ) {
      return sendApiError(
        reply,
        400,
        "VALIDATION_ERROR",
        "Upload exactly one image file per request.",
        {
          avatar: ["Upload exactly one image file per request."],
        },
      );
    }

    if (err instanceof UniqueConstraintError) {
      const code =
        err.field === "email"
          ? "EMAIL_TAKEN"
          : err.field === "username" || err.field === "slug"
            ? "USERNAME_TAKEN"
            : "CONFLICT";
      return sendApiError(reply, 409, code, err.message, {
        [err.field === "slug" ? "username" : err.field]: [err.message],
      });
    }

    if (err instanceof RecordNotFoundError) {
      const code = err.entity.toUpperCase() === "USER" ? "USER_NOT_FOUND" : "NOT_FOUND";
      return sendApiError(reply, 404, code, err.message);
    }

    if (
      typeof err === "object" &&
      err !== null &&
      "statusCode" in err &&
      (err as { statusCode?: number }).statusCode === 400
    ) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", "Malformed request payload.");
    }

    app.log.error(err);
    return sendApiError(reply, 500, "INTERNAL_SERVER_ERROR", "An unexpected server error occurred.");
  });

  await registerAllRoutes(app, {
    ...(options.models ? { models: options.models } : {}),
    ...(options.jwtService ? { jwtService: options.jwtService } : {}),
    ...(options.events ? { events: options.events } : {}),
    ...(options.mediaStorage ? { mediaStorage: options.mediaStorage } : {}),
    accessTokenTtl: options.accessTokenTtl ?? "15m",
    refreshTokenTtlDays: options.refreshTokenTtlDays ?? 30,
  });

  return app;
}
