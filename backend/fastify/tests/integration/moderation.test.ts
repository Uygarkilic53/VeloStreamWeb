import { generateKeyPairSync } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import type {
  EventPublisher,
  ModerationBanEvent,
  ModerationRoleEvent,
  ModerationSilenceEvent,
  ModerationUnbanEvent,
  ModerationUnsilenceEvent,
  ModerationWarningEvent,
} from "../../src/lib/events.js";
import { AsymmetricJwtService } from "../../src/lib/jwt.js";
import { MemoryModels } from "../../src/models/memory-store.js";

function createJwtService() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return new AsymmetricJwtService({
    algorithm: "EdDSA",
    issuer: "velostream-fastify",
    audience: "velostream-clients",
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
  });
}

describe("fastify broadcasting moderation routes", () => {
  const appsToClose: FastifyInstance[] = [];

  afterEach(async () => {
    while (appsToClose.length > 0) {
      const app = appsToClose.pop();
      if (app) {
        await app.close();
      }
    }
  });

  async function setupTestApp() {
    const models = new MemoryModels();
    const jwtService = createJwtService();
    const publishedRoles: ModerationRoleEvent[] = [];
    const publishedSilences: ModerationSilenceEvent[] = [];
    const publishedUnsilences: ModerationUnsilenceEvent[] = [];
    const publishedWarnings: ModerationWarningEvent[] = [];
    const publishedBans: ModerationBanEvent[] = [];
    const publishedUnbans: ModerationUnbanEvent[] = [];

    const events: EventPublisher = {
      async publishModerationBan(event) {
        publishedBans.push(event);
      },
      async publishModerationUnban(event) {
        publishedUnbans.push(event);
      },
      async publishModerationRoleUpdated(event) {
        publishedRoles.push(event);
      },
      async publishModerationSilence(event) {
        publishedSilences.push(event);
      },
      async publishModerationUnsilence(event) {
        publishedUnsilences.push(event);
      },
      async publishModerationWarning(event) {
        publishedWarnings.push(event);
      },
    };

    const app = await buildApp({
      models,
      jwtService,
      events,
    });
    appsToClose.push(app);

    // Register 3 users: creator, mod_candidate, and viewer
    const creatorRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "creator_alice",
        displayName: "Alice Broadcaster",
        email: "alice@example.com",
        password: "PassWord123!",
        channelTitle: "Alice Live Coding",
        channelCategory: "Programming",
      },
    });
    const creatorToken = creatorRes.json().accessToken;

    const modRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "bob_mod",
        displayName: "Bob Mod",
        email: "bob@example.com",
        password: "PassWord123!",
        channelTitle: "Bob Stage",
        channelCategory: "Gaming",
      },
    });
    const modToken = modRes.json().accessToken;

    const viewerRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "charlie_viewer",
        displayName: "Charlie Viewer",
        email: "charlie@example.com",
        password: "PassWord123!",
        channelTitle: "Charlie Stage",
        channelCategory: "Creative",
      },
    });
    const viewerToken = viewerRes.json().accessToken;

    return {
      app,
      creatorToken,
      modToken,
      viewerToken,
      publishedRoles,
      publishedSilences,
      publishedUnsilences,
      publishedWarnings,
      publishedBans,
      publishedUnbans,
    };
  }

  it("creator can assign and dismiss channel moderators", async () => {
    const { app, creatorToken, modToken, publishedRoles } = await setupTestApp();

    // Assign bob_mod as moderator
    const addRes = await app.inject({
      method: "POST",
      url: "/api/v1/moderation/moderators",
      headers: { authorization: `Bearer ${creatorToken}` },
      payload: { username: "bob_mod" },
    });
    expect(addRes.statusCode).toBe(201);
    expect(addRes.json().moderator.username).toBe("bob_mod");
    expect(publishedRoles.length).toBe(1);
    expect(publishedRoles[0]!.newRole).toBe("Moderator");

    // List moderators
    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/moderation/moderators",
      headers: { authorization: `Bearer ${creatorToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().moderators).toHaveLength(1);
    expect(listRes.json().moderators[0].username).toBe("bob_mod");

    // Moderator adding moderator to their own channel
    const modAddRes = await app.inject({
      method: "POST",
      url: "/api/v1/moderation/moderators",
      headers: { authorization: `Bearer ${modToken}` },
      payload: { username: "charlie_viewer" },
    });
    expect(modAddRes.statusCode).toBe(201);

    // Self add forbidden
    const selfAdd = await app.inject({
      method: "POST",
      url: "/api/v1/moderation/moderators",
      headers: { authorization: `Bearer ${creatorToken}` },
      payload: { username: "creator_alice" },
    });
    expect(selfAdd.statusCode).toBe(400);

    // Self add with @ prefix also forbidden with 400
    const selfAddAt = await app.inject({
      method: "POST",
      url: "/api/v1/moderation/moderators",
      headers: { authorization: `Bearer ${creatorToken}` },
      payload: { username: "@creator_alice" },
    });
    expect(selfAddAt.statusCode).toBe(400);

    // Dismiss moderator
    const removeRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/moderation/moderators/bob_mod",
      headers: { authorization: `Bearer ${creatorToken}` },
    });
    expect(removeRes.statusCode).toBe(200);
    expect(removeRes.json().ok).toBe(true);

    // Non-owner attempting to assign moderator for someone else's channel returns 403
    const forbiddenAdd = await app.inject({
      method: "POST",
      url: "/api/v1/moderation/moderators",
      headers: { authorization: `Bearer ${modToken}` },
      payload: { username: "charlie_viewer", channelSlug: "creator_alice" },
    });
    expect(forbiddenAdd.statusCode).toBe(403);

    const listAfter = await app.inject({
      method: "GET",
      url: "/api/v1/moderation/moderators",
      headers: { authorization: `Bearer ${creatorToken}` },
    });
    expect(listAfter.json().moderators).toHaveLength(0);
  });

  it("supports silencing and unsilencing users with duration and hierarchy rules", async () => {
    const { app, creatorToken, viewerToken } = await setupTestApp();

    // Creator silences charlie_viewer
    const silenceRes = await app.inject({
      method: "POST",
      url: "/api/v1/moderation/silences",
      headers: { authorization: `Bearer ${creatorToken}` },
      payload: {
        username: "charlie_viewer",
        duration: "1h",
        reason: "Spamming emojis",
      },
    });
    expect(silenceRes.statusCode).toBe(201);
    expect(silenceRes.json().mute.username).toBe("charlie_viewer");
    expect(silenceRes.json().mute.expiresAt).not.toBeNull();

    // List silences
    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/moderation/silences",
      headers: { authorization: `Bearer ${creatorToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().silences).toHaveLength(1);
    expect(listRes.json().silences[0].username).toBe("charlie_viewer");

    // Viewer cannot silence self
    const selfSilence = await app.inject({
      method: "POST",
      url: "/api/v1/moderation/silences",
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: {
        username: "charlie_viewer",
        duration: "1h",
      },
    });
    expect(selfSilence.statusCode).toBe(400);

    // Unsilence
    const unsilenceRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/moderation/silences/charlie_viewer",
      headers: { authorization: `Bearer ${creatorToken}` },
    });
    expect(unsilenceRes.statusCode).toBe(200);
    expect(unsilenceRes.json().ok).toBe(true);

    const listEmpty = await app.inject({
      method: "GET",
      url: "/api/v1/moderation/silences",
      headers: { authorization: `Bearer ${creatorToken}` },
    });
    expect(listEmpty.json().silences).toHaveLength(0);
  });

  it("supports sending warnings and enforces permissions", async () => {
    const { app, creatorToken, publishedWarnings } = await setupTestApp();

    const warnRes = await app.inject({
      method: "POST",
      url: "/api/v1/moderation/warnings",
      headers: { authorization: `Bearer ${creatorToken}` },
      payload: {
        username: "charlie_viewer",
        reason: "Please keep discussions civil in this stream.",
      },
    });
    expect(warnRes.statusCode).toBe(201);
    expect(warnRes.json().warning.username).toBe("charlie_viewer");
    expect(publishedWarnings).toHaveLength(1);
    expect(publishedWarnings[0]!.targetUserId).toBeDefined();
    expect(publishedWarnings[0]!.reason).toBe("Please keep discussions civil in this stream.");
  });

  it("supports channel moderators banning regular users and blocks peer/creator bans", async () => {
    const { app, creatorToken, modToken, viewerToken, publishedBans, publishedUnbans } = await setupTestApp();

    // Alice assigns bob_mod as moderator
    await app.inject({
      method: "POST",
      url: "/api/v1/moderation/moderators",
      headers: { authorization: `Bearer ${creatorToken}` },
      payload: { username: "bob_mod" },
    });

    // Bob (moderator) bans charlie_viewer in alice's channel
    const banRes = await app.inject({
      method: "POST",
      url: "/api/v1/moderation/bans",
      headers: { authorization: `Bearer ${modToken}` },
      payload: {
        username: "charlie_viewer",
        reason: "Violating channel guidelines",
        channelSlug: "creator_alice",
      },
    });
    expect(banRes.statusCode).toBe(201);
    expect(banRes.json().ban.username).toBe("charlie_viewer");
    expect(publishedBans).toHaveLength(1);
    expect(publishedBans[0]!.userId).toBeDefined();
    expect(publishedBans[0]!.reason).toBe("Violating channel guidelines");

    // Bob cannot ban the channel creator
    const banCreatorRes = await app.inject({
      method: "POST",
      url: "/api/v1/moderation/bans",
      headers: { authorization: `Bearer ${modToken}` },
      payload: {
        username: "creator_alice",
        reason: "Attempt to ban creator",
        channelSlug: "creator_alice",
      },
    });
    expect(banCreatorRes.statusCode).toBe(403);

    // Regular viewer cannot ban anyone
    const viewerBanRes = await app.inject({
      method: "POST",
      url: "/api/v1/moderation/bans",
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: {
        username: "bob_mod",
        channelSlug: "creator_alice",
      },
    });
    expect(viewerBanRes.statusCode).toBe(403);

    // Bob unbans charlie_viewer
    const unbanRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/moderation/bans/charlie_viewer?channelSlug=creator_alice",
      headers: { authorization: `Bearer ${modToken}` },
    });
    expect(unbanRes.statusCode).toBe(200);
    expect(unbanRes.json().ok).toBe(true);
    expect(publishedUnbans).toHaveLength(1);
    expect(publishedUnbans[0]!.username).toBe("charlie_viewer");
    expect(publishedUnbans[0]!.channelSlug).toBe("creator_alice");

    // Creator alice bans charlie_viewer, then unbans without query param -> channelSlug defaults to creator_alice
    await app.inject({
      method: "POST",
      url: "/api/v1/moderation/bans",
      headers: { authorization: `Bearer ${creatorToken}` },
      payload: {
        username: "charlie_viewer",
        reason: "Temporary ban",
      },
    });
    const creatorUnbanRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/moderation/bans/charlie_viewer",
      headers: { authorization: `Bearer ${creatorToken}` },
    });
    expect(creatorUnbanRes.statusCode).toBe(200);
    expect(publishedUnbans).toHaveLength(2);
    expect(publishedUnbans[1]!.channelSlug).toBe("creator_alice");
  });
});
