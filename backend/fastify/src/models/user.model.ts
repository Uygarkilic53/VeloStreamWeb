import { Prisma, type PrismaClient } from "@prisma/client";
import {
  isPrismaNotFoundError,
  mapPrismaUniqueError,
  normalizeStreamCategory,
} from "./prisma-helpers.js";
import {
  RecordNotFoundError,
  UniqueConstraintError,
  type AccountProfileView,
  type CreateUserWithChannelInput,
  type PublicUserSummary,
  type SearchUsersResult,
  type UpdateUserProfileInput,
  type UserModelContract,
  type UserRecord,
} from "./types.js";

export const ACCOUNT_PROFILE_INCLUDE = {
  channel: {
    include: {
      bans: {
        orderBy: { createdAt: "desc" as const },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      },
    },
  },
  follows: {
    orderBy: { createdAt: "asc" as const },
    select: {
      channelSlug: true,
    },
  },
  bansReceived: {
    select: {
      expiresAt: true,
      channel: {
        select: {
          slug: true,
        },
      },
    },
  },
} as const;

export type HydratedUserRow = Prisma.UserGetPayload<{
  include: typeof ACCOUNT_PROFILE_INCLUDE;
}>;

export const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  channel: {
    select: {
      isLive: true,
      title: true,
      category: true,
    },
  },
} as const;

export type PublicUserRow = Prisma.UserGetPayload<{
  select: typeof PUBLIC_USER_SELECT;
}>;

export function toPublicUserSummary(row: PublicUserRow): PublicUserSummary {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl ?? null,
    bio: row.bio,
    isLive: row.channel?.isLive ?? false,
    channelTitle: row.channel?.title ?? null,
    channelCategory: row.channel ? normalizeStreamCategory(row.channel.category) : null,
  };
}

export function sortPublicUserMatches(
  items: PublicUserSummary[],
  rawQuery: string,
): PublicUserSummary[] {
  const lowerQuery = rawQuery.trim().toLowerCase();
  const handleQuery = lowerQuery.replace(/^@/, "");
  return [...items].sort((a, b) => {
    const aLive = a.isLive ? 1 : 0;
    const bLive = b.isLive ? 1 : 0;
    if (aLive !== bLive) {
      return bLive - aLive;
    }
    const aExact =
      a.username.toLowerCase() === handleQuery || a.displayName.toLowerCase() === lowerQuery
        ? 1
        : 0;
    const bExact =
      b.username.toLowerCase() === handleQuery || b.displayName.toLowerCase() === lowerQuery
        ? 1
        : 0;
    if (aExact !== bExact) {
      return bExact - aExact;
    }
    const aPrefix =
      (handleQuery && a.username.toLowerCase().startsWith(handleQuery)) ||
      a.displayName.toLowerCase().startsWith(lowerQuery)
        ? 1
        : 0;
    const bPrefix =
      (handleQuery && b.username.toLowerCase().startsWith(handleQuery)) ||
      b.displayName.toLowerCase().startsWith(lowerQuery)
        ? 1
        : 0;
    if (aPrefix !== bPrefix) {
      return bPrefix - aPrefix;
    }
    return a.username.localeCompare(b.username);
  });
}

export function toAccountProfileView(row: HydratedUserRow): AccountProfileView {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    email: row.email,
    bio: row.bio,
    avatarUrl: row.avatarUrl ?? null,
    role: row.role,
    theme: row.theme === "dark" ? "dark" : "light",
    createdAt: row.createdAt.toISOString(),
    channel: row.channel
      ? {
          id: row.channel.id,
          slug: row.channel.slug,
          title: row.channel.title,
          category: normalizeStreamCategory(row.channel.category),
          streamKey: row.channel.streamKey,
          slowMode: row.channel.slowMode,
          isLive: row.channel.isLive,
        }
      : null,
    bannedUsers: row.channel
      ? row.channel.bans.map((ban) => ({
          id: ban.id,
          userId: ban.userId,
          username: ban.user.username,
          reason: ban.reason,
          bannedAt: ban.createdAt.toISOString(),
          expiresAt: ban.expiresAt ? ban.expiresAt.toISOString() : null,
        }))
      : [],
    bannedFromSlugs: row.bansReceived
      ? row.bansReceived
          .filter((ban) => !ban.expiresAt || ban.expiresAt > new Date())
          .map((ban) => ban.channel.slug)
      : [],
    followedSlugs: row.follows.map((follow) => follow.channelSlug),
  };
}

export class UserModel implements UserModelContract {
  constructor(private readonly prisma: PrismaClient) {}

  async createWithChannel(input: CreateUserWithChannelInput): Promise<AccountProfileView> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const cleanUsername = input.username.trim();
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(cleanUsername)) {
      throw new Error("Username must be 3–32 characters using only letters, numbers, and underscores.");
    }
    const cleanDisplayName = input.displayName.trim() || cleanUsername;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.user.findFirst({
          where: {
            OR: [
              { email: { equals: normalizedEmail, mode: "insensitive" } },
              { username: { equals: cleanUsername, mode: "insensitive" } },
            ],
          },
          select: { username: true },
        });

        if (existing) {
          if (existing.username.toLowerCase() === cleanUsername.toLowerCase()) {
            throw new UniqueConstraintError("username", "That username is already registered.");
          }
          throw new UniqueConstraintError("email", "An account with this email already exists.");
        }

        return tx.user.create({
          data: {
            username: cleanUsername,
            displayName: cleanDisplayName,
            email: normalizedEmail,
            bio: "",
            passwordHash: input.passwordHash,
            role: input.role ?? "USER",
            theme: input.theme ?? "light",
            channel: {
              create: {
                slug: cleanUsername,
                title: input.channelTitle,
                category: input.channelCategory ?? "Programming",
                streamKey: input.streamKey,
                slowMode: false,
                isLive: false,
              },
            },
          },
          include: ACCOUNT_PROFILE_INCLUDE,
        });
      });

      return toAccountProfileView(created);
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw err;
      }
      mapPrismaUniqueError(err);
    }
  }

  async findByIdentifier(identifier: string): Promise<UserRecord | null> {
    const clean = identifier.trim();
    if (!clean) {
      return null;
    }

    if (clean.includes("@") && !clean.startsWith("@")) {
      return this.prisma.user.findFirst({
        where: { email: { equals: clean.toLowerCase(), mode: "insensitive" } },
      });
    }

    const handle = clean.replace(/^@/, "");
    return this.prisma.user.findFirst({
      where: { username: { equals: handle, mode: "insensitive" } },
    });
  }

  async findById(userId: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  async findProfileById(userId: string): Promise<AccountProfileView | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: ACCOUNT_PROFILE_INCLUDE,
    });
    return user ? toAccountProfileView(user) : null;
  }

  async findPublicByUsername(username: string): Promise<PublicUserSummary | null> {
    const handle = username.trim().replace(/^@/, "");
    if (!handle) {
      return null;
    }
    const user = await this.prisma.user.findFirst({
      where: { username: { equals: handle, mode: "insensitive" } },
      select: PUBLIC_USER_SELECT,
    });
    return user ? toPublicUserSummary(user) : null;
  }

  async searchUsers(
    query: string,
    limit = 12,
    excludeUserId?: string,
  ): Promise<SearchUsersResult> {
    const clean = query.trim();
    const handleQuery = clean.replace(/^@/, "");
    if (!clean || !handleQuery) {
      return { users: [], relatedLiveUsers: [] };
    }

    const safeLimit = Math.max(1, Math.min(30, limit));
    const excludeFilter: Prisma.UserWhereInput = excludeUserId
      ? { id: { not: excludeUserId } }
      : {};
    const channelBanFilter = excludeUserId
      ? {
          bans: {
            none: {
              userId: excludeUserId,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
          },
        }
      : {};

    const matchedRows = await this.prisma.user.findMany({
      where: {
        ...excludeFilter,
        ...(excludeUserId ? { channel: channelBanFilter } : {}),
        OR: [
          { username: { contains: handleQuery, mode: "insensitive" } },
          { displayName: { contains: clean, mode: "insensitive" } },
        ],
      },
      select: PUBLIC_USER_SELECT,
      take: safeLimit * 2,
    });

    const users = sortPublicUserMatches(matchedRows.map(toPublicUserSummary), clean).slice(
      0,
      safeLimit,
    );

    const matchedCategories = Array.from(
      new Set(
        users
          .map((u) => u.channelCategory)
          .filter((cat): cat is NonNullable<typeof cat> => Boolean(cat)),
      ),
    );

    const relatedRows = await this.prisma.user.findMany({
      where: {
        ...excludeFilter,
        channel: {
          isLive: true,
          ...channelBanFilter,
          OR: [
            { title: { contains: clean, mode: "insensitive" } },
            { category: { contains: clean, mode: "insensitive" } },
            ...(matchedCategories.length > 0 ? [{ category: { in: matchedCategories } }] : []),
          ],
        },
      },
      select: PUBLIC_USER_SELECT,
      take: safeLimit,
    });

    const relatedByQueryRows = await this.prisma.user.findMany({
      where: {
        ...excludeFilter,
        channel: {
          isLive: true,
          ...channelBanFilter,
        },
        OR: [
          { username: { contains: handleQuery, mode: "insensitive" } },
          { displayName: { contains: clean, mode: "insensitive" } },
        ],
      },
      select: PUBLIC_USER_SELECT,
      take: safeLimit,
    });

    const dedupedLive = new Map<string, PublicUserSummary>();
    for (const row of [...relatedByQueryRows, ...relatedRows]) {
      const summary = toPublicUserSummary(row);
      if (!dedupedLive.has(summary.id)) {
        dedupedLive.set(summary.id, summary);
      }
    }

    const relatedLiveUsers = sortPublicUserMatches(
      Array.from(dedupedLive.values()),
      clean,
    ).slice(0, safeLimit);

    return { users, relatedLiveUsers };
  }

  async updateProfile(input: UpdateUserProfileInput): Promise<AccountProfileView> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const cleanUsername = input.username.trim();
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(cleanUsername)) {
      throw new Error("Username must be 3–32 characters using only letters, numbers, and underscores.");
    }
    const cleanDisplayName = input.displayName.trim() || cleanUsername;
    const cleanBio = input.bio.trim();

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const current = await tx.user.findUnique({
          where: { id: input.userId },
          include: { channel: { select: { id: true, slug: true } } },
        });
        if (!current) {
          throw new RecordNotFoundError("User", "User account not found.");
        }

        const conflict = await tx.user.findFirst({
          where: {
            id: { not: input.userId },
            OR: [
              { email: { equals: normalizedEmail, mode: "insensitive" } },
              { username: { equals: cleanUsername, mode: "insensitive" } },
            ],
          },
          select: { username: true },
        });

        if (conflict) {
          if (conflict.username.toLowerCase() === cleanUsername.toLowerCase()) {
            throw new UniqueConstraintError("username", "That username is already taken.");
          }
          throw new UniqueConstraintError("email", "An account with this email already exists.");
        }

        const oldSlug = current.channel?.slug;
        if (oldSlug && oldSlug !== cleanUsername) {
          await tx.channelFollow.updateMany({
            where: { channelSlug: oldSlug },
            data: { channelSlug: cleanUsername },
          });
        }

        return tx.user.update({
          where: { id: input.userId },
          data: {
            displayName: cleanDisplayName,
            username: cleanUsername,
            email: normalizedEmail,
            bio: cleanBio,
            ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
            ...(input.theme !== undefined ? { theme: input.theme } : {}),
            ...(current.channel
              ? {
                  channel: {
                    update: {
                      slug: cleanUsername,
                    },
                  },
                }
              : {}),
          },
          include: ACCOUNT_PROFILE_INCLUDE,
        });
      });

      return toAccountProfileView(updated);
    } catch (err) {
      if (err instanceof RecordNotFoundError || err instanceof UniqueConstraintError) {
        throw err;
      }
      if (isPrismaNotFoundError(err)) {
        throw new RecordNotFoundError("User", "User account not found.");
      }
      mapPrismaUniqueError(err);
    }
  }

  async updateTheme(userId: string, theme: "light" | "dark"): Promise<AccountProfileView> {
    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: { theme },
        include: ACCOUNT_PROFILE_INCLUDE,
      });
      return toAccountProfileView(updated);
    } catch (err) {
      if (isPrismaNotFoundError(err)) {
        throw new RecordNotFoundError("User", "User account not found.");
      }
      throw err;
    }
  }

  async getFollowedUsers(userId: string): Promise<PublicUserSummary[]> {
    const follows = await this.prisma.channelFollow.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { channelSlug: true },
    });
    if (follows.length === 0) {
      return [];
    }
    const slugs = follows.map((f) => f.channelSlug);
    const users = await this.prisma.user.findMany({
      where: {
        username: { in: slugs, mode: "insensitive" },
      },
      select: PUBLIC_USER_SELECT,
    });
    const userMap = new Map(users.map((u) => [u.username.toLowerCase(), u]));
    const results: PublicUserSummary[] = [];
    for (const slug of slugs) {
      const u = userMap.get(slug.toLowerCase());
      if (u) {
        results.push(toPublicUserSummary(u));
      }
    }
    return results;
  }

  async updateAvatarUrl(userId: string, avatarUrl: string | null): Promise<AccountProfileView> {
    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: { avatarUrl },
        include: ACCOUNT_PROFILE_INCLUDE,
      });
      return toAccountProfileView(updated);
    } catch (err) {
      if (isPrismaNotFoundError(err)) {
        throw new RecordNotFoundError("User", "User account not found.");
      }
      throw err;
    }
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
    } catch (err) {
      if (isPrismaNotFoundError(err)) {
        throw new RecordNotFoundError("User", "User account not found.");
      }
      throw err;
    }
  }
}
