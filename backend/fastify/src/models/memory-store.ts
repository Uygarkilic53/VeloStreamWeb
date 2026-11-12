import { randomUUID } from "node:crypto";
import {
  RecordNotFoundError,
  UniqueConstraintError,
  type AccountProfileView,
  type ChannelBanView,
  type ChannelModelContract,
  type ChannelRecord,
  type ChannelView,
  type CoreModels,
  type CreateRefreshTokenInput,
  type CreateUserWithChannelInput,
  type PublicUserSummary,
  type RefreshTokenModelContract,
  type RefreshTokenRecord,
  type SearchUsersResult,
  type UpdateChannelSettingsInput,
  type UpdateUserProfileInput,
  type UpsertChannelBanInput,
  type UpsertChannelBanResult,
  type UserModelContract,
  type UserRecord,
} from "./types.js";
import { sortPublicUserMatches } from "./user.model.js";

interface StoredBan {
  id: string;
  channelId: string;
  userId: string;
  reason: string;
  createdAt: Date;
  expiresAt: Date | null;
}

class MemoryState {
  users = new Map<string, UserRecord>();
  channels = new Map<string, ChannelRecord>();
  refreshTokens = new Map<string, RefreshTokenRecord>();
  bans = new Map<string, StoredBan>();
  follows = new Map<string, string[]>();

  findChannelByOwner(ownerId: string): ChannelRecord | undefined {
    for (const channel of this.channels.values()) {
      if (channel.ownerId === ownerId) {
        return channel;
      }
    }
    return undefined;
  }

  toAccountProfileView(userId: string): AccountProfileView | null {
    const user = this.users.get(userId);
    if (!user) {
      return null;
    }

    const channel = this.findChannelByOwner(userId);
    const channelBans: ChannelBanView[] = [];
    if (channel) {
      for (const ban of this.bans.values()) {
        if (ban.channelId !== channel.id) continue;
        const bannedUser = this.users.get(ban.userId);
        if (!bannedUser) continue;
        channelBans.push({
          id: ban.id,
          userId: ban.userId,
          username: bannedUser.username,
          reason: ban.reason,
          bannedAt: ban.createdAt.toISOString(),
          expiresAt: ban.expiresAt ? ban.expiresAt.toISOString() : null,
        });
      }
      channelBans.sort((a, b) => b.bannedAt.localeCompare(a.bannedAt));
    }

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      channel: channel
        ? {
            id: channel.id,
            slug: channel.slug,
            title: channel.title,
            category: channel.category,
            streamKey: channel.streamKey,
            slowMode: channel.slowMode,
            isLive: channel.isLive,
          }
        : null,
      bannedUsers: channelBans,
      followedSlugs: [...(this.follows.get(user.id) ?? [])],
    };
  }
}

class MemoryUserModel implements UserModelContract {
  constructor(private readonly state: MemoryState) {}

  async createWithChannel(input: CreateUserWithChannelInput): Promise<AccountProfileView> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const cleanUsername = input.username.trim().replace(/^@/, "");
    const cleanDisplayName = input.displayName.trim() || cleanUsername;

    for (const existing of this.state.users.values()) {
      if (existing.username.toLowerCase() === cleanUsername.toLowerCase()) {
        throw new UniqueConstraintError("username", "That channel handle is already registered.");
      }
      if (existing.email.toLowerCase() === normalizedEmail) {
        throw new UniqueConstraintError("email", "An account with this email already exists.");
      }
    }

    const now = new Date();
    const userId = `usr_${randomUUID()}`;
    const channelId = `ch_${randomUUID()}`;

    this.state.users.set(userId, {
      id: userId,
      username: cleanUsername,
      displayName: cleanDisplayName,
      email: normalizedEmail,
      bio: "",
      avatarUrl: null,
      passwordHash: input.passwordHash,
      role: input.role ?? "USER",
      createdAt: now,
      updatedAt: now,
    });

    this.state.channels.set(channelId, {
      id: channelId,
      ownerId: userId,
      slug: cleanUsername,
      title: input.channelTitle,
      category: input.channelCategory ?? "Programming",
      streamKey: input.streamKey,
      slowMode: false,
      isLive: false,
      createdAt: now,
      updatedAt: now,
    });

    this.state.follows.set(userId, []);
    const profile = this.state.toAccountProfileView(userId);
    if (!profile) {
      throw new Error("Failed to build created user profile");
    }
    return profile;
  }

  async findByIdentifier(identifier: string): Promise<UserRecord | null> {
    const clean = identifier.trim();
    if (!clean) return null;

    if (clean.includes("@") && !clean.startsWith("@")) {
      const targetEmail = clean.toLowerCase();
      for (const user of this.state.users.values()) {
        if (user.email.toLowerCase() === targetEmail) return user;
      }
      return null;
    }

    const handle = clean.replace(/^@/, "").toLowerCase();
    for (const user of this.state.users.values()) {
      if (user.username.toLowerCase() === handle) return user;
    }
    return null;
  }

  async findById(userId: string): Promise<UserRecord | null> {
    return this.state.users.get(userId) ?? null;
  }

  async findProfileById(userId: string): Promise<AccountProfileView | null> {
    return this.state.toAccountProfileView(userId);
  }

  private toPublicSummary(user: UserRecord): PublicUserSummary {
    const channel = this.state.findChannelByOwner(user.id);
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      isLive: channel?.isLive ?? false,
      channelTitle: channel?.title ?? null,
      channelCategory: channel?.category ?? null,
    };
  }

  async findPublicByUsername(username: string): Promise<PublicUserSummary | null> {
    const handle = username.trim().replace(/^@/, "").toLowerCase();
    if (!handle) {
      return null;
    }
    for (const user of this.state.users.values()) {
      if (user.username.toLowerCase() === handle) {
        return this.toPublicSummary(user);
      }
    }
    return null;
  }

  async searchUsers(query: string, limit = 12): Promise<SearchUsersResult> {
    const clean = query.trim();
    const handleQuery = clean.replace(/^@/, "").toLowerCase();
    const lowerQuery = clean.toLowerCase();
    if (!clean || !handleQuery) {
      return { users: [], relatedLiveUsers: [] };
    }

    const safeLimit = Math.max(1, Math.min(30, limit));
    const matched: PublicUserSummary[] = [];
    for (const user of this.state.users.values()) {
      if (
        user.username.toLowerCase().includes(handleQuery) ||
        user.displayName.toLowerCase().includes(lowerQuery)
      ) {
        matched.push(this.toPublicSummary(user));
      }
    }

    const users = sortPublicUserMatches(matched, clean).slice(0, safeLimit);
    const matchedCategories = new Set(
      users
        .map((u) => u.channelCategory)
        .filter((cat): cat is NonNullable<typeof cat> => Boolean(cat)),
    );

    const liveRelated: PublicUserSummary[] = [];
    for (const user of this.state.users.values()) {
      const summary = this.toPublicSummary(user);
      if (!summary.isLive) continue;
      const matchesText =
        summary.username.toLowerCase().includes(handleQuery) ||
        summary.displayName.toLowerCase().includes(lowerQuery) ||
        (summary.channelTitle?.toLowerCase().includes(lowerQuery) ?? false) ||
        (summary.channelCategory?.toLowerCase().includes(lowerQuery) ?? false);
      const matchesCategory =
        summary.channelCategory !== null && matchedCategories.has(summary.channelCategory);
      if (matchesText || matchesCategory) {
        liveRelated.push(summary);
      }
    }

    const relatedLiveUsers = sortPublicUserMatches(liveRelated, clean).slice(0, safeLimit);
    return { users, relatedLiveUsers };
  }

  async updateProfile(input: UpdateUserProfileInput): Promise<AccountProfileView> {
    const user = this.state.users.get(input.userId);
    if (!user) {
      throw new RecordNotFoundError("User", "User account not found.");
    }

    const normalizedEmail = input.email.trim().toLowerCase();
    const cleanUsername = input.username.trim().replace(/^@/, "");
    const cleanDisplayName = input.displayName.trim() || cleanUsername;

    for (const existing of this.state.users.values()) {
      if (existing.id === input.userId) continue;
      if (existing.username.toLowerCase() === cleanUsername.toLowerCase()) {
        throw new UniqueConstraintError("username", "That channel handle is already taken.");
      }
      if (existing.email.toLowerCase() === normalizedEmail) {
        throw new UniqueConstraintError("email", "An account with this email already exists.");
      }
    }

    const now = new Date();
    const channel = this.state.findChannelByOwner(input.userId);
    if (channel) {
      if (channel.slug !== cleanUsername) {
        for (const [followerId, slugs] of this.state.follows.entries()) {
          if (slugs.includes(channel.slug)) {
            this.state.follows.set(
              followerId,
              slugs.map((slug) => (slug === channel.slug ? cleanUsername : slug)),
            );
          }
        }
      }
      this.state.channels.set(channel.id, {
        ...channel,
        slug: cleanUsername,
        updatedAt: now,
      });
    }

    this.state.users.set(user.id, {
      ...user,
      displayName: cleanDisplayName,
      username: cleanUsername,
      email: normalizedEmail,
      bio: input.bio.trim(),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      updatedAt: now,
    });

    const profile = this.state.toAccountProfileView(user.id);
    if (!profile) {
      throw new RecordNotFoundError("User", "User account not found.");
    }
    return profile;
  }

  async updateAvatarUrl(userId: string, avatarUrl: string | null): Promise<AccountProfileView> {
    const user = this.state.users.get(userId);
    if (!user) {
      throw new RecordNotFoundError("User", "User account not found.");
    }
    this.state.users.set(userId, {
      ...user,
      avatarUrl,
      updatedAt: new Date(),
    });
    const profile = this.state.toAccountProfileView(userId);
    if (!profile) {
      throw new RecordNotFoundError("User", "User account not found.");
    }
    return profile;
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    const user = this.state.users.get(userId);
    if (!user) {
      throw new RecordNotFoundError("User", "User account not found.");
    }
    this.state.users.set(userId, {
      ...user,
      passwordHash,
      updatedAt: new Date(),
    });
  }
}

class MemoryChannelModel implements ChannelModelContract {
  constructor(private readonly state: MemoryState) {}

  async updateSettings(input: UpdateChannelSettingsInput): Promise<ChannelView> {
    const channel = this.state.findChannelByOwner(input.ownerId);
    if (!channel) {
      throw new RecordNotFoundError("Channel", "Channel not found for this account.");
    }
    const updated: ChannelRecord = {
      ...channel,
      title: input.title,
      category: input.category,
      slowMode: input.slowMode ?? channel.slowMode,
      updatedAt: new Date(),
    };
    this.state.channels.set(channel.id, updated);
    return {
      id: updated.id,
      slug: updated.slug,
      title: updated.title,
      category: updated.category,
      streamKey: updated.streamKey,
      slowMode: updated.slowMode,
      isLive: updated.isLive,
    };
  }

  async rotateStreamKey(ownerId: string, nextStreamKey: string): Promise<string> {
    const channel = this.state.findChannelByOwner(ownerId);
    if (!channel) {
      throw new RecordNotFoundError("Channel", "Channel not found for this account.");
    }
    this.state.channels.set(channel.id, {
      ...channel,
      streamKey: nextStreamKey,
      updatedAt: new Date(),
    });
    return nextStreamKey;
  }

  async banUserByUsername(input: UpsertChannelBanInput): Promise<UpsertChannelBanResult> {
    const channel = this.state.findChannelByOwner(input.ownerId);
    if (!channel) {
      throw new RecordNotFoundError("Channel", "Channel not found for this account.");
    }

    const cleanHandle = input.targetUsername.trim().replace(/^@/, "");
    let targetUser: UserRecord | undefined;
    for (const candidate of this.state.users.values()) {
      if (candidate.username.toLowerCase() === cleanHandle.toLowerCase()) {
        targetUser = candidate;
        break;
      }
    }
    if (!targetUser) {
      throw new RecordNotFoundError("User", `No account found for @${cleanHandle}.`);
    }

    const key = `${channel.id}:${targetUser.id}`;
    const existing = this.state.bans.get(key);
    const now = new Date();
    const record: StoredBan = {
      id: existing?.id ?? `ban_${randomUUID()}`,
      channelId: channel.id,
      userId: targetUser.id,
      reason: input.reason,
      createdAt: existing?.createdAt ?? now,
      expiresAt: null,
    };
    this.state.bans.set(key, record);

    return {
      channelId: channel.id,
      targetUserId: targetUser.id,
      ban: {
        id: record.id,
        userId: targetUser.id,
        username: targetUser.username,
        reason: record.reason,
        bannedAt: record.createdAt.toISOString(),
        expiresAt: null,
      },
    };
  }

  async unbanUserByUsername(ownerId: string, targetUsername: string): Promise<boolean> {
    const channel = this.state.findChannelByOwner(ownerId);
    if (!channel) {
      throw new RecordNotFoundError("Channel", "Channel not found for this account.");
    }

    const cleanHandle = targetUsername.trim().replace(/^@/, "");
    for (const candidate of this.state.users.values()) {
      if (candidate.username.toLowerCase() === cleanHandle.toLowerCase()) {
        return this.state.bans.delete(`${channel.id}:${candidate.id}`);
      }
    }
    return false;
  }

  async setFollowState(userId: string, channelSlug: string, follow: boolean): Promise<string[]> {
    const cleanSlug = channelSlug.trim().replace(/^@/, "");
    const current = this.state.follows.get(userId) ?? [];
    const next = follow
      ? current.includes(cleanSlug)
        ? current
        : [...current, cleanSlug]
      : current.filter((item) => item !== cleanSlug);
    this.state.follows.set(userId, next);
    return [...next];
  }
}

class MemoryRefreshTokenModel implements RefreshTokenModelContract {
  constructor(private readonly state: MemoryState) {}

  async create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord> {
    const record: RefreshTokenRecord = {
      id: `rt_${randomUUID()}`,
      userId: input.userId,
      tokenHash: input.tokenHash,
      rememberMe: input.rememberMe,
      expiresAt: input.expiresAt,
      revokedAt: null,
      createdAt: new Date(),
    };
    this.state.refreshTokens.set(record.id, record);
    return record;
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    for (const token of this.state.refreshTokens.values()) {
      if (token.tokenHash === tokenHash) return token;
    }
    return null;
  }

  async revokeById(id: string): Promise<void> {
    const existing = this.state.refreshTokens.get(id);
    if (existing && !existing.revokedAt) {
      this.state.refreshTokens.set(id, { ...existing, revokedAt: new Date() });
    }
  }

  async revokeByHash(tokenHash: string): Promise<void> {
    for (const [id, token] of this.state.refreshTokens.entries()) {
      if (token.tokenHash === tokenHash && !token.revokedAt) {
        this.state.refreshTokens.set(id, { ...token, revokedAt: new Date() });
      }
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const now = new Date();
    for (const [id, token] of this.state.refreshTokens.entries()) {
      if (token.userId === userId && !token.revokedAt) {
        this.state.refreshTokens.set(id, { ...token, revokedAt: now });
      }
    }
  }
}

export class MemoryModels implements CoreModels {
  private readonly state = new MemoryState();
  readonly users: UserModelContract = new MemoryUserModel(this.state);
  readonly channels: ChannelModelContract = new MemoryChannelModel(this.state);
  readonly refreshTokens: RefreshTokenModelContract = new MemoryRefreshTokenModel(this.state);

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}
}
