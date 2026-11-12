import { describe, expect, it } from "vitest";
import { parseEnv } from "../../src/config/env.js";
import { parseDotEnv } from "../../src/config/load-env.js";
import {
  generateOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  verifyPassword,
} from "../../src/lib/password.js";

describe("password & token helpers", () => {
  it("hashes and verifies passwords with scrypt", async () => {
    const hash = await hashPassword("StrongPass123!");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("StrongPass123!", hash)).toBe(true);
    expect(await verifyPassword("WrongPass123!", hash)).toBe(false);
    expect(await verifyPassword("StrongPass123!", "invalid-format")).toBe(false);
  });

  it("generates high-entropy opaque tokens and deterministic sha256 digests", () => {
    const t1 = generateOpaqueToken();
    const t2 = generateOpaqueToken();
    expect(t1.length).toBeGreaterThanOrEqual(32);
    expect(t1).not.toBe(t2);
    expect(hashOpaqueToken(t1)).toBe(hashOpaqueToken(t1));
    expect(hashOpaqueToken(t1)).toHaveLength(64);
  });
});

describe("dotEnv & config parsing", () => {
  it("parses .env lines with comments, export prefix, and quoted values", () => {
    const parsed = parseDotEnv(
      [
        "# comment",
        'DATABASE_URL="postgresql://postgres:secret@localhost:5432/velostream"',
        "export FASTIFY_PORT=3005",
        "CORS_ORIGIN='http://localhost:5173'",
        "MEDIA_WEBHOOK_SECRET=dev_secret # trailing comment",
      ].join("\n"),
    );
    expect(parsed.DATABASE_URL).toBe("postgresql://postgres:secret@localhost:5432/velostream");
    expect(parsed.FASTIFY_PORT).toBe("3005");
    expect(parsed.CORS_ORIGIN).toBe("http://localhost:5173");
    expect(parsed.MEDIA_WEBHOOK_SECRET).toBe("dev_secret");
  });

  it("treats blank optional DATABASE_URL as undefined while rejecting invalid URLs", () => {
    const empty = parseEnv({ DATABASE_URL: "   " });
    expect(empty.DATABASE_URL).toBeUndefined();
    expect(() => parseEnv({ DATABASE_URL: "not-a-url" })).toThrow();
  });
});
