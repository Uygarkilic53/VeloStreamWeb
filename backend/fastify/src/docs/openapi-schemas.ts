import type { FastifySchema } from "fastify";

const ErrorResponseSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
    fieldErrors: {
      type: "object",
      additionalProperties: {
        type: "array",
        items: { type: "string" },
      },
    },
  },
  required: ["error", "message"],
} as const;

const ChannelBanSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    userId: { type: "string" },
    username: { type: "string" },
    reason: { type: "string" },
    bannedAt: { type: "string", format: "date-time" },
    expiresAt: { type: ["string", "null"], format: "date-time" },
  },
  required: ["id", "userId", "username", "reason", "bannedAt", "expiresAt"],
} as const;

const ChannelSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    slug: { type: "string" },
    title: { type: "string" },
    category: {
      type: "string",
      enum: ["Gaming", "Just Chatting", "Programming", "Music & Audio", "Creative"],
    },
    streamKey: { type: "string" },
    slowMode: { type: "boolean" },
    isLive: { type: "boolean" },
  },
  required: ["id", "slug", "title", "category", "streamKey", "slowMode", "isLive"],
} as const;

const AccountProfileSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    username: { type: "string" },
    displayName: { type: "string" },
    email: { type: "string", format: "email" },
    bio: { type: "string" },
    avatarUrl: { type: ["string", "null"], format: "uri" },
    role: { type: "string", enum: ["USER", "CREATOR", "MODERATOR", "ADMIN"] },
    createdAt: { type: "string", format: "date-time" },
    channel: {
      anyOf: [ChannelSchema, { type: "null" }],
    },
    bannedUsers: {
      type: "array",
      items: ChannelBanSchema,
    },
    followedSlugs: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "id",
    "username",
    "displayName",
    "email",
    "bio",
    "avatarUrl",
    "role",
    "createdAt",
    "channel",
    "bannedUsers",
    "followedSlugs",
  ],
} as const;

const AuthSessionSchema = {
  type: "object",
  properties: {
    accessToken: { type: "string" },
    refreshToken: { type: "string" },
    expiresIn: { type: "integer" },
    tokenType: { type: "string", enum: ["Bearer"] },
    user: AccountProfileSchema,
    message: { type: "string" },
  },
  required: ["accessToken", "refreshToken", "expiresIn", "tokenType", "user"],
} as const;

const PublicUserSummarySchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    username: { type: "string" },
    displayName: { type: "string" },
    avatarUrl: { type: ["string", "null"], format: "uri" },
    bio: { type: "string" },
    isLive: { type: "boolean" },
    channelTitle: { type: ["string", "null"] },
    channelCategory: {
      type: ["string", "null"],
      enum: ["Gaming", "Just Chatting", "Programming", "Music & Audio", "Creative", null],
    },
  },
  required: [
    "id",
    "username",
    "displayName",
    "avatarUrl",
    "bio",
    "isLive",
    "channelTitle",
    "channelCategory",
  ],
} as const;

export const searchUsersRouteSchema: FastifySchema = {
  tags: ["Users"],
  summary: "Search creators/users by username or display name (online and offline)",
  description:
    "Returns matching users (whether online or offline) with public profile picture, username, display name, and live status, plus related live users.",
  querystring: {
    type: "object",
    properties: {
      q: { type: "string", maxLength: 64, description: "Search query for username or display name" },
      limit: { type: "integer", minimum: 1, maximum: 30, default: 12 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        query: { type: "string" },
        users: { type: "array", items: PublicUserSummarySchema },
        relatedLiveUsers: { type: "array", items: PublicUserSummarySchema },
      },
      required: ["query", "users", "relatedLiveUsers"],
    },
    400: ErrorResponseSchema,
    503: ErrorResponseSchema,
  },
};

export const publicUserProfileRouteSchema: FastifySchema = {
  tags: ["Users"],
  summary: "Fetch public user profile and channel live status by username",
  params: {
    type: "object",
    required: ["username"],
    properties: {
      username: { type: "string", minLength: 1, maxLength: 32 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        user: PublicUserSummarySchema,
      },
      required: ["user"],
    },
    400: ErrorResponseSchema,
    404: ErrorResponseSchema,
    503: ErrorResponseSchema,
  },
};

export const jwksRouteSchema: FastifySchema = {
  tags: ["Auth"],
  summary: "Public JWKS endpoint",
  description: "Exposes public asymmetric JWT verification keys for Go Fiber and clients.",
  response: {
    200: {
      type: "object",
      properties: {
        keys: {
          type: "array",
          items: { type: "object", additionalProperties: true },
        },
      },
    },
    503: ErrorResponseSchema,
  },
};

export const registerRouteSchema: FastifySchema = {
  tags: ["Auth"],
  summary: "Register a new creator account",
  body: {
    type: "object",
    required: ["username", "email", "password"],
    properties: {
      username: { type: "string", minLength: 3, maxLength: 32 },
      email: { type: "string", format: "email" },
      password: { type: "string", minLength: 8, maxLength: 128 },
      displayName: { type: "string", minLength: 1, maxLength: 50 },
      rememberSession: { type: "boolean", default: true },
    },
  },
  response: {
    201: AuthSessionSchema,
    400: ErrorResponseSchema,
    409: ErrorResponseSchema,
    503: ErrorResponseSchema,
  },
};

export const loginRouteSchema: FastifySchema = {
  tags: ["Auth"],
  summary: "Sign in with username or email",
  body: {
    type: "object",
    required: ["password"],
    properties: {
      identifier: { type: "string" },
      email: { type: "string" },
      password: { type: "string" },
      rememberSession: { type: "boolean", default: true },
    },
  },
  response: {
    200: AuthSessionSchema,
    400: ErrorResponseSchema,
    401: ErrorResponseSchema,
    503: ErrorResponseSchema,
  },
};

export const refreshRouteSchema: FastifySchema = {
  tags: ["Auth"],
  summary: "Rotate refresh token and issue new access JWT",
  body: {
    type: "object",
    required: ["refreshToken"],
    properties: {
      refreshToken: { type: "string", minLength: 16 },
    },
  },
  response: {
    200: AuthSessionSchema,
    400: ErrorResponseSchema,
    401: ErrorResponseSchema,
    503: ErrorResponseSchema,
  },
};

export const logoutRouteSchema: FastifySchema = {
  tags: ["Auth"],
  summary: "Revoke refresh session and sign out",
  body: {
    type: "object",
    properties: {
      refreshToken: { type: "string" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        ok: { type: "boolean" },
        message: { type: "string" },
      },
      required: ["ok", "message"],
    },
  },
};

export const meRouteSchema: FastifySchema = {
  tags: ["Auth"],
  summary: "Fetch current authenticated user profile",
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: "object",
      properties: { user: AccountProfileSchema },
      required: ["user"],
    },
    401: ErrorResponseSchema,
    503: ErrorResponseSchema,
  },
};

export const changePasswordRouteSchema: FastifySchema = {
  tags: ["Auth"],
  summary: "Update current user password",
  security: [{ bearerAuth: [] }],
  body: {
    type: "object",
    required: ["currentPassword", "newPassword"],
    properties: {
      currentPassword: { type: "string" },
      newPassword: { type: "string", minLength: 8, maxLength: 128 },
      confirmPassword: { type: "string" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        ok: { type: "boolean" },
        message: { type: "string" },
      },
      required: ["ok", "message"],
    },
    400: ErrorResponseSchema,
    401: ErrorResponseSchema,
    503: ErrorResponseSchema,
  },
};

export const updateProfileRouteSchema: FastifySchema = {
  tags: ["Users"],
  summary: "Update authenticated user profile",
  security: [{ bearerAuth: [] }],
  body: {
    type: "object",
    required: ["displayName", "username", "email"],
    properties: {
      displayName: { type: "string", minLength: 1, maxLength: 50 },
      username: { type: "string", minLength: 3, maxLength: 32 },
      email: { type: "string", format: "email" },
      bio: { type: "string", maxLength: 500 },
      avatarUrl: { type: ["string", "null"], format: "uri" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        user: AccountProfileSchema,
        accessToken: { type: "string" },
        message: { type: "string" },
      },
      required: ["user"],
    },
    400: ErrorResponseSchema,
    401: ErrorResponseSchema,
    404: ErrorResponseSchema,
    409: ErrorResponseSchema,
  },
};

export const uploadAvatarRouteSchema: FastifySchema = {
  tags: ["Users"],
  summary: "Upload circular profile avatar to Cloudinary (VeloStream/avatar folder)",
  description:
    "Accepts multipart/form-data image upload (PNG, JPEG, WebP, GIF up to 5 MB), stores it in the Cloudinary 'VeloStream/avatar' folder, and saves avatarUrl on the user record.",
  security: [{ bearerAuth: [] }],
  consumes: ["multipart/form-data"],
  body: {
    type: "object",
    required: ["avatar"],
    properties: {
      avatar: {
        type: "string",
        format: "binary",
        description: "Profile avatar image file (PNG, JPEG, WebP, or GIF, max 5 MB)",
      },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        user: AccountProfileSchema,
        avatarUrl: { type: ["string", "null"], format: "uri" },
        message: { type: "string" },
      },
      required: ["user", "avatarUrl"],
    },
    400: ErrorResponseSchema,
    401: ErrorResponseSchema,
    502: ErrorResponseSchema,
    503: ErrorResponseSchema,
  },
};

export const deleteAvatarRouteSchema: FastifySchema = {
  tags: ["Users"],
  summary: "Remove current user profile avatar",
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: "object",
      properties: {
        user: AccountProfileSchema,
        avatarUrl: { type: ["string", "null"], format: "uri" },
        message: { type: "string" },
      },
      required: ["user", "avatarUrl"],
    },
    401: ErrorResponseSchema,
    404: ErrorResponseSchema,
  },
};

export const followChannelRouteSchema: FastifySchema = {
  tags: ["Users"],
  summary: "Follow a channel",
  security: [{ bearerAuth: [] }],
  params: {
    type: "object",
    required: ["slug"],
    properties: {
      slug: { type: "string" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        followedSlugs: { type: "array", items: { type: "string" } },
        message: { type: "string" },
      },
      required: ["followedSlugs"],
    },
    400: ErrorResponseSchema,
    401: ErrorResponseSchema,
  },
};

export const unfollowChannelRouteSchema: FastifySchema = {
  tags: ["Users"],
  summary: "Unfollow a channel",
  security: [{ bearerAuth: [] }],
  params: {
    type: "object",
    required: ["slug"],
    properties: {
      slug: { type: "string" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        followedSlugs: { type: "array", items: { type: "string" } },
        message: { type: "string" },
      },
      required: ["followedSlugs"],
    },
    400: ErrorResponseSchema,
    401: ErrorResponseSchema,
  },
};

export const updateChannelRouteSchema: FastifySchema = {
  tags: ["Channels"],
  summary: "Update own channel broadcast defaults",
  security: [{ bearerAuth: [] }],
  body: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1, maxLength: 140 },
      category: {
        type: "string",
        enum: ["Gaming", "Just Chatting", "Programming", "Music & Audio", "Creative"],
      },
      slowMode: { type: "boolean" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        channel: ChannelSchema,
        message: { type: "string" },
      },
      required: ["channel"],
    },
    400: ErrorResponseSchema,
    401: ErrorResponseSchema,
    404: ErrorResponseSchema,
  },
};

export const rotateStreamKeyRouteSchema: FastifySchema = {
  tags: ["Channels"],
  summary: "Rotate own channel ingest stream key",
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: "object",
      properties: {
        streamKey: { type: "string" },
        message: { type: "string" },
      },
      required: ["streamKey"],
    },
    401: ErrorResponseSchema,
    404: ErrorResponseSchema,
  },
};

export const banUserRouteSchema: FastifySchema = {
  tags: ["Moderation"],
  summary: "Ban a user from your channel",
  security: [{ bearerAuth: [] }],
  body: {
    type: "object",
    required: ["username"],
    properties: {
      username: { type: "string" },
      reason: { type: "string", maxLength: 200 },
    },
  },
  response: {
    201: {
      type: "object",
      properties: {
        ban: ChannelBanSchema,
        message: { type: "string" },
      },
      required: ["ban"],
    },
    400: ErrorResponseSchema,
    401: ErrorResponseSchema,
    404: ErrorResponseSchema,
  },
};

export const unbanUserRouteSchema: FastifySchema = {
  tags: ["Moderation"],
  summary: "Unban a user from your channel",
  security: [{ bearerAuth: [] }],
  params: {
    type: "object",
    required: ["username"],
    properties: {
      username: { type: "string" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        ok: { type: "boolean" },
        username: { type: "string" },
        message: { type: "string" },
      },
      required: ["ok"],
    },
    400: ErrorResponseSchema,
    401: ErrorResponseSchema,
    404: ErrorResponseSchema,
  },
};
