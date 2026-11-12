import { describe, expect, it } from "vitest";
import { parseCloudinaryUrl, parseEnv, resolvePemKey } from "../../src/config/env.js";

describe("fastify env config", () => {
  it("applies safe defaults when optional vars are omitted", () => {
    const env = parseEnv({});
    expect(env.FASTIFY_PORT).toBe(3001);
    expect(env.JWT_ALGORITHM).toBe("EdDSA");
    expect(env.CORS_ORIGIN).toBe("http://localhost:5173");
    expect(env.CLOUDINARY_AVATAR_FOLDER).toBe("VeloStream/avatar");
    expect(env.CLOUDINARY_URL).toBeUndefined();
  });

  it("rejects invalid port numbers, malformed database URLs, and malformed CLOUDINARY_URL", () => {
    expect(() => parseEnv({ FASTIFY_PORT: "99999" })).toThrow();
    expect(() => parseEnv({ DATABASE_URL: "not-a-valid-url" })).toThrow();
    expect(() => parseEnv({ CLOUDINARY_URL: "https://example.com" })).toThrow();
    expect(() => parseEnv({ CLOUDINARY_URL: "cloudinary://missing-secret@cloud" })).toThrow();
  });

  it("parses valid CLOUDINARY_URL credentials cleanly", () => {
    const creds = parseCloudinaryUrl("cloudinary://12345:secret_abc@my_cloud");
    expect(creds).toEqual({
      apiKey: "12345",
      apiSecret: "secret_abc",
      cloudName: "my_cloud",
    });

    const env = parseEnv({ CLOUDINARY_URL: "cloudinary://12345:secret_abc@my_cloud" });
    expect(env.CLOUDINARY_URL).toBe("cloudinary://12345:secret_abc@my_cloud");
  });

  it("normalizes escaped newlines in inline PEM values", () => {
    const pem = resolvePemKey("LINE1\\nLINE2", undefined);
    expect(pem).toBe("LINE1\nLINE2");
  });
});

