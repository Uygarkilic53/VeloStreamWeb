import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { MemoryModels } from "../../src/models/memory-store.js";
import { mapPrismaUniqueError } from "../../src/models/prisma-helpers.js";
import { UniqueConstraintError } from "../../src/models/types.js";
import { toAccountProfileView, UserModel } from "../../src/models/user.model.js";
import {
  RegisterBodySchema,
  UpdateProfileBodySchema,
  usernameSchema,
} from "../../src/schemas/auth.schema.js";

function makeP2002(target: unknown) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.5.0",
    meta: { target },
  });
}

describe("UserModel and Prisma error helpers", () => {
  it("maps Prisma P2002 errors whether meta.target is an array or constraint name string", () => {
    expect(() => mapPrismaUniqueError(makeP2002(["email"]))).toThrowError(UniqueConstraintError);
    try {
      mapPrismaUniqueError(makeP2002("users_email_key"));
    } catch (err) {
      expect(err).toBeInstanceOf(UniqueConstraintError);
      expect((err as UniqueConstraintError).field).toBe("email");
    }

    try {
      mapPrismaUniqueError(makeP2002("channels_stream_key_key"));
    } catch (err) {
      expect(err).toBeInstanceOf(UniqueConstraintError);
      expect((err as UniqueConstraintError).field).toBe("streamKey");
    }

    try {
      mapPrismaUniqueError(makeP2002(["slug"]));
    } catch (err) {
      expect(err).toBeInstanceOf(UniqueConstraintError);
      expect((err as UniqueConstraintError).field).toBe("slug");
    }
  });

  it("maps user rows with null channel cleanly instead of throwing", () => {
    const view = toAccountProfileView({
      id: "usr_1",
      username: "viewer_one",
      displayName: "Viewer One",
      email: "viewer@velostream.dev",
      bio: "",
      avatarUrl: null,
      passwordHash: "hash",
      role: "USER",
      theme: "light",
      createdAt: new Date("2026-11-11T00:00:00.000Z"),
      updatedAt: new Date("2026-11-11T00:00:00.000Z"),
      channel: null,
      follows: [{ channelSlug: "mira_codes" }],
      bansReceived: [],
    });

    expect(view.role).toBe("USER");
    expect(view.theme).toBe("light");
    expect(view.avatarUrl).toBeNull();
    expect(view.channel).toBeNull();
    expect(view.bannedUsers).toEqual([]);
    expect(view.followedSlugs).toEqual(["mira_codes"]);
  });

  it("creates users with role USER by default and safely updates profiles without a channel", async () => {
    const createSpy = vi.fn().mockResolvedValue({
      id: "usr_1",
      username: "new_user",
      displayName: "New User",
      email: "new@velostream.dev",
      bio: "",
      avatarUrl: null,
      passwordHash: "hash",
      role: "USER",
      theme: "light",
      createdAt: new Date("2026-11-11T00:00:00.000Z"),
      updatedAt: new Date("2026-11-11T00:00:00.000Z"),
      channel: {
        id: "ch_1",
        ownerId: "usr_1",
        slug: "new_user",
        title: "New User's live broadcast",
        category: "Programming",
        streamKey: "live_key_1",
        slowMode: false,
        isLive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        bans: [],
      },
      follows: [],
    });

    const updateSpy = vi.fn().mockResolvedValue({
      id: "usr_1",
      username: "updated_user",
      displayName: "Updated User",
      email: "updated@velostream.dev",
      bio: "Hello",
      avatarUrl: "https://res.cloudinary.com/demo/image/upload/v1/VeloStream/avatar/user_1.png",
      passwordHash: "hash",
      role: "USER",
      theme: "light",
      createdAt: new Date("2026-11-11T00:00:00.000Z"),
      updatedAt: new Date("2026-11-11T00:00:00.000Z"),
      channel: null,
      follows: [],
    });

    const tx = {
      user: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue({ id: "usr_1", channel: null }),
        create: createSpy,
        update: updateSpy,
      },
      channelFollow: {
        updateMany: vi.fn(),
      },
    };

    const fakePrisma = {
      $transaction: async (cb: (client: typeof tx) => Promise<unknown>) => cb(tx),
    } as unknown as PrismaClient;

    const userModel = new UserModel(fakePrisma);
    const created = await userModel.createWithChannel({
      username: "new_user",
      displayName: "New User",
      email: "New@VeloStream.dev",
      passwordHash: "hash",
      streamKey: "live_key_1",
      channelTitle: "New User's live broadcast",
    });

    expect(created.role).toBe("USER");
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          username: "new_user",
          email: "new@velostream.dev",
          role: "USER",
        }),
      }),
    );

    const updated = await userModel.updateProfile({
      userId: "usr_1",
      displayName: "Updated User",
      username: "updated_user",
      email: "Updated@VeloStream.dev",
      bio: "Hello",
    });

    expect(updated.channel).toBeNull();
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ channel: expect.anything() }),
      }),
    );
  });

  it("enforces case-insensitive username uniqueness in UserModel.createWithChannel and UserModel.updateProfile", async () => {
    const txCreateConflict = {
      user: {
        findFirst: vi.fn().mockResolvedValue({ username: "Mira_Codes" }),
      },
    };
    const userModelCreate = new UserModel({
      $transaction: async (cb: (client: typeof txCreateConflict) => Promise<unknown>) =>
        cb(txCreateConflict),
    } as unknown as PrismaClient);

    await expect(
      userModelCreate.createWithChannel({
        username: "mira_codes",
        displayName: "Mira",
        email: "mira2@velostream.dev",
        passwordHash: "hash",
        streamKey: "live_key_2",
        channelTitle: "Mira's stream",
      }),
    ).rejects.toThrowError(new UniqueConstraintError("username", "That username is already registered."));

    const txUpdateConflict = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: "usr_1", channel: { id: "ch_1", slug: "usr_one" } }),
        findFirst: vi.fn().mockResolvedValue({ username: "Mira_Codes" }),
      },
    };
    const userModelUpdate = new UserModel({
      $transaction: async (cb: (client: typeof txUpdateConflict) => Promise<unknown>) =>
        cb(txUpdateConflict),
    } as unknown as PrismaClient);

    await expect(
      userModelUpdate.updateProfile({
        userId: "usr_1",
        displayName: "User One",
        username: "mira_codes",
        email: "one@velostream.dev",
        bio: "",
      }),
    ).rejects.toThrowError(new UniqueConstraintError("username", "That username is already taken."));
  });

  it("rejects @-prefixed usernames in auth/profile Zod schemas and accepts valid plain usernames", () => {
    expect(usernameSchema.safeParse("@alice").success).toBe(false);
    expect(usernameSchema.safeParse("@").success).toBe(false);
    expect(usernameSchema.safeParse("  alice_01  ")).toEqual({
      success: true,
      data: "alice_01",
    });

    const regBad = RegisterBodySchema.safeParse({
      username: "@alice",
      email: "alice@velostream.dev",
      password: "StrongPassword1",
    });
    expect(regBad.success).toBe(false);

    const profileBad = UpdateProfileBodySchema.safeParse({
      displayName: "Alice",
      username: "@alice",
      email: "alice@velostream.dev",
      bio: "",
    });
    expect(profileBad.success).toBe(false);
  });

  it("refuses to silently strip @ in UserModel and MemoryModels createWithChannel/updateProfile", async () => {
    const fakePrisma = { $transaction: vi.fn() } as unknown as PrismaClient;
    const prismaUserModel = new UserModel(fakePrisma);
    const memoryModels = new MemoryModels();

    await expect(
      prismaUserModel.createWithChannel({
        username: "@alice",
        displayName: "Alice",
        email: "alice@velostream.dev",
        passwordHash: "hash",
        streamKey: "live_key_at",
        channelTitle: "Alice stream",
      }),
    ).rejects.toThrow(/letters, numbers, and underscores/i);

    await expect(
      prismaUserModel.updateProfile({
        userId: "usr_1",
        displayName: "Alice",
        username: "@alice",
        email: "alice@velostream.dev",
        bio: "",
      }),
    ).rejects.toThrow(/letters, numbers, and underscores/i);

    await expect(
      memoryModels.users.createWithChannel({
        username: "@alice",
        displayName: "Alice",
        email: "alice@velostream.dev",
        passwordHash: "hash",
        streamKey: "live_key_at",
        channelTitle: "Alice stream",
      }),
    ).rejects.toThrow(/letters, numbers, and underscores/i);

    const created = await memoryModels.users.createWithChannel({
      username: "alice_01",
      displayName: "Alice",
      email: "alice@velostream.dev",
      passwordHash: "hash",
      streamKey: "live_key_ok",
      channelTitle: "Alice stream",
    });

    await expect(
      memoryModels.users.updateProfile({
        userId: created.id,
        displayName: "Alice",
        username: "@alice_01",
        email: "alice@velostream.dev",
        bio: "",
      }),
    ).rejects.toThrow(/letters, numbers, and underscores/i);
  });

  it("excludes excludeUserId in Prisma UserModel.searchUsers queries", async () => {
    const findManySpy = vi.fn().mockResolvedValue([]);
    const fakePrisma = {
      user: {
        findMany: findManySpy,
      },
    } as unknown as PrismaClient;

    const userModel = new UserModel(fakePrisma);
    await userModel.searchUsers("mira", 10, "usr_self_1");

    expect(findManySpy).toHaveBeenCalledTimes(3);
    for (const call of findManySpy.mock.calls) {
      expect(call[0].where.id).toEqual({ not: "usr_self_1" });
      expect(call[0].where.channel.bans.none.userId).toBe("usr_self_1");
    }
  });

  it("retrieves live channels and followed users correctly in memory models", async () => {
    const memory = new MemoryModels();
    const userA = await memory.users.createWithChannel({
      username: "streamer_one",
      displayName: "Streamer One",
      email: "one@velostream.dev",
      passwordHash: "hash",
      streamKey: "key_1",
      channelTitle: "One Live Show",
      channelCategory: "Gaming",
    });

    const userB = await memory.users.createWithChannel({
      username: "streamer_two",
      displayName: "Streamer Two",
      email: "two@velostream.dev",
      passwordHash: "hash",
      streamKey: "key_2",
      channelTitle: "Two Offline Show",
      channelCategory: "Programming",
    });
    expect(userB.id).toBeDefined();

    // Initially no channels are live
    const initialLive = await memory.channels.getLiveChannels();
    expect(initialLive).toEqual([]);

    // Set userA live
    const updatedChannel = await memory.channels.setLiveStatus(userA.id, true);
    expect(updatedChannel.isLive).toBe(true);

    const liveAfter = await memory.channels.getLiveChannels();
    expect(liveAfter).toHaveLength(1);
    expect(liveAfter[0]?.username).toBe("streamer_one");
    expect(liveAfter[0]?.isLive).toBe(true);
    expect(liveAfter[0]?.channelTitle).toBe("One Live Show");

    // Follow both streamers from userA
    await memory.channels.setFollowState(userA.id, "streamer_two", true);
    const followed = await memory.users.getFollowedUsers(userA.id);
    expect(followed).toHaveLength(1);
    expect(followed[0]?.username).toBe("streamer_two");
    expect(followed[0]?.isLive).toBe(false);

    // End broadcast
    await memory.channels.setLiveStatus(userA.id, false);
    await memory.channels.clearChatMessages(updatedChannel.id);
    const liveEnded = await memory.channels.getLiveChannels();
    expect(liveEnded).toEqual([]);
  });

  it("excludes banning channel from search results and checks ban status", async () => {
    const memory = new MemoryModels();

    const alice = await memory.users.createWithChannel({
      username: "alice_creator",
      displayName: "Alice Creator",
      email: "alice@velostream.dev",
      passwordHash: "hash",
      streamKey: "key_alice",
      channelTitle: "Alice Live Show",
      channelCategory: "Programming",
    });

    const bob = await memory.users.createWithChannel({
      username: "bob_viewer",
      displayName: "Bob Viewer",
      email: "bob@velostream.dev",
      passwordHash: "hash",
      streamKey: "key_bob",
      channelTitle: "Bob Show",
      channelCategory: "Programming",
    });

    // Bob follows Alice initially
    await memory.channels.setFollowState(bob.id, "alice_creator", true);
    let bobFollowed = await memory.users.getFollowedUsers(bob.id);
    expect(bobFollowed).toHaveLength(1);

    // Before ban: Bob searching for "alice" can see Alice
    const searchBefore = await memory.users.searchUsers("alice", 12, bob.id);
    expect(searchBefore.users.some((u) => u.username === "alice_creator")).toBe(true);

    // Ban check before: false
    let banCheck = await memory.channels.isUserBanned("alice_creator", bob.id);
    expect(banCheck.isBanned).toBe(false);

    // Alice bans Bob
    await memory.channels.banUserByUsername({
      ownerId: alice.id,
      targetUsername: "bob_viewer",
      reason: "Harassment",
    });

    // Ban check after: true with reason
    banCheck = await memory.channels.isUserBanned("alice_creator", bob.id);
    expect(banCheck.isBanned).toBe(true);
    expect(banCheck.reason).toBe("Harassment");

    // Bob's follow was automatically removed
    bobFollowed = await memory.users.getFollowedUsers(bob.id);
    expect(bobFollowed).toHaveLength(0);

    // Bob's profile contains Alice in bannedFromSlugs
    const bobProfile = await memory.users.findProfileById(bob.id);
    expect(bobProfile?.bannedFromSlugs).toContain("alice_creator");

    // After ban: Bob searching for "alice" CANNOT see Alice
    const searchAfter = await memory.users.searchUsers("alice", 12, bob.id);
    expect(searchAfter.users.some((u) => u.username === "alice_creator")).toBe(false);

    // Unauthenticated search still sees Alice
    const searchAnon = await memory.users.searchUsers("alice", 12);
    expect(searchAnon.users.some((u) => u.username === "alice_creator")).toBe(true);

    // Alice unbans Bob
    await memory.channels.unbanUserByUsername(alice.id, "bob_viewer");
    banCheck = await memory.channels.isUserBanned("alice_creator", bob.id);
    expect(banCheck.isBanned).toBe(false);

    // Bob searching again CAN see Alice
    const searchUnbanned = await memory.users.searchUsers("alice", 12, bob.id);
    expect(searchUnbanned.users.some((u) => u.username === "alice_creator")).toBe(true);
  });
});
