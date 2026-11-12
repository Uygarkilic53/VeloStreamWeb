import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AsymmetricJwtService } from "../../src/lib/jwt.js";
import { generateStreamKey, hashStreamKey } from "../../src/lib/stream-key.js";

function createTestKeyPair() {
  return generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
}

describe("AsymmetricJwtService", () => {
  it("signs and verifies EdDSA access tokens", async () => {
    const { privateKey, publicKey } = createTestKeyPair();
    const jwt = new AsymmetricJwtService({
      algorithm: "EdDSA",
      issuer: "velostream-fastify",
      audience: "velostream-clients",
      privateKeyPem: privateKey,
      publicKeyPem: publicKey,
    });

    const token = await jwt.signAccessToken({
      sub: "user_1",
      username: "creator_one",
      role: "CREATOR",
    });

    const claims = await jwt.verifyAccessToken(token);
    expect(claims.sub).toBe("user_1");
    expect(claims.username).toBe("creator_one");
    expect(claims.role).toBe("CREATOR");
  });

  it("rejects tampered tokens and tokens signed by a different key", async () => {
    const keysA = createTestKeyPair();
    const keysB = createTestKeyPair();

    const issuerA = new AsymmetricJwtService({
      algorithm: "EdDSA",
      issuer: "velostream-fastify",
      audience: "velostream-clients",
      privateKeyPem: keysA.privateKey,
      publicKeyPem: keysA.publicKey,
    });

    const verifierB = new AsymmetricJwtService({
      algorithm: "EdDSA",
      issuer: "velostream-fastify",
      audience: "velostream-clients",
      privateKeyPem: keysB.privateKey,
      publicKeyPem: keysB.publicKey,
    });

    const token = await issuerA.signAccessToken({
      sub: "user_1",
      username: "creator_one",
      role: "USER",
    });

    await expect(verifierB.verifyAccessToken(token)).rejects.toThrow();

    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}x.${parts[2]}`;
    await expect(issuerA.verifyAccessToken(tampered)).rejects.toThrow();
  });

  it("exports only public JWK material", async () => {
    const { privateKey, publicKey } = createTestKeyPair();
    const jwt = new AsymmetricJwtService({
      algorithm: "EdDSA",
      issuer: "velostream-fastify",
      audience: "velostream-clients",
      privateKeyPem: privateKey,
      publicKeyPem: publicKey,
    });

    const jwks = await jwt.getPublicJwks();
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]?.use).toBe("sig");
    expect(jwks.keys[0]?.d).toBeUndefined();
  });
});

describe("stream key utilities", () => {
  it("generates unique prefixed stream keys and deterministic sha256 hashes", () => {
    const k1 = generateStreamKey();
    const k2 = generateStreamKey();
    expect(k1.startsWith("live_")).toBe(true);
    expect(k1).not.toBe(k2);
    expect(hashStreamKey(k1)).toHaveLength(64);
    expect(hashStreamKey(k1)).toBe(hashStreamKey(k1));
  });
});

