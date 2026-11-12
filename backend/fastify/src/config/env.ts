import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { FASTIFY_ROOT } from "./load-env.js";

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().url().optional(),
);

const optionalCloudinaryUrl = z.preprocess(
  (value) =>
    typeof value === "string" ? (value.trim() === "" ? undefined : value.trim()) : value,
  z
    .string()
    .refine((value) => {
      try {
        parseCloudinaryUrl(value);
        return true;
      } catch {
        return false;
      }
    }, "CLOUDINARY_URL must match cloudinary://<api_key>:<api_secret>@<cloud_name>")
    .optional(),
);

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export function parseCloudinaryUrl(rawUrl: string): CloudinaryCredentials {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("Invalid CLOUDINARY_URL format.");
  }

  if (parsed.protocol !== "cloudinary:") {
    throw new Error("CLOUDINARY_URL must use the cloudinary:// scheme.");
  }

  const cloudName = parsed.hostname.trim();
  const apiKey = decodeURIComponent(parsed.username);
  const apiSecret = decodeURIComponent(parsed.password);

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("CLOUDINARY_URL must include api_key, api_secret, and cloud_name.");
  }

  return { cloudName, apiKey, apiSecret };
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  FASTIFY_HOST: z.string().min(1).default("0.0.0.0"),
  FASTIFY_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  DATABASE_URL: optionalUrl,
  JWT_ALGORITHM: z.enum(["EdDSA", "RS256"]).default("EdDSA"),
  JWT_ISSUER: z.string().min(1).default("velostream-fastify"),
  JWT_AUDIENCE: z.string().min(1).default("velostream-clients"),
  JWT_PRIVATE_KEY_PATH: z.string().optional(),
  JWT_PUBLIC_KEY_PATH: z.string().optional(),
  JWT_PRIVATE_KEY_PEM: z.string().optional(),
  JWT_PUBLIC_KEY_PEM: z.string().optional(),
  JWT_ACCESS_TTL: z.string().min(2).default("15m"),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  MEDIA_WEBHOOK_SECRET: z.string().optional(),
  CLOUDINARY_URL: optionalCloudinaryUrl,
  CLOUDINARY_AVATAR_FOLDER: z.string().trim().min(1).default("VeloStream/avatar"),
});

export type FastifyEnv = z.infer<typeof EnvSchema>;

export function parseEnv(raw: NodeJS.ProcessEnv): FastifyEnv {
  const normalized: NodeJS.ProcessEnv = {
    ...raw,
    ...(raw.FASTIFY_PORT === undefined && raw.PORT !== undefined ? { FASTIFY_PORT: raw.PORT } : {}),
  };
  return EnvSchema.parse(normalized);
}

export function resolvePemKey(
  inlinePem: string | undefined,
  filePath: string | undefined,
  cwd: string = process.cwd(),
): string | undefined {
  if (inlinePem && inlinePem.trim().length > 0) {
    return inlinePem.replace(/\\n/g, "\n");
  }
  if (filePath && filePath.trim().length > 0) {
    if (path.isAbsolute(filePath)) {
      return readFileSync(filePath, "utf8");
    }
    const fromCwd = path.resolve(cwd, filePath);
    if (existsSync(fromCwd)) {
      return readFileSync(fromCwd, "utf8");
    }
    const fromPackageRoot = path.resolve(FASTIFY_ROOT, filePath);
    if (existsSync(fromPackageRoot)) {
      return readFileSync(fromPackageRoot, "utf8");
    }
    return readFileSync(fromCwd, "utf8");
  }
  return undefined;
}
