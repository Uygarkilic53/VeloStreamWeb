import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpApiError, parseSchema } from "../lib/errors.js";
import {
  AddModeratorBodySchema,
  BanUserBodySchema,
  BanUsernameParamSchema,
  ModerationQuerySchema,
  ModeratorUsernameParamSchema,
  SilenceUserBodySchema,
  SilenceUsernameParamSchema,
  WarnUserBodySchema,
} from "../schemas/auth.schema.js";
import { requireAuthUser, requireModels, type ControllerDeps } from "./context.js";

function handleModerationDomainError(err: unknown): never {
  if (err instanceof HttpApiError) {
    throw err;
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes("cannot be added") ||
    msg.includes("cannot silence yourself") ||
    msg.includes("cannot warn yourself") ||
    msg.includes("cannot ban your own")
  ) {
    throw new HttpApiError(400, "INVALID_MODERATION_TARGET", msg);
  }
  if (
    msg.includes("permission") ||
    msg.includes("cannot silence") ||
    msg.includes("cannot warn") ||
    msg.includes("cannot ban") ||
    msg.includes("cannot modify") ||
    msg.includes("cannot unsilence")
  ) {
    throw new HttpApiError(403, "MODERATION_FORBIDDEN", msg);
  }
  throw err;
}

export function createModerationController(deps: ControllerDeps) {
  return {
    async banUser(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const authUser = requireAuthUser(request);
      const data = parseSchema(BanUserBodySchema, request.body ?? {});

      const targetUsername = data.username.trim().replace(/^@/, "");
      if (targetUsername.toLowerCase() === authUser.username.toLowerCase()) {
        throw new HttpApiError(400, "SELF_BAN_FORBIDDEN", "You cannot ban your own channel account.", {
          username: ["You cannot ban your own channel account."],
        });
      }

      try {
        const result = await models.channels.banUserByUsername({
          ownerId: authUser.id,
          targetUsername: data.username,
          reason: data.reason,
          channelSlugOrOwnerId: data.channelSlug || authUser.id,
        });

        if (deps.events) {
          await deps.events.publishModerationBan({
            channelId: result.channelId,
            userId: result.targetUserId,
            reason: result.ban.reason,
            bannedAt: result.ban.bannedAt,
          });
        }

        return reply.code(201).send({
          ban: result.ban,
          message: `@${result.ban.username} added to channel ban list.`,
        });
      } catch (err) {
        handleModerationDomainError(err);
      }
    },

    async unbanUser(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const authUser = requireAuthUser(request);
      const { username } = parseSchema(BanUsernameParamSchema, request.params ?? {});
      const query = parseSchema(ModerationQuerySchema, request.query ?? {});

      try {
        const targetUser = await models.users.findByIdentifier(username).catch(() => null);

        const removed = await models.channels.unbanUserByUsername(
          authUser.id,
          username,
          query.channelSlug || authUser.id,
        );
        if (!removed) {
          throw new HttpApiError(404, "BAN_NOT_FOUND", `No active ban found for @${username}.`);
        }

        const targetSlug = query.channelSlug || authUser.username;
        if (deps.events?.publishModerationUnban) {
          await deps.events.publishModerationUnban({
            channelId: targetSlug,
            channelSlug: targetSlug,
            userId: targetUser?.id || "",
            username: targetUser?.username || username,
          });
        }

        return reply.code(200).send({
          ok: true,
          username,
          message: `Unbanned @${username}.`,
        });
      } catch (err) {
        handleModerationDomainError(err);
      }
    },

    async listModerators(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const authUser = requireAuthUser(request);
      const query = parseSchema(ModerationQuerySchema, request.query ?? {});

      const moderators = await models.channels.listModerators(query.channelSlug || authUser.id);
      return reply.code(200).send({ moderators });
    },

    async addModerator(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const authUser = requireAuthUser(request);
      const data = parseSchema(AddModeratorBodySchema, request.body ?? {});

      const targetUsername = data.username.trim().replace(/^@/, "");
      if (targetUsername.toLowerCase() === authUser.username.toLowerCase()) {
        throw new HttpApiError(400, "SELF_MOD_FORBIDDEN", "You cannot assign yourself as moderator.", {
          username: ["You cannot assign yourself as moderator."],
        });
      }

      try {
        const moderator = await models.channels.addModerator({
          ownerId: authUser.id,
          channelSlug: data.channelSlug,
          targetUsername: data.username,
        });

        if (deps.events?.publishModerationRoleUpdated) {
          await deps.events.publishModerationRoleUpdated({
            channelId: authUser.id,
            userId: moderator.userId,
            username: moderator.username,
            newRole: "Moderator",
          });
        }

        return reply.code(201).send({
          moderator,
          message: `@${moderator.username} is now a channel moderator.`,
        });
      } catch (err) {
        handleModerationDomainError(err);
      }
    },

    async removeModerator(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const authUser = requireAuthUser(request);
      const { username } = parseSchema(ModeratorUsernameParamSchema, request.params ?? {});
      const query = parseSchema(ModerationQuerySchema, request.query ?? {});

      const removed = await models.channels.removeModerator({
        ownerId: authUser.id,
        channelSlug: query.channelSlug,
        targetUsername: username,
      });

      if (!removed) {
        throw new HttpApiError(404, "MODERATOR_NOT_FOUND", `@${username} is not currently a channel moderator.`);
      }

      if (deps.events?.publishModerationRoleUpdated) {
        await deps.events.publishModerationRoleUpdated({
          channelId: authUser.id,
          userId: "",
          username,
          newRole: "User",
        });
      }

      return reply.code(200).send({
        ok: true,
        username,
        message: `Removed moderator privileges for @${username}.`,
      });
    },

    async listSilences(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const authUser = requireAuthUser(request);
      const query = parseSchema(ModerationQuerySchema, request.query ?? {});

      const silences = await models.channels.listMutes(query.channelSlug || authUser.id);
      return reply.code(200).send({ silences });
    },

    async silenceUser(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const authUser = requireAuthUser(request);
      const data = parseSchema(SilenceUserBodySchema, request.body ?? {});

      const targetUsername = data.username.trim().replace(/^@/, "");
      if (targetUsername.toLowerCase() === authUser.username.toLowerCase()) {
        throw new HttpApiError(400, "SELF_SILENCE_FORBIDDEN", "You cannot silence yourself.", {
          username: ["You cannot silence yourself."],
        });
      }

      try {
        const mute = await models.channels.muteUser({
          actorUserId: authUser.id,
          channelSlugOrOwnerId: data.channelSlug || authUser.id,
          targetUsername: data.username,
          duration: data.duration,
          reason: data.reason,
        });

        if (deps.events?.publishModerationSilence) {
          await deps.events.publishModerationSilence({
            channelId: data.channelSlug || authUser.id,
            userId: mute.userId,
            username: mute.username,
            expiresAt: mute.expiresAt,
            reason: mute.reason,
          });
        }

        return reply.code(201).send({
          mute,
          message: `@${mute.username} has been silenced.`,
        });
      } catch (err) {
        handleModerationDomainError(err);
      }
    },

    async unsilenceUser(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const authUser = requireAuthUser(request);
      const { username } = parseSchema(SilenceUsernameParamSchema, request.params ?? {});
      const query = parseSchema(ModerationQuerySchema, request.query ?? {});

      try {
        const removed = await models.channels.unmuteUser({
          actorUserId: authUser.id,
          channelSlugOrOwnerId: query.channelSlug || authUser.id,
          targetUsername: username,
        });

        if (!removed) {
          throw new HttpApiError(404, "MUTE_NOT_FOUND", `@${username} is not currently silenced.`);
        }

        if (deps.events?.publishModerationUnsilence) {
          await deps.events.publishModerationUnsilence({
            channelId: query.channelSlug || authUser.id,
            userId: "",
            username,
          });
        }

        return reply.code(200).send({
          ok: true,
          username,
          message: `Unsilenced @${username}.`,
        });
      } catch (err) {
        handleModerationDomainError(err);
      }
    },

    async warnUser(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const authUser = requireAuthUser(request);
      const data = parseSchema(WarnUserBodySchema, request.body ?? {});

      const targetUsername = data.username.trim().replace(/^@/, "");
      if (targetUsername.toLowerCase() === authUser.username.toLowerCase()) {
        throw new HttpApiError(400, "SELF_WARN_FORBIDDEN", "You cannot send a warning to yourself.", {
          username: ["You cannot send a warning to yourself."],
        });
      }

      try {
        const warning = await models.channels.warnUser({
          actorUserId: authUser.id,
          channelSlugOrOwnerId: data.channelSlug || authUser.id,
          targetUsername: data.username,
          reason: data.reason,
        });

        if (deps.events?.publishModerationWarning) {
          await deps.events.publishModerationWarning({
            channelId: warning.channelId,
            channelSlug: data.channelSlug ?? "",
            moderatorUsername: warning.moderatorUsername,
            targetUserId: warning.userId,
            reason: warning.reason,
            warnedAt: warning.createdAt,
          });
        }

        return reply.code(201).send({
          warning,
          message: `Warning sent to @${warning.username}.`,
        });
      } catch (err) {
        handleModerationDomainError(err);
      }
    },
  };
}
