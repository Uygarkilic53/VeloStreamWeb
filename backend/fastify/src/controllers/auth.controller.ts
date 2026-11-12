import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpApiError, parseSchema } from "../lib/errors.js";
import type { AsymmetricJwtService } from "../lib/jwt.js";
import {
  generateOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  verifyDummyPassword,
  verifyPassword,
} from "../lib/password.js";
import { generateStreamKey } from "../lib/stream-key.js";
import type { AccountProfileView, CoreModels } from "../models/index.js";
import {
  ChangePasswordBodySchema,
  LoginBodySchema,
  LogoutBodySchema,
  RefreshBodySchema,
  RegisterBodySchema,
} from "../schemas/auth.schema.js";
import {
  requireAuthUser,
  requireJwtService,
  requireModels,
  type ControllerDeps,
} from "./context.js";

export function parseTtlToSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!match) {
    return 900;
  }
  const amount = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case "s":
      return amount;
    case "m":
      return amount * 60;
    case "h":
      return amount * 3600;
    case "d":
      return amount * 86400;
    default:
      return 900;
  }
}

async function issueSessionPayload(
  models: CoreModels,
  jwtService: AsymmetricJwtService,
  profile: AccountProfileView,
  options: { rememberMe: boolean; accessTokenTtl: string; refreshTokenTtlDays: number },
) {
  const accessToken = await jwtService.signAccessToken(
    {
      sub: profile.id,
      username: profile.username,
      role: profile.role,
    },
    options.accessTokenTtl,
  );

  const rawRefreshToken = generateOpaqueToken();
  const ttlMs = (options.rememberMe ? options.refreshTokenTtlDays : 1) * 24 * 60 * 60 * 1000;
  await models.refreshTokens.create({
    userId: profile.id,
    tokenHash: hashOpaqueToken(rawRefreshToken),
    rememberMe: options.rememberMe,
    expiresAt: new Date(Date.now() + ttlMs),
  });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    expiresIn: parseTtlToSeconds(options.accessTokenTtl),
    tokenType: "Bearer" as const,
    user: profile,
  };
}

export function createAuthController(deps: ControllerDeps) {
  return {
    async register(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const jwtService = requireJwtService(deps.jwtService);
      const { username, email, password, displayName, rememberSession } = parseSchema(
        RegisterBodySchema,
        request.body ?? {},
      );

      const passwordHash = await hashPassword(password);
      const streamKey = generateStreamKey("live");

      const profile = await models.users.createWithChannel({
        username,
        displayName: displayName ?? username,
        email,
        passwordHash,
        streamKey,
        channelTitle: `${displayName ?? username}'s live broadcast`,
        channelCategory: "Programming",
        role: "USER",
      });

      const session = await issueSessionPayload(models, jwtService, profile, {
        rememberMe: rememberSession,
        accessTokenTtl: deps.accessTokenTtl,
        refreshTokenTtlDays: deps.refreshTokenTtlDays,
      });

      return reply.code(201).send({
        ...session,
        message: "Account created successfully.",
      });
    },

    async login(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const jwtService = requireJwtService(deps.jwtService);
      const { identifier, password, rememberSession } = parseSchema(
        LoginBodySchema,
        request.body ?? {},
      );

      const user = await models.users.findByIdentifier(identifier);
      if (!user) {
        await verifyDummyPassword(password);
        throw new HttpApiError(401, "INVALID_CREDENTIALS", "Invalid username/email or password.");
      }

      const passwordValid = await verifyPassword(password, user.passwordHash);
      if (!passwordValid) {
        throw new HttpApiError(401, "INVALID_CREDENTIALS", "Invalid username/email or password.");
      }

      const profile = await models.users.findProfileById(user.id);
      if (!profile) {
        throw new HttpApiError(401, "UNAUTHORIZED", "Account not found.");
      }

      const session = await issueSessionPayload(models, jwtService, profile, {
        rememberMe: rememberSession,
        accessTokenTtl: deps.accessTokenTtl,
        refreshTokenTtlDays: deps.refreshTokenTtlDays,
      });

      return reply.code(200).send({
        ...session,
        message: "Signed in successfully.",
      });
    },

    async refresh(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const jwtService = requireJwtService(deps.jwtService);
      const { refreshToken } = parseSchema(RefreshBodySchema, request.body ?? {});

      const existing = await models.refreshTokens.findByHash(hashOpaqueToken(refreshToken));
      if (!existing) {
        throw new HttpApiError(401, "INVALID_REFRESH_TOKEN", "Refresh session is invalid.");
      }

      if (existing.revokedAt !== null) {
        await models.refreshTokens.revokeAllForUser(existing.userId);
        throw new HttpApiError(
          401,
          "REFRESH_TOKEN_REUSED",
          "Session has been revoked for security. Please sign in again.",
        );
      }

      if (existing.expiresAt.getTime() <= Date.now()) {
        await models.refreshTokens.revokeById(existing.id);
        throw new HttpApiError(401, "REFRESH_TOKEN_EXPIRED", "Session expired. Please sign in again.");
      }

      await models.refreshTokens.revokeById(existing.id);

      const profile = await models.users.findProfileById(existing.userId);
      if (!profile) {
        throw new HttpApiError(401, "UNAUTHORIZED", "Account no longer exists.");
      }

      const session = await issueSessionPayload(models, jwtService, profile, {
        rememberMe: existing.rememberMe,
        accessTokenTtl: deps.accessTokenTtl,
        refreshTokenTtlDays: deps.refreshTokenTtlDays,
      });

      return reply.code(200).send({
        ...session,
        message: "Session refreshed.",
      });
    },

    async logout(request: FastifyRequest, reply: FastifyReply) {
      const { refreshToken } = parseSchema(LogoutBodySchema, request.body ?? {});
      if (deps.models && refreshToken) {
        await deps.models.refreshTokens.revokeByHash(hashOpaqueToken(refreshToken));
      }
      return reply.code(200).send({
        ok: true,
        message: "Logged out successfully.",
      });
    },

    async me(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const authUser = requireAuthUser(request);

      const profile = await models.users.findProfileById(authUser.id);
      if (!profile) {
        throw new HttpApiError(401, "UNAUTHORIZED", "Account not found.");
      }

      return reply.code(200).send({ user: profile });
    },

    async changePassword(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const authUser = requireAuthUser(request);
      const { currentPassword, newPassword } = parseSchema(
        ChangePasswordBodySchema,
        request.body ?? {},
      );

      const user = await models.users.findById(authUser.id);
      if (!user) {
        throw new HttpApiError(401, "UNAUTHORIZED", "Account not found.");
      }

      const matches = await verifyPassword(currentPassword, user.passwordHash);
      if (!matches) {
        throw new HttpApiError(401, "INVALID_CREDENTIALS", "Current password is incorrect.", {
          currentPassword: ["Current password is incorrect."],
        });
      }

      const nextHash = await hashPassword(newPassword);
      await models.users.updatePasswordHash(user.id, nextHash);

      return reply.code(200).send({ ok: true, message: "Password updated." });
    },

    async getJwks(_request: FastifyRequest, reply: FastifyReply) {
      if (!deps.jwtService) {
        return reply.code(503).send({
          error: "JWKS_UNCONFIGURED",
          message: "Asymmetric JWT keys are not configured on this instance",
        });
      }
      const jwks = await deps.jwtService.getPublicJwks();
      return reply.code(200).send(jwks);
    },
  };
}
