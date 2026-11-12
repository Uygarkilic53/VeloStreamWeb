import type { FastifyReply, FastifyRequest } from "fastify";
import {
  ALLOWED_AVATAR_MIME_TYPES,
  detectImageMimeType,
  MAX_AVATAR_BYTES,
} from "../lib/cloudinary.js";
import { HttpApiError, parseSchema } from "../lib/errors.js";
import {
  FollowSlugParamSchema,
  PublicUsernameParamSchema,
  SearchUsersQuerySchema,
  UpdateProfileBodySchema,
} from "../schemas/auth.schema.js";
import {
  requireAuthUser,
  requireMediaStorage,
  requireModels,
  type ControllerDeps,
} from "./context.js";

export function createUserController(deps: ControllerDeps) {
  return {
    async searchUsers(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const { q, limit } = parseSchema(SearchUsersQuerySchema, request.query ?? {});
      const result = await models.users.searchUsers(q, limit);
      return reply.code(200).send({
        query: q,
        users: result.users,
        relatedLiveUsers: result.relatedLiveUsers,
      });
    },

    async getPublicProfile(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const { username } = parseSchema(PublicUsernameParamSchema, request.params ?? {});
      const user = await models.users.findPublicByUsername(username);
      if (!user) {
        throw new HttpApiError(404, "USER_NOT_FOUND", `No creator found for @${username}.`);
      }
      return reply.code(200).send({ user });
    },

    async updateProfile(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const authUser = requireAuthUser(request);
      const data = parseSchema(UpdateProfileBodySchema, request.body ?? {});

      const updated = await models.users.updateProfile({
        userId: authUser.id,
        displayName: data.displayName,
        username: data.username,
        email: data.email,
        bio: data.bio,
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
      });

      const refreshedAccessToken =
        deps.jwtService && updated.username !== authUser.username
          ? await deps.jwtService.signAccessToken(
              {
                sub: updated.id,
                username: updated.username,
                role: updated.role,
              },
              deps.accessTokenTtl,
            )
          : undefined;

      return reply.code(200).send({
        user: updated,
        ...(refreshedAccessToken ? { accessToken: refreshedAccessToken } : {}),
        message: "Public profile updated.",
      });
    },

    async uploadAvatar(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const authUser = requireAuthUser(request);
      const mediaStorage = requireMediaStorage(deps.mediaStorage);

      const file = await request.file();
      if (!file) {
        throw new HttpApiError(400, "VALIDATION_ERROR", "Select an image file to upload.", {
          avatar: ["Select an image file to upload."],
        });
      }

      const buffer = await file.toBuffer();
      if (buffer.length === 0) {
        throw new HttpApiError(400, "VALIDATION_ERROR", "Uploaded avatar file is empty.", {
          avatar: ["Uploaded avatar file is empty."],
        });
      }
      if (buffer.length > MAX_AVATAR_BYTES) {
        throw new HttpApiError(400, "VALIDATION_ERROR", "Avatar image must be 5 MB or smaller.", {
          avatar: ["Avatar image must be 5 MB or smaller."],
        });
      }

      const detectedMime = detectImageMimeType(buffer);
      if (!detectedMime || !ALLOWED_AVATAR_MIME_TYPES.has(detectedMime)) {
        throw new HttpApiError(
          400,
          "VALIDATION_ERROR",
          "Unsupported image format. Upload PNG, JPEG, WebP, or GIF.",
          {
            avatar: ["Unsupported image format. Upload PNG, JPEG, WebP, or GIF."],
          },
        );
      }

      const existing = await models.users.findById(authUser.id);
      if (!existing) {
        throw new HttpApiError(404, "USER_NOT_FOUND", "User account not found.");
      }

      const uploaded = await mediaStorage.uploadAvatar({
        userId: authUser.id,
        buffer,
        mimeType: detectedMime,
        filename: file.filename,
      });

      const updated = await models.users.updateAvatarUrl(authUser.id, uploaded.secureUrl);
      if (existing.avatarUrl && existing.avatarUrl !== uploaded.secureUrl && mediaStorage.deleteAvatarByUrl) {
        try {
          await mediaStorage.deleteAvatarByUrl(existing.avatarUrl);
        } catch {
          // Best-effort cleanup of replaced Cloudinary asset.
        }
      }

      return reply.code(200).send({
        user: updated,
        avatarUrl: updated.avatarUrl,
        message: "Profile photo updated.",
      });
    },

    async deleteAvatar(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const authUser = requireAuthUser(request);

      const existing = await models.users.findById(authUser.id);
      const updated = await models.users.updateAvatarUrl(authUser.id, null);

      if (existing?.avatarUrl && deps.mediaStorage?.deleteAvatarByUrl) {
        try {
          await deps.mediaStorage.deleteAvatarByUrl(existing.avatarUrl);
        } catch {
          // Best-effort cleanup of deleted Cloudinary asset.
        }
      }

      return reply.code(200).send({
        user: updated,
        avatarUrl: null,
        message: "Profile photo removed.",
      });
    },

    async followChannel(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const authUser = requireAuthUser(request);
      const { slug } = parseSchema(FollowSlugParamSchema, request.params ?? {});

      const followedSlugs = await models.channels.setFollowState(authUser.id, slug, true);
      return reply.code(200).send({
        followedSlugs,
        message: `Followed @${slug}.`,
      });
    },

    async unfollowChannel(request: FastifyRequest, reply: FastifyReply) {
      const models = requireModels(deps.models);
      const authUser = requireAuthUser(request);
      const { slug } = parseSchema(FollowSlugParamSchema, request.params ?? {});

      const followedSlugs = await models.channels.setFollowState(authUser.id, slug, false);
      return reply.code(200).send({
        followedSlugs,
        message: `Unfollowed @${slug}.`,
      });
    },
  };
}
