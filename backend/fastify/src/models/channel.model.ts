import type { PrismaClient } from "@prisma/client";
import {
  isPrismaNotFoundError,
  mapPrismaUniqueError,
  normalizeStreamCategory,
} from "./prisma-helpers.js";
import {
  RecordNotFoundError,
  type ChannelModelContract,
  type ChannelView,
  type UpdateChannelSettingsInput,
  type UpsertChannelBanInput,
  type UpsertChannelBanResult,
} from "./types.js";

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
    const channel = await this.prisma.channel.findUnique({
      where: { ownerId: input.ownerId },
      select: { id: true },
    });
    if (!channel) {
      throw new RecordNotFoundError("Channel", "Channel not found for this account.");
    }

    const cleanHandle = input.targetUsername.trim().replace(/^@/, "");
    const targetUser = await this.prisma.user.findFirst({
      where: { username: { equals: cleanHandle, mode: "insensitive" } },
      select: { id: true, username: true },
    });
    if (!targetUser) {
      throw new RecordNotFoundError("User", `No account found for @${cleanHandle}.`);
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

  async unbanUserByUsername(ownerId: string, targetUsername: string): Promise<boolean> {
    const channel = await this.prisma.channel.findUnique({
      where: { ownerId },
      select: { id: true },
    });
    if (!channel) {
      throw new RecordNotFoundError("Channel", "Channel not found for this account.");
    }

    const cleanHandle = targetUsername.trim().replace(/^@/, "");
    const targetUser = await this.prisma.user.findFirst({
      where: { username: { equals: cleanHandle, mode: "insensitive" } },
      select: { id: true },
    });
    if (!targetUser) {
      return false;
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
}
