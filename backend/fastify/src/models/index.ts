import type { PrismaClient } from "@prisma/client";
import { ChannelModel } from "./channel.model.js";
import { RefreshTokenModel } from "./refresh-token.model.js";
import type { CoreModels } from "./types.js";
import { UserModel } from "./user.model.js";

export * from "./types.js";
export { ChannelModel } from "./channel.model.js";
export { MemoryModels } from "./memory-store.js";
export { RefreshTokenModel } from "./refresh-token.model.js";
export { UserModel } from "./user.model.js";

export function createPrismaModels(prisma: PrismaClient): CoreModels {
  return {
    users: new UserModel(prisma),
    channels: new ChannelModel(prisma),
    refreshTokens: new RefreshTokenModel(prisma),
    async ping(): Promise<boolean> {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    },
    async close(): Promise<void> {
      await prisma.$disconnect();
    },
  };
}
