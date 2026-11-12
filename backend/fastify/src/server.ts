import { buildApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { parseEnv, resolvePemKey } from "./config/env.js";
import { loadFastifyEnv } from "./config/load-env.js";
import { CloudinaryMediaStorage } from "./lib/cloudinary.js";
import { NoopEventPublisher } from "./lib/events.js";
import { AsymmetricJwtService } from "./lib/jwt.js";
import { createFastifyLoggerOptions, createSimpleLogger } from "./lib/logger.js";

async function start(): Promise<void> {
  loadFastifyEnv();
  const env = parseEnv(process.env);
  const startupLogger = createSimpleLogger();

  const privateKeyPem = resolvePemKey(env.JWT_PRIVATE_KEY_PEM, env.JWT_PRIVATE_KEY_PATH);
  const publicKeyPem = resolvePemKey(env.JWT_PUBLIC_KEY_PEM, env.JWT_PUBLIC_KEY_PATH);

  const jwtService =
    privateKeyPem && publicKeyPem
      ? new AsymmetricJwtService({
        algorithm: env.JWT_ALGORITHM,
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        privateKeyPem,
        publicKeyPem,
      })
      : undefined;

  const mediaStorage = env.CLOUDINARY_URL
    ? new CloudinaryMediaStorage({
      cloudinaryUrl: env.CLOUDINARY_URL,
      avatarFolder: env.CLOUDINARY_AVATAR_FOLDER,
    })
    : undefined;

  const dbConn = env.DATABASE_URL ? await connectDatabase(env.DATABASE_URL, startupLogger) : undefined;
  const events = new NoopEventPublisher();

  const app = await buildApp({
    corsOrigin: env.CORS_ORIGIN,
    logger: createFastifyLoggerOptions(),
    ...(jwtService ? { jwtService } : {}),
    ...(dbConn ? { models: dbConn.models } : {}),
    ...(mediaStorage ? { mediaStorage } : {}),
    events,
    accessTokenTtl: env.JWT_ACCESS_TTL,
    refreshTokenTtlDays: env.JWT_REFRESH_TTL_DAYS,
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Shutting down fastify (${signal})`);
    await app.close();
    if (dbConn) {
      await dbConn.close();
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  const address = await app.listen({
    host: env.FASTIFY_HOST,
    port: env.FASTIFY_PORT,
    listenTextResolver: () => "",
  });
  app.log.info(`fastify server is running at ${address}`);
}

start().catch((err) => {
  createSimpleLogger(process.stderr).error(err, "Failed to start fastify");
  process.exit(1);
});
