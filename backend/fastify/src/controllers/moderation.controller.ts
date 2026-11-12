import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpApiError, parseSchema } from "../lib/errors.js";
import { BanUserBodySchema, BanUsernameParamSchema } from "../schemas/auth.schema.js";
import { requireAuthUser, requireModels, type ControllerDeps } from "./context.js";

export function createModerationController(deps: ControllerDeps) {
  return {
    async banUser(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const authUser = requireAuthUser(request);
      const data = parseSchema(BanUserBodySchema, request.body ?? {});

      if (data.username.toLowerCase() === authUser.username.toLowerCase()) {
        throw new HttpApiError(400, "SELF_BAN_FORBIDDEN", "You cannot ban your own channel account.", {
          username: ["You cannot ban your own channel account."],
        });
      }

      const result = await models.channels.banUserByUsername({
        ownerId: authUser.id,
        targetUsername: data.username,
        reason: data.reason,
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
    },

    async unbanUser(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const authUser = requireAuthUser(request);
      const { username } = parseSchema(BanUsernameParamSchema, request.params ?? {});

      const removed = await models.channels.unbanUserByUsername(authUser.id, username);
      if (!removed) {
        throw new HttpApiError(404, "BAN_NOT_FOUND", `No active ban found for @${username}.`);
      }

      return reply.code(200).send({
        ok: true,
        username,
        message: `Unbanned @${username}.`,
      });
    },
  };
}
