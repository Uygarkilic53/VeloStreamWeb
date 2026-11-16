import type { PrismaClient } from "@prisma/client";
import {
  isPrismaNotFoundError,
  mapPrismaUniqueError,
  normalizeStreamCategory,
} from "./prisma-helpers.js";
import {
  RecordNotFoundError,
  type AddModeratorInput,
  type ChannelModeratorView,
  type ChannelModelContract,
  type ChannelMuteView,
  type ChannelView,
  type ChannelWarningView,
  type MuteUserInput,
  type PublicUserSummary,
  type RemoveModeratorInput,
  type UnmuteUserInput,
  type UpdateChannelSettingsInput,
  type UpsertChannelBanInput,
  type UpsertChannelBanResult,
  type WarnUserInput,
} from "./types.js";

export function parseDurationToExpiry(duration?: string): Date | null {
  if (!duration || duration === "permanent") return null;
  const now = Date.now();
  switch (duration) {
    case "1h":
      return new Date(now + 60 * 60 * 1000);
    case "5h":
      return new Date(now + 5 * 60 * 60 * 1000);
    case "1d":
      return new Date(now + 24 * 60 * 60 * 1000);
    case "1w":
      return new Date(now + 7 * 24 * 60 * 60 * 1000);
    case "1m":
      return new Date(now + 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

export class ChannelModel implements ChannelModelContract {
  constructor(private readonly prisma: PrismaClient) {}

  async updateSettings(input: UpdateChannelSettingsInput): Promise<ChannelView> {
    try {
      const updated = await this.prisma.channel.update({
        where: { ownerId: input.ownerId },
        data: {
          title: input.title,
          category: input.category,
          ...(input.slowMode !== undefined ? { slowMode: input.slowMode } : {}),
        },
      });
      return {
        id: updated.id,
        slug: updated.slug,
        title: updated.title,
        category: normalizeStreamCategory(updated.category),
        streamKey: updated.streamKey,
        slowMode: updated.slowMode,
        isLive: updated.isLive,
      };
    } catch (err) {
      if (isPrismaNotFoundError(err)) {
        throw new RecordNotFoundError("Channel", "Channel not found for this account.");
      }
      throw err;
    }
  }

  async rotateStreamKey(ownerId: string, nextStreamKey: string): Promise<string> {
    try {
      const updated = await this.prisma.channel.update({
        where: { ownerId },
        data: { streamKey: nextStreamKey },
        select: { streamKey: true },
      });
      return updated.streamKey;
    } catch (err) {
      if (isPrismaNotFoundError(err)) {
        throw new RecordNotFoundError("Channel", "Channel not found for this account.");
      }
      mapPrismaUniqueError(err);
    }
  }

  async banUserByUsername(input: UpsertChannelBanInput): Promise<UpsertChannelBanResult> {
    const channel = await this.resolveChannel(input.channelSlugOrOwnerId, input.ownerId);
    const isOwner = channel.ownerId === input.ownerId;
    const isMod = isOwner ? false : await this.isUserModerator(channel.id, input.ownerId);

    if (!isOwner && !isMod) {
      throw new Error("You do not have permission to ban users in this channel.");
    }

    const cleanHandle = input.targetUsername.trim().replace(/^@/, "");
    const targetUser = await this.prisma.user.findFirst({
      where: { username: { equals: cleanHandle, mode: "insensitive" } },
      select: { id: true, username: true },
    });
    if (!targetUser) {
      throw new RecordNotFoundError("User", `No account found for @${cleanHandle}.`);
    }

    if (targetUser.id === input.ownerId) {
      throw new Error("You cannot ban your own channel account.");
    }

    if (!isOwner) {
      if (targetUser.id === channel.ownerId) {
        throw new Error("Moderators cannot ban the channel creator.");
      }
      const targetIsMod = await this.isUserModerator(channel.id, targetUser.id);
      if (targetIsMod) {
        throw new Error("Moderators cannot ban peer moderators.");
      }
    }

    const ban = await this.prisma.channelBan.upsert({
      where: {
        channelId_userId: {
          channelId: channel.id,
          userId: targetUser.id,
        },
      },
      update: {
        issuedBy: input.ownerId,
        reason: input.reason,
        expiresAt: null,
      },
      create: {
        channelId: channel.id,
        userId: targetUser.id,
        issuedBy: input.ownerId,
        reason: input.reason,
      },
    });

    // Remove any active follow from the banned user to this channel
    await this.prisma.channelFollow.deleteMany({
      where: {
        userId: targetUser.id,
        channelSlug: { equals: channel.slug, mode: "insensitive" },
      },
    });

    return {
      channelId: channel.id,
      targetUserId: targetUser.id,
      ban: {
        id: ban.id,
        userId: targetUser.id,
        username: targetUser.username,
        reason: ban.reason,
        bannedAt: ban.createdAt.toISOString(),
        expiresAt: ban.expiresAt ? ban.expiresAt.toISOString() : null,
      },
    };
  }

  async isUserBanned(
    channelSlugOrUsername: string,
    userId: string,
  ): Promise<{ isBanned: boolean; reason?: string }> {
    const clean = channelSlugOrUsername.trim().replace(/^@/, "");
    if (!clean || !userId) {
      return { isBanned: false };
    }
    const ban = await this.prisma.channelBan.findFirst({
      where: {
        userId,
        channel: {
          OR: [
            { slug: { equals: clean, mode: "insensitive" } },
            { owner: { username: { equals: clean, mode: "insensitive" } } },
          ],
        },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { reason: true },
    });
    return {
      isBanned: Boolean(ban),
      ...(ban ? { reason: ban.reason } : {}),
    };
  }

  async unbanUserByUsername(ownerId: string, targetUsername: string, channelSlugOrOwnerId?: string): Promise<boolean> {
    const channel = await this.resolveChannel(channelSlugOrOwnerId, ownerId);
    const isOwner = channel.ownerId === ownerId;
    const isMod = isOwner ? false : await this.isUserModerator(channel.id, ownerId);

    if (!isOwner && !isMod) {
      throw new Error("You do not have permission to unban users in this channel.");
    }

    const cleanHandle = targetUsername.trim().replace(/^@/, "");
    const targetUser = await this.prisma.user.findFirst({
      where: { username: { equals: cleanHandle, mode: "insensitive" } },
      select: { id: true },
    });
    if (!targetUser) {
      return false;
    }

    if (!isOwner) {
      if (targetUser.id === channel.ownerId) {
        throw new Error("Moderators cannot modify status of channel creator.");
      }
      const targetIsMod = await this.isUserModerator(channel.id, targetUser.id);
      if (targetIsMod) {
        throw new Error("Moderators cannot unban peer moderators.");
      }
    }

    const deleted = await this.prisma.channelBan.deleteMany({
      where: {
        channelId: channel.id,
        userId: targetUser.id,
      },
    });
    return deleted.count > 0;
  }

  async setFollowState(userId: string, channelSlug: string, follow: boolean): Promise<string[]> {
    const cleanSlug = channelSlug.trim().replace(/^@/, "");
    if (follow) {
      await this.prisma.channelFollow.upsert({
        where: {
          userId_channelSlug: {
            userId,
            channelSlug: cleanSlug,
          },
        },
        update: {},
        create: {
          userId,
          channelSlug: cleanSlug,
        },
      });
    } else {
      await this.prisma.channelFollow.deleteMany({
        where: {
          userId,
          channelSlug: cleanSlug,
        },
      });
    }

    const rows = await this.prisma.channelFollow.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { channelSlug: true },
    });
    return rows.map((row) => row.channelSlug);
  }

  async getLiveChannels(excludeUserId?: string): Promise<PublicUserSummary[]> {
    const liveChannels = await this.prisma.channel.findMany({
      where: {
        isLive: true,
        ...(excludeUserId
          ? {
              bans: {
                none: {
                  userId: excludeUserId,
                  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                },
              },
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            bio: true,
          },
        },
      },
    });

    return liveChannels.map((ch) => ({
      id: ch.owner.id,
      username: ch.owner.username,
      displayName: ch.owner.displayName,
      avatarUrl: ch.owner.avatarUrl ?? null,
      bio: ch.owner.bio,
      isLive: true,
      channelTitle: ch.title,
      channelCategory: normalizeStreamCategory(ch.category),
    }));
  }

  async setLiveStatus(ownerId: string, isLive: boolean): Promise<ChannelView> {
    try {
      const updated = await this.prisma.channel.update({
        where: { ownerId },
        data: { isLive },
      });
      return {
        id: updated.id,
        slug: updated.slug,
        title: updated.title,
        category: normalizeStreamCategory(updated.category),
        streamKey: updated.streamKey,
        slowMode: updated.slowMode,
        isLive: updated.isLive,
      };
    } catch (err) {
      if (isPrismaNotFoundError(err)) {
        throw new RecordNotFoundError("Channel", "Channel not found for this account.");
      }
      throw err;
    }
  }

  async clearChatMessages(channelId: string): Promise<void> {
    await this.prisma.chatMessage.deleteMany({
      where: { channelId },
    });
  }

  private async resolveChannel(slugOrOwnerId?: string, fallbackOwnerId?: string) {
    const query = slugOrOwnerId?.trim().replace(/^@/, "");
    if (!query && !fallbackOwnerId) {
      throw new RecordNotFoundError("Channel", "Channel identifier is required.");
    }
    const channel = await this.prisma.channel.findFirst({
      where: query
        ? {
            OR: [
              { id: query },
              { ownerId: query },
              { slug: { equals: query, mode: "insensitive" as const } },
              { owner: { username: { equals: query, mode: "insensitive" as const } } },
            ],
          }
        : { ownerId: fallbackOwnerId as string },
      include: { owner: true },
    });
    if (!channel) {
      throw new RecordNotFoundError("Channel", "Channel not found.");
    }
    return channel;
  }

  async addModerator(input: AddModeratorInput): Promise<ChannelModeratorView> {
    const channel = await this.resolveChannel(input.channelSlug, input.ownerId);
    if (!channel) {
      throw new RecordNotFoundError("Channel", "Channel not found for this account.");
    }
    if (channel.ownerId !== input.ownerId) {
      throw new Error("You do not have permission to manage moderators for this channel.");
    }

    const cleanHandle = input.targetUsername.trim().replace(/^@/, "");
    const targetUser = await this.prisma.user.findFirst({
      where: { username: { equals: cleanHandle, mode: "insensitive" } },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
    });
    if (!targetUser) {
      throw new RecordNotFoundError("User", `No account found for @${cleanHandle}.`);
    }

    if (targetUser.id === channel.ownerId) {
      throw new Error("Channel owner cannot be added as a moderator.");
    }

    const moderator = await this.prisma.channelModerator.upsert({
      where: {
        channelId_userId: {
          channelId: channel.id,
          userId: targetUser.id,
        },
      },
      update: { assignedBy: input.ownerId },
      create: {
        channelId: channel.id,
        userId: targetUser.id,
        assignedBy: input.ownerId,
      },
    });

    return {
      id: moderator.id,
      userId: targetUser.id,
      username: targetUser.username,
      displayName: targetUser.displayName,
      avatarUrl: targetUser.avatarUrl,
      assignedAt: moderator.createdAt.toISOString(),
    };
  }

  async removeModerator(input: RemoveModeratorInput): Promise<boolean> {
    const channel = await this.resolveChannel(input.channelSlug, input.ownerId);
    if (!channel) {
      throw new RecordNotFoundError("Channel", "Channel not found for this account.");
    }
    if (channel.ownerId !== input.ownerId) {
      throw new Error("You do not have permission to manage moderators for this channel.");
    }

    const cleanHandle = input.targetUsername.trim().replace(/^@/, "");
    const targetUser = await this.prisma.user.findFirst({
      where: { username: { equals: cleanHandle, mode: "insensitive" } },
      select: { id: true },
    });
    if (!targetUser) {
      return false;
    }

    const deleted = await this.prisma.channelModerator.deleteMany({
      where: {
        channelId: channel.id,
        userId: targetUser.id,
      },
    });
    return deleted.count > 0;
  }

  async listModerators(channelSlugOrOwnerId: string): Promise<ChannelModeratorView[]> {
    const channel = await this.resolveChannel(channelSlugOrOwnerId);
    const moderators = await this.prisma.channelModerator.findMany({
      where: { channelId: channel.id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return moderators.map((m) => ({
      id: m.id,
      userId: m.user.id,
      username: m.user.username,
      displayName: m.user.displayName,
      avatarUrl: m.user.avatarUrl,
      assignedAt: m.createdAt.toISOString(),
    }));
  }

  async isUserModerator(channelId: string, userId: string): Promise<boolean> {
    const mod = await this.prisma.channelModerator.findUnique({
      where: { channelId_userId: { channelId, userId } },
      select: { id: true },
    });
    return Boolean(mod);
  }

  async muteUser(input: MuteUserInput): Promise<ChannelMuteView> {
    const channel = await this.resolveChannel(input.channelSlugOrOwnerId, input.actorUserId);
    const isOwner = channel.ownerId === input.actorUserId;
    const isMod = isOwner ? false : await this.isUserModerator(channel.id, input.actorUserId);

    if (!isOwner && !isMod) {
      throw new Error("You do not have permission to silence users in this channel.");
    }

    const cleanHandle = input.targetUsername.trim().replace(/^@/, "");
    const targetUser = await this.prisma.user.findFirst({
      where: { username: { equals: cleanHandle, mode: "insensitive" } },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
    });
    if (!targetUser) {
      throw new RecordNotFoundError("User", `No account found for @${cleanHandle}.`);
    }

    if (targetUser.id === input.actorUserId) {
      throw new Error("You cannot silence yourself.");
    }

    if (!isOwner) {
      if (targetUser.id === channel.ownerId) {
        throw new Error("Moderators cannot silence the channel creator.");
      }
      const targetIsMod = await this.isUserModerator(channel.id, targetUser.id);
      if (targetIsMod) {
        throw new Error("Moderators cannot silence peer moderators.");
      }
    }

    const expiresAt = parseDurationToExpiry(input.duration);
    const mute = await this.prisma.channelMute.upsert({
      where: {
        channelId_userId: {
          channelId: channel.id,
          userId: targetUser.id,
        },
      },
      update: {
        issuedBy: input.actorUserId,
        reason: input.reason ?? "",
        expiresAt,
      },
      create: {
        channelId: channel.id,
        userId: targetUser.id,
        issuedBy: input.actorUserId,
        reason: input.reason ?? "",
        expiresAt,
      },
    });

    return {
      id: mute.id,
      userId: targetUser.id,
      username: targetUser.username,
      displayName: targetUser.displayName,
      avatarUrl: targetUser.avatarUrl,
      reason: mute.reason,
      expiresAt: mute.expiresAt ? mute.expiresAt.toISOString() : null,
      mutedAt: mute.createdAt.toISOString(),
    };
  }

  async unmuteUser(input: UnmuteUserInput): Promise<boolean> {
    const channel = await this.resolveChannel(input.channelSlugOrOwnerId, input.actorUserId);
    const isOwner = channel.ownerId === input.actorUserId;
    const isMod = isOwner ? false : await this.isUserModerator(channel.id, input.actorUserId);

    if (!isOwner && !isMod) {
      throw new Error("You do not have permission to unsilence users in this channel.");
    }

    const cleanHandle = input.targetUsername.trim().replace(/^@/, "");
    const targetUser = await this.prisma.user.findFirst({
      where: { username: { equals: cleanHandle, mode: "insensitive" } },
      select: { id: true },
    });
    if (!targetUser) {
      return false;
    }

    if (!isOwner) {
      if (targetUser.id === channel.ownerId) {
        throw new Error("Moderators cannot modify status of channel creator.");
      }
      const targetIsMod = await this.isUserModerator(channel.id, targetUser.id);
      if (targetIsMod) {
        throw new Error("Moderators cannot unsilence peer moderators.");
      }
    }

    const deleted = await this.prisma.channelMute.deleteMany({
      where: {
        channelId: channel.id,
        userId: targetUser.id,
      },
    });
    return deleted.count > 0;
  }

  async listMutes(channelSlugOrOwnerId: string): Promise<ChannelMuteView[]> {
    const channel = await this.resolveChannel(channelSlugOrOwnerId);
    const mutes = await this.prisma.channelMute.findMany({
      where: {
        channelId: channel.id,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return mutes.map((m) => ({
      id: m.id,
      userId: m.user.id,
      username: m.user.username,
      displayName: m.user.displayName,
      avatarUrl: m.user.avatarUrl,
      reason: m.reason,
      expiresAt: m.expiresAt ? m.expiresAt.toISOString() : null,
      mutedAt: m.createdAt.toISOString(),
    }));
  }

  async getUserMute(
    channelId: string,
    userId: string,
  ): Promise<{ isMuted: boolean; expiresAt: string | null; reason: string }> {
    const mute = await this.prisma.channelMute.findFirst({
      where: {
        channelId,
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { expiresAt: true, reason: true },
    });
    return {
      isMuted: Boolean(mute),
      expiresAt: mute?.expiresAt ? mute.expiresAt.toISOString() : null,
      reason: mute?.reason ?? "",
    };
  }

  async warnUser(input: WarnUserInput): Promise<ChannelWarningView> {
    const channel = await this.resolveChannel(input.channelSlugOrOwnerId, input.actorUserId);
    const isOwner = channel.ownerId === input.actorUserId;
    const isMod = isOwner ? false : await this.isUserModerator(channel.id, input.actorUserId);

    if (!isOwner && !isMod) {
      throw new Error("You do not have permission to warn users in this channel.");
    }

    const cleanHandle = input.targetUsername.trim().replace(/^@/, "");
    const targetUser = await this.prisma.user.findFirst({
      where: { username: { equals: cleanHandle, mode: "insensitive" } },
      select: { id: true, username: true },
    });
    if (!targetUser) {
      throw new RecordNotFoundError("User", `No account found for @${cleanHandle}.`);
    }

    if (targetUser.id === input.actorUserId) {
      throw new Error("You cannot send a warning to yourself.");
    }

    if (!isOwner) {
      if (targetUser.id === channel.ownerId) {
        throw new Error("Moderators cannot warn the channel creator.");
      }
      const targetIsMod = await this.isUserModerator(channel.id, targetUser.id);
      if (targetIsMod) {
        throw new Error("Moderators cannot warn peer moderators.");
      }
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: input.actorUserId },
      select: { username: true },
    });

    const warning = await this.prisma.channelWarning.create({
      data: {
        channelId: channel.id,
        userId: targetUser.id,
        issuedBy: input.actorUserId,
        reason: input.reason,
      },
    });

    return {
      id: warning.id,
      channelId: channel.id,
      userId: targetUser.id,
      username: targetUser.username,
      moderatorUsername: actor?.username ?? "moderator",
      reason: warning.reason,
      createdAt: warning.createdAt.toISOString(),
    };
  }
}
