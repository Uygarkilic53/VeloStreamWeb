import type { FastifyReply, FastifyRequest } from "fastify";
import { parseSchema } from "../lib/errors.js";
import { generateStreamKey } from "../lib/stream-key.js";
import { SetChannelLiveBodySchema, UpdateChannelBodySchema } from "../schemas/auth.schema.js";
import { requireAuthUser, requireModels, type ControllerDeps } from "./context.js";

export function createChannelController(deps: ControllerDeps) {
  return {
    async getLiveChannels(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const channels = await models.channels.getLiveChannels(request.authUser?.id);
      return reply.code(200).send({ channels });
    },

    async setLiveStatus(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const authUser = requireAuthUser(request);
      const { isLive } = parseSchema(SetChannelLiveBodySchema, request.body ?? {});

      const channel = await models.channels.setLiveStatus(authUser.id, isLive);

      // Best-effort push to Fiber real-time hub
      try {
        const fiberUrl = process.env.REALTIME_HTTP_URL || "http://localhost:3002";
        const secret = process.env.MEDIA_WEBHOOK_SECRET || "";
        void fetch(`${fiberUrl}/webhooks/mediamtx/event`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-VeloStream-Webhook-Secret": secret,
          },
          body: JSON.stringify({
            event: isLive ? "stream.ready" : "stream.not_ready",
            path: channel.slug,
          }),
        }).catch(() => {});
      } catch {
        // Real-time notification is best-effort
      }

      return reply.code(200).send({
        channel,
        message: isLive ? "Channel broadcast started." : "Channel broadcast ended.",
      });
    },

    async updateSettings(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const authUser = requireAuthUser(request);
      const data = parseSchema(UpdateChannelBodySchema, request.body ?? {});

      const channel = await models.channels.updateSettings({
        ownerId: authUser.id,
        title: data.title,
        category: data.category,
        ...(data.slowMode !== undefined ? { slowMode: data.slowMode } : {}),
      });

      const message =
        data.slowMode !== undefined
          ? data.slowMode
            ? "Slow mode enabled (3s between messages)."
            : "Slow mode disabled."
          : "Channel settings saved.";

      return reply.code(200).send({ channel, message });
    },

    async rotateStreamKey(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const authUser = requireAuthUser(request);

      const nextStreamKey = generateStreamKey("live");
      const streamKey = await models.channels.rotateStreamKey(authUser.id, nextStreamKey);
      return reply.code(200).send({
        streamKey,
        message: "Rotated stream key. Update your encoder before starting a new stream.",
      });
    },
  };
}
