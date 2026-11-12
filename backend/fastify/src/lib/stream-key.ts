import { createHash, randomBytes } from "node:crypto";

export function generateStreamKey(prefix: string = "live"): string {
  const random = randomBytes(24).toString("base64url");
  return `${prefix}_${random}`;
}

export function hashStreamKey(streamKey: string): string {
  return createHash("sha256").update(streamKey).digest("hex");
}

