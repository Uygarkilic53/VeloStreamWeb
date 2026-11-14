import { Prisma } from "@prisma/client";
import {
  RecordNotFoundError,
  STREAM_CATEGORIES,
  UniqueConstraintError,
  type StreamCategory,
} from "./types.js";

const CATEGORY_SET = new Set<string>(STREAM_CATEGORIES);

export function normalizeStreamCategory(raw: string): StreamCategory {
  return CATEGORY_SET.has(raw) ? (raw as StreamCategory) : "Programming";
}

function extractPrismaTarget(meta: Record<string, unknown> | undefined): string {
  const target = meta?.target;
  if (Array.isArray(target)) {
    return target.map(String).join(",").toLowerCase();
  }
  if (typeof target === "string") {
    return target.toLowerCase();
  }
  return "";
}

export function mapPrismaUniqueError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = extractPrismaTarget(err.meta);
    if (target.includes("email")) {
      throw new UniqueConstraintError("email", "An account with this email already exists.");
    }
    if (target.includes("slug")) {
      throw new UniqueConstraintError("slug", "That username is already registered.");
    }
    if (target.includes("stream_key") || target.includes("streamkey")) {
      throw new UniqueConstraintError("streamKey", "Generated stream key collided; please retry.");
    }
    throw new UniqueConstraintError("username", "That username is already registered.");
  }
  throw err;
}

export function isPrismaNotFoundError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025";
}

export { RecordNotFoundError };
