import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { AsymmetricJwtService } from "../../src/lib/jwt.js";
import { createFastifyLoggerOptions } from "../../src/lib/logger.js";
import { hashPassword } from "../../src/lib/password.js";
import { MemoryModels } from "../../src/models/index.js";

describe("fastify integration (.inject())", () => {
  const appsToClose: FastifyInstance[] = [];

  afterEach(async () => {
    while (appsToClose.length > 0) {
      const app = appsToClose.pop();
      if (app) {
        await app.close();
      }
    }
  });

  it("does not expose removed /healthz endpoint", async () => {
    const app = await buildApp();
    appsToClose.push(app);

    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(404);
  });

  it("searches users online or offline by username or displayName and returns related live users without leaking secrets", async () => {
    const models = new MemoryModels();
    const passwordHash = await hashPassword("StrongPass123");

    const mira = await models.users.createWithChannel({
      username: "mira_codes",
      displayName: "Mira Vance",
      email: "mira@velostream.dev",
      passwordHash,
      streamKey: "live_secret_mira",
      channelTitle: "Rust graphics engine live",
      channelCategory: "Programming",
    });
    await models.users.updateAvatarUrl(
      mira.id,
      "https://res.cloudinary.com/demo/image/upload/v1/VeloStream/avatar/mira.png",
    );

    const offlineDev = await models.users.createWithChannel({
      username: "deniz_k",
      displayName: "Deniz Kaya",
      email: "deniz@velostream.dev",
      passwordHash,
      streamKey: "live_secret_deniz",
      channelTitle: "Go fiber chat internals",
      channelCategory: "Programming",
    });
    await models.users.updateAvatarUrl(
      offlineDev.id,
      "https://res.cloudinary.com/demo/image/upload/v1/VeloStream/avatar/deniz.png",
    );

    const livePeer = await models.users.createWithChannel({
      username: "nils_go",
      displayName: "Nils Lindqvist",
      email: "nils@velostream.dev",
      passwordHash,
      streamKey: "live_secret_nils",
      channelTitle: "Distributed Raft in Go",
      channelCategory: "Programming",
    });

    // Mark mira_codes and nils_go as live via in-memory channel state
    const state = (models as unknown as { state: { channels: Map<string, { ownerId: string; isLive: boolean }> } }).state;
    for (const ch of state.channels.values()) {
      if (ch.ownerId === mira.id || ch.ownerId === livePeer.id) {
        ch.isLive = true;
      }
    }

    const app = await buildApp({ models });
    appsToClose.push(app);

    // Search offline user by displayName
    const resByName = await app.inject({
      method: "GET",
      url: "/api/v1/users/search?q=Deniz%20Kaya",
    });
    expect(resByName.statusCode).toBe(200);
    const byNameBody = resByName.json();
    expect(byNameBody.users).toHaveLength(1);
    expect(byNameBody.users[0]).toMatchObject({
      username: "deniz_k",
      displayName: "Deniz Kaya",
      avatarUrl: "https://res.cloudinary.com/demo/image/upload/v1/VeloStream/avatar/deniz.png",
      isLive: false,
      channelCategory: "Programming",
    });
    expect(byNameBody.users[0].email).toBeUndefined();
    expect(byNameBody.users[0].streamKey).toBeUndefined();
    expect(byNameBody.users[0].passwordHash).toBeUndefined();

    // Related live users include live Programming creators
    expect(byNameBody.relatedLiveUsers.length).toBe(2);
    expect(byNameBody.relatedLiveUsers.every((u: { isLive: boolean }) => u.isLive)).toBe(true);
    expect(byNameBody.relatedLiveUsers.map((u: { username: string }) => u.username)).toEqual(
      expect.arrayContaining(["mira_codes", "nils_go"]),
    );

    // Search with @ prefix by username
    const resByHandle = await app.inject({
      method: "GET",
      url: "/api/v1/users/search?q=%40mira",
    });
    expect(resByHandle.statusCode).toBe(200);
    expect(resByHandle.json().users[0]).toMatchObject({
      username: "mira_codes",
      displayName: "Mira Vance",
      isLive: true,
    });

    // Empty query returns empty arrays cleanly
    const emptyRes = await app.inject({ method: "GET", url: "/api/v1/users/search?q=" });
    expect(emptyRes.statusCode).toBe(200);
    expect(emptyRes.json()).toEqual({ query: "", users: [], relatedLiveUsers: [] });

    // Public profile lookup by username
    const profileRes = await app.inject({ method: "GET", url: "/api/v1/users/deniz_k" });
    expect(profileRes.statusCode).toBe(200);
    expect(profileRes.json().user.username).toBe("deniz_k");

    const missingRes = await app.inject({ method: "GET", url: "/api/v1/users/nobody_here" });
    expect(missingRes.statusCode).toBe(404);
  });

  it("excludes the authenticated user from GET /api/v1/users/search results (both users and relatedLiveUsers)", async () => {
    const models = new MemoryModels();
    const passwordHash = await hashPassword("StrongPass123");
    const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const jwtService = new AsymmetricJwtService({
      algorithm: "EdDSA",
      issuer: "velostream-fastify",
      audience: "velostream-clients",
      privateKeyPem: privateKey,
      publicKeyPem: publicKey,
    });

    const mira = await models.users.createWithChannel({
      username: "mira_dev",
      displayName: "Mira Vance",
      email: "mira@velostream.dev",
      passwordHash,
      streamKey: "live_secret_mira",
      channelTitle: "Rust graphics engine live",
      channelCategory: "Programming",
    });
    const nils = await models.users.createWithChannel({
      username: "nils_dev",
      displayName: "Nils Lindqvist",
      email: "nils@velostream.dev",
      passwordHash,
      streamKey: "live_secret_nils",
      channelTitle: "Distributed Raft in Go",
      channelCategory: "Programming",
    });

    const state = (models as unknown as { state: { channels: Map<string, { ownerId: string; isLive: boolean }> } }).state;
    for (const ch of state.channels.values()) {
      if (ch.ownerId === mira.id || ch.ownerId === nils.id) {
        ch.isLive = true;
      }
    }

    const app = await buildApp({ models, jwtService });
    appsToClose.push(app);

    const miraToken = await jwtService.signAccessToken(
      { sub: mira.id, username: mira.username, role: mira.role },
      "15m",
    );

    // Searching for exact own username (including @-prefixed and display name) excludes self from both users and relatedLiveUsers
    for (const q of ["mira_dev", "%40mira_dev", "Mira%20Vance", "Programming"]) {
      const selfSearch = await app.inject({
        method: "GET",
        url: `/api/v1/users/search?q=${q}`,
        headers: { Authorization: `Bearer ${miraToken}` },
      });
      expect(selfSearch.statusCode).toBe(200);
      expect(
        selfSearch.json().users.some((u: { id: string }) => u.id === mira.id),
      ).toBe(false);
      expect(
        selfSearch.json().relatedLiveUsers.some((u: { id: string }) => u.id === mira.id),
      ).toBe(false);
    }

    // Searching a shared substring returns other matching users, still excluding self
    const sharedSearch = await app.inject({
      method: "GET",
      url: "/api/v1/users/search?q=dev",
      headers: { Authorization: `Bearer ${miraToken}` },
    });
    expect(sharedSearch.statusCode).toBe(200);
    expect(sharedSearch.json().users.map((u: { username: string }) => u.username)).toEqual(["nils_dev"]);
    expect(
      sharedSearch.json().relatedLiveUsers.map((u: { username: string }) => u.username),
    ).toEqual(["nils_dev"]);

    // Invalid/expired token on public search still works anonymously without 401
    const invalidTokenSearch = await app.inject({
      method: "GET",
      url: "/api/v1/users/search?q=mira_dev",
      headers: { Authorization: "Bearer invalid.jwt.token" },
    });
    expect(invalidTokenSearch.statusCode).toBe(200);
    expect(invalidTokenSearch.json().users.map((u: { username: string }) => u.username)).toEqual([
      "mira_dev",
    ]);
  });

  it("serves public JWKS on /.well-known/jwks.json and 503 when unconfigured", async () => {
    const unconfiguredApp = await buildApp();
    appsToClose.push(unconfiguredApp);
    const res503 = await unconfiguredApp.inject({
      method: "GET",
      url: "/.well-known/jwks.json",
    });
    expect(res503.statusCode).toBe(503);

    const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });

    const jwtService = new AsymmetricJwtService({
      algorithm: "EdDSA",
      issuer: "velostream-fastify",
      audience: "velostream-clients",
      privateKeyPem: privateKey,
      publicKeyPem: publicKey,
    });

    const configuredApp = await buildApp({ jwtService });
    appsToClose.push(configuredApp);

    const res200 = await configuredApp.inject({
      method: "GET",
      url: "/.well-known/jwks.json",
    });
    expect(res200.statusCode).toBe(200);
    const jwks = res200.json();
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0].d).toBeUndefined();
    expect(jwks.keys[0].alg).toBe("EdDSA");
  });

  it("serves OpenAPI spec at /docs/json and Swagger UI at /docs", async () => {
    const app = await buildApp();
    appsToClose.push(app);

    const specRes = await app.inject({ method: "GET", url: "/docs/json" });
    expect(specRes.statusCode).toBe(200);
    const spec = specRes.json();
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.paths["/healthz"]).toBeUndefined();
    expect(spec.paths["/api/v1/auth/register"]).toBeDefined();
    expect(
      spec.paths["/api/v1/auth/register"].post.requestBody.content["application/json"].schema
        .properties.username.pattern,
    ).toBe("^[a-zA-Z0-9_]+$");
    expect(
      spec.paths["/api/v1/users/me"].patch.requestBody.content["application/json"].schema
        .properties.username.pattern,
    ).toBe("^[a-zA-Z0-9_]+$");
    expect(spec.paths["/api/v1/auth/login"]).toBeDefined();
    expect(spec.paths["/api/v1/auth/logout"]).toBeDefined();
    expect(spec.paths["/api/v1/users/search"]).toBeDefined();
    expect(spec.paths["/api/v1/users/{username}"]).toBeDefined();
    expect(spec.paths["/api/v1/users/{username}"].get.responses["403"]).toBeDefined();
    expect(spec.paths["/api/v1/users/me/follows/{slug}"].post.responses["403"]).toBeDefined();
    expect(spec.paths["/api/v1/users/me/avatar"]).toBeDefined();
    expect(spec.paths["/api/v1/channels/live"]).toBeDefined();
    expect(spec.paths["/api/v1/channels/me/live"]).toBeDefined();
    expect(spec.paths["/api/v1/users/me/following"]).toBeDefined();
    expect(spec.paths["/api/v1/users/me/theme"]).toBeDefined();
    expect(
      spec.paths["/api/v1/users/me/theme"].patch.requestBody.content["application/json"].schema
        .properties.theme.enum,
    ).toEqual(["light", "dark"]);
    expect(
      spec.paths["/api/v1/users/me/avatar"].post.requestBody.content["multipart/form-data"].schema
        .properties.avatar.format,
    ).toBe("binary");
    expect(
      spec.paths["/api/v1/users/me/avatar"].delete.responses["200"].content["application/json"]
        .schema.properties.avatarUrl.type,
    ).toBe("string");
    expect(spec.components.securitySchemes.bearerAuth).toBeDefined();

    const uiRes = await app.inject({ method: "GET", url: "/docs/" });
    expect(uiRes.statusCode).toBe(200);
    expect(uiRes.headers["content-type"]).toContain("text/html");
  });

  it("logs concise plain-text single-line request summaries without JSON noise", async () => {
    const logLines: string[] = [];
    const app = await buildApp({
      models: new MemoryModels(),
      logger: createFastifyLoggerOptions({
        output: {
          write(chunk: string | Uint8Array): boolean {
            logLines.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
            return true;
          },
        },
      }),
    });
    appsToClose.push(app);

    const preflightRes = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/users/search",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "GET",
      },
    });
    expect(preflightRes.statusCode).toBe(204);

    const searchRes = await app.inject({
      method: "GET",
      url: "/api/v1/users/search?q=mira",
    });
    expect(searchRes.statusCode).toBe(200);

    const missingRes = await app.inject({
      method: "GET",
      url: "/does-not-exist",
    });
    expect(missingRes.statusCode).toBe(404);

    expect(logLines).toHaveLength(2);
    expect(logLines[0]).toMatch(/^\[\d{2}:\d{2}:\d{2}\] INFO {2}GET \/api\/v1\/users\/search\?q=mira -> 200 \(\d+ms\)\n$/);
    expect(logLines[1]).toMatch(/^\[\d{2}:\d{2}:\d{2}\] WARN {2}GET \/does-not-exist -> 404 \(\d+ms\)\n$/);
    for (const line of logLines) {
      expect(line.trimStart().startsWith("{")).toBe(false);
    }
  });
});

