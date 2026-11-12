import { generateKeyPairSync } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../src/app.js";
import type { MediaStorageService } from "../../src/lib/cloudinary.js";
import type { EventPublisher, ModerationBanEvent } from "../../src/lib/events.js";
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

describe("fastify authentication, account, channel, and moderation routes", () => {
  const appsToClose: FastifyInstance[] = [];

  afterEach(async () => {
    while (appsToClose.length > 0) {
      const app = appsToClose.pop();
      if (app) {
        await app.close();
      }
    }
  });

  async function setupTestApp(mediaStorage?: MediaStorageService) {
    const models = new MemoryModels();
    const jwtService = createJwtService();
    const publishedBans: ModerationBanEvent[] = [];
    const events: EventPublisher = {
      async publishModerationBan(event) {
        publishedBans.push(event);
      },
    };

    const app = await buildApp({
      models,
      jwtService,
      events,
      ...(mediaStorage ? { mediaStorage } : {}),
    });
    appsToClose.push(app);
    return { app, models, jwtService, publishedBans };
  }

  it("returns 503 DATABASE_UNCONFIGURED on auth routes when database is omitted", async () => {
    const jwtService = createJwtService();
    const app = await buildApp({ jwtService });
    appsToClose.push(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "creator_one",
        email: "creator@velostream.dev",
        password: "StrongPassword1",
      },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("DATABASE_UNCONFIGURED");
  });

  it("validates registration payloads and rejects duplicate handles/emails case-insensitively", async () => {
    const { app, jwtService } = await setupTestApp();

    const badRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "a!",
        email: "not-an-email",
        password: "short",
      },
    });
    expect(badRes.statusCode).toBe(400);
    const badBody = badRes.json();
    expect(badBody.error).toBe("VALIDATION_ERROR");
    expect(badBody.fieldErrors.username).toBeDefined();
    expect(badBody.fieldErrors.email).toBeDefined();
    expect(badBody.fieldErrors.password).toBeDefined();

    const reservedRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "Admin",
        email: "admin@velostream.dev",
        password: "StrongPassword1",
      },
    });
    expect(reservedRes.statusCode).toBe(400);
    expect(reservedRes.json().fieldErrors.username).toBeDefined();

    const okRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "@Deniz_K",
        email: "Deniz@VeloStream.dev",
        password: "StrongPassword1",
        displayName: "Deniz Kaya",
      },
    });
    expect(okRes.statusCode).toBe(201);
    const okBody = okRes.json();
    expect(okBody.tokenType).toBe("Bearer");
    expect(okBody.accessToken).toBeTypeOf("string");
    expect(okBody.refreshToken).toBeTypeOf("string");
    expect(okBody.message).toBe("Account created successfully.");
    expect(okBody.user.username).toBe("Deniz_K");
    expect(okBody.user.email).toBe("deniz@velostream.dev");
    expect(okBody.user.displayName).toBe("Deniz Kaya");
    expect(okBody.user.role).toBe("USER");
    expect(okBody.user.channel.streamKey.startsWith("live_")).toBe(true);

    const claims = await jwtService.verifyAccessToken(okBody.accessToken);
    expect(claims.sub).toBe(okBody.user.id);
    expect(claims.username).toBe("Deniz_K");
    expect(claims.role).toBe("USER");

    const dupUser = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "deniz_k",
        email: "other@velostream.dev",
        password: "StrongPassword1",
      },
    });
    expect(dupUser.statusCode).toBe(409);
    expect(dupUser.json().error).toBe("USERNAME_TAKEN");

    const dupEmail = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "another_user",
        email: "DENIZ@velostream.dev",
        password: "StrongPassword1",
      },
    });
    expect(dupEmail.statusCode).toBe(409);
    expect(dupEmail.json().error).toBe("EMAIL_TAKEN");
  });

  it("supports login by username or email, /me hydration, refresh rotation with replay protection, and logout", async () => {
    const { app } = await setupTestApp();

    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "mira_codes",
        email: "mira@velostream.dev",
        password: "StrongPassword1",
      },
    });

    const wrongPass = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        identifier: "mira_codes",
        password: "WrongPassword1",
      },
    });
    expect(wrongPass.statusCode).toBe(401);
    expect(wrongPass.json().error).toBe("INVALID_CREDENTIALS");

    const loginByUsername = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        identifier: "@MIRA_CODES",
        password: "StrongPassword1",
        rememberSession: true,
      },
    });
    expect(loginByUsername.statusCode).toBe(200);
    const session1 = loginByUsername.json();

    const loginByEmail = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "MIRA@velostream.dev",
        password: "StrongPassword1",
      },
    });
    expect(loginByEmail.statusCode).toBe(200);

    const unauthMe = await app.inject({ method: "GET", url: "/api/v1/auth/me" });
    expect(unauthMe.statusCode).toBe(401);

    const meRes = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { Authorization: `Bearer ${session1.accessToken}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().user.username).toBe("mira_codes");

    const refreshRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: session1.refreshToken },
    });
    expect(refreshRes.statusCode).toBe(200);
    const session2 = refreshRes.json();
    expect(session2.refreshToken).not.toBe(session1.refreshToken);

    // Replaying rotated token must fail and revoke active sessions for user
    const replayRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: session1.refreshToken },
    });
    expect(replayRes.statusCode).toBe(401);
    expect(replayRes.json().error).toBe("REFRESH_TOKEN_REUSED");

    const afterReplayRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: session2.refreshToken },
    });
    expect(afterReplayRes.statusCode).toBe(401);

    const logoutRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      payload: { refreshToken: loginByEmail.json().refreshToken },
    });
    expect(logoutRes.statusCode).toBe(200);
    expect(logoutRes.json()).toEqual({
      ok: true,
      message: "Logged out successfully.",
    });
  });

  it("updates password, profile, channel settings, stream key, follows, and moderation bans", async () => {
    const { app, jwtService, publishedBans } = await setupTestApp();

    const regA = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "creator_a",
        email: "creator_a@velostream.dev",
        password: "InitialPassword1",
      },
    });
    const tokenA = regA.json().accessToken as string;

    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "viewer_b",
        email: "viewer_b@velostream.dev",
        password: "ViewerPassword1",
      },
    });

    // Wrong current password rejected
    const badPw = await app.inject({
      method: "PATCH",
      url: "/api/v1/auth/password",
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: {
        currentPassword: "WrongCurrentPassword",
        newPassword: "UpdatedPassword2",
        confirmPassword: "UpdatedPassword2",
      },
    });
    expect(badPw.statusCode).toBe(401);

    // Update password succeeds and enables login with new password
    const okPw = await app.inject({
      method: "PATCH",
      url: "/api/v1/auth/password",
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: {
        currentPassword: "InitialPassword1",
        newPassword: "UpdatedPassword2",
        confirmPassword: "UpdatedPassword2",
      },
    });
    expect(okPw.statusCode).toBe(200);

    const relogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { identifier: "creator_a", password: "UpdatedPassword2" },
    });
    expect(relogin.statusCode).toBe(200);

    // Update profile including handle rename (re-signs access token)
    const profileRes = await app.inject({
      method: "PATCH",
      url: "/api/v1/users/me",
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: {
        displayName: "Creator Alpha",
        username: "creator_alpha",
        email: "alpha@velostream.dev",
        bio: "Building low-latency video engines.",
      },
    });
    expect(profileRes.statusCode).toBe(200);
    const nextTokenA = profileRes.json().accessToken as string;
    expect(nextTokenA).toBeTypeOf("string");
    const updatedClaims = await jwtService.verifyAccessToken(nextTokenA);
    expect(updatedClaims.username).toBe("creator_alpha");

    // Update channel settings & rotate stream key
    const chRes = await app.inject({
      method: "PATCH",
      url: "/api/v1/channels/me",
      headers: { Authorization: `Bearer ${nextTokenA}` },
      payload: {
        title: "Rust WebRTC Lab",
        category: "Programming",
        slowMode: true,
      },
    });
    expect(chRes.statusCode).toBe(200);
    expect(chRes.json().channel.slowMode).toBe(true);

    const rotRes = await app.inject({
      method: "POST",
      url: "/api/v1/channels/me/stream-key/rotate",
      headers: { Authorization: `Bearer ${nextTokenA}` },
    });
    expect(rotRes.statusCode).toBe(200);
    expect(rotRes.json().streamKey.startsWith("live_")).toBe(true);
    expect(rotRes.json().streamKey).not.toBe(regA.json().user.channel.streamKey);

    // Follow & unfollow
    const followRes = await app.inject({
      method: "POST",
      url: "/api/v1/users/me/follows/mira_codes",
      headers: { Authorization: `Bearer ${nextTokenA}` },
    });
    expect(followRes.statusCode).toBe(200);
    expect(followRes.json().followedSlugs).toEqual(["mira_codes"]);

    // Ban & unban validation + event publication
    const selfBan = await app.inject({
      method: "POST",
      url: "/api/v1/moderation/bans",
      headers: { Authorization: `Bearer ${nextTokenA}` },
      payload: { username: "creator_alpha" },
    });
    expect(selfBan.statusCode).toBe(400);

    const missingBan = await app.inject({
      method: "POST",
      url: "/api/v1/moderation/bans",
      headers: { Authorization: `Bearer ${nextTokenA}` },
      payload: { username: "nobody_here" },
    });
    expect(missingBan.statusCode).toBe(404);

    const okBan = await app.inject({
      method: "POST",
      url: "/api/v1/moderation/bans",
      headers: { Authorization: `Bearer ${nextTokenA}` },
      payload: { username: "@viewer_b", reason: "Spam links" },
    });
    expect(okBan.statusCode).toBe(201);
    expect(okBan.json().ban.username).toBe("viewer_b");
    expect(publishedBans).toHaveLength(1);
    expect(publishedBans[0]?.reason).toBe("Spam links");

    const unbanRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/moderation/bans/viewer_b",
      headers: { Authorization: `Bearer ${nextTokenA}` },
    });
    expect(unbanRes.statusCode).toBe(200);

    const repeatUnban = await app.inject({
      method: "DELETE",
      url: "/api/v1/moderation/bans/viewer_b",
      headers: { Authorization: `Bearer ${nextTokenA}` },
    });
    expect(repeatUnban.statusCode).toBe(404);
  });

  it("handles avatar upload validation, 503 when media storage unconfigured, Cloudinary upload, and deletion", async () => {
    // 1. Unconfigured mediaStorage -> 503
    const { app: unconfiguredApp } = await setupTestApp();
    const reg1 = await unconfiguredApp.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "avatar_user1",
        email: "avatar1@velostream.dev",
        password: "StrongPassword1",
      },
    });
    const token1 = reg1.json().accessToken as string;
    expect(reg1.json().user.avatarUrl).toBeNull();

    const boundary = "----velostreamTestBoundary";
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 1]);
    const buildMultipart = (filename: string, contentType: string, data: Buffer) =>
      Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
        ),
        data,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

    const res503 = await unconfiguredApp.inject({
      method: "POST",
      url: "/api/v1/users/me/avatar",
      headers: {
        Authorization: `Bearer ${token1}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: buildMultipart("avatar.png", "image/png", pngBytes),
    });
    expect(res503.statusCode).toBe(503);
    expect(res503.json().error).toBe("MEDIA_STORAGE_UNCONFIGURED");

    // 2. Configured mediaStorage -> validates image bytes, stores URL, cleans up old asset, and supports delete
    let uploadSeq = 0;
    const uploadMock = vi.fn(async () => {
      uploadSeq += 1;
      return {
        secureUrl: `https://res.cloudinary.com/demo/image/upload/v${uploadSeq}/VeloStream/avatar/user_${uploadSeq}.png`,
        publicId: `VeloStream/avatar/user_${uploadSeq}`,
      };
    });
    const deleteMock = vi.fn(async () => undefined);
    const { app } = await setupTestApp({ uploadAvatar: uploadMock, deleteAvatarByUrl: deleteMock });

    const reg2 = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: "avatar_user2",
        email: "avatar2@velostream.dev",
        password: "StrongPassword1",
      },
    });
    const token2 = reg2.json().accessToken as string;

    const badUpload = await app.inject({
      method: "POST",
      url: "/api/v1/users/me/avatar",
      headers: {
        Authorization: `Bearer ${token2}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: buildMultipart("fake.png", "image/png", Buffer.from("not-a-real-png-file-at-all")),
    });
    expect(badUpload.statusCode).toBe(400);
    expect(badUpload.json().error).toBe("VALIDATION_ERROR");
    expect(uploadMock).not.toHaveBeenCalled();

    const okUpload = await app.inject({
      method: "POST",
      url: "/api/v1/users/me/avatar",
      headers: {
        Authorization: `Bearer ${token2}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: buildMultipart("avatar.png", "image/png", pngBytes),
    });
    expect(okUpload.statusCode).toBe(200);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(okUpload.json().avatarUrl).toBe(
      "https://res.cloudinary.com/demo/image/upload/v1/VeloStream/avatar/user_1.png",
    );
    expect(okUpload.json().user.avatarUrl).toBe(
      "https://res.cloudinary.com/demo/image/upload/v1/VeloStream/avatar/user_1.png",
    );
    expect(deleteMock).not.toHaveBeenCalled();

    // Non-multipart request, field-only multipart, and oversized (>5 MB) file all return 400 VALIDATION_ERROR
    const nonMultipartRes = await app.inject({
      method: "POST",
      url: "/api/v1/users/me/avatar",
      headers: {
        Authorization: `Bearer ${token2}`,
        "Content-Type": "application/json",
      },
      payload: {},
    });
    expect(nonMultipartRes.statusCode).toBe(400);
    expect(nonMultipartRes.json().error).toBe("VALIDATION_ERROR");

    const fieldOnlyRes = await app.inject({
      method: "POST",
      url: "/api/v1/users/me/avatar",
      headers: {
        Authorization: `Bearer ${token2}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="note"\r\n\r\nhello\r\n--${boundary}--\r\n`,
      ),
    });
    expect(fieldOnlyRes.statusCode).toBe(400);
    expect(fieldOnlyRes.json().error).toBe("VALIDATION_ERROR");

    const oversizedRes = await app.inject({
      method: "POST",
      url: "/api/v1/users/me/avatar",
      headers: {
        Authorization: `Bearer ${token2}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: buildMultipart(
        "huge.png",
        "image/png",
        Buffer.concat([pngBytes, Buffer.alloc(5 * 1024 * 1024 + 64)]),
      ),
    });
    expect(oversizedRes.statusCode).toBe(400);
    expect(oversizedRes.json().error).toBe("VALIDATION_ERROR");

    // Replacing avatar deletes previous asset in Cloudinary
    const replaceUpload = await app.inject({
      method: "POST",
      url: "/api/v1/users/me/avatar",
      headers: {
        Authorization: `Bearer ${token2}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: buildMultipart("avatar2.png", "image/png", pngBytes),
    });
    expect(replaceUpload.statusCode).toBe(200);
    expect(replaceUpload.json().avatarUrl).toBe(
      "https://res.cloudinary.com/demo/image/upload/v2/VeloStream/avatar/user_2.png",
    );
    expect(deleteMock).toHaveBeenCalledWith(
      "https://res.cloudinary.com/demo/image/upload/v1/VeloStream/avatar/user_1.png",
    );

    const meAfterUpload = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { Authorization: `Bearer ${token2}` },
    });
    expect(meAfterUpload.statusCode).toBe(200);
    expect(meAfterUpload.json().user.avatarUrl).toBe(
      "https://res.cloudinary.com/demo/image/upload/v2/VeloStream/avatar/user_2.png",
    );

    const delRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/users/me/avatar",
      headers: { Authorization: `Bearer ${token2}` },
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().avatarUrl).toBeNull();
    expect(delRes.json().user.avatarUrl).toBeNull();
    expect(deleteMock).toHaveBeenCalledWith(
      "https://res.cloudinary.com/demo/image/upload/v2/VeloStream/avatar/user_2.png",
    );
  });
});

