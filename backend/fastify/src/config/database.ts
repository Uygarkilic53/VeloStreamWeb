import { PrismaClient } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import { createPrismaModels, type CoreModels } from "../models/index.js";

export interface DatabaseConnection {
  prisma: PrismaClient;
  models: CoreModels;
  close: () => Promise<void>;
}

export async function connectDatabase(
  databaseUrl: string,
  logger?: Pick<FastifyBaseLogger, "info" | "warn" | "error">,
): Promise<DatabaseConnection> {
  const prisma = new PrismaClient({
    datasourceUrl: databaseUrl,
  });

  const models = createPrismaModels(prisma);

  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    logger?.info("PostgreSQL connection established");
  } catch (err) {
    logger?.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "PostgreSQL initial connection probe failed (check DATABASE_URL in backend/fastify/.env)",
    );
  }

  return {
    prisma,
    models,
    close: () => models.close(),
  };
}
