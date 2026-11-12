import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { mapPrismaUniqueError } from "../../src/models/prisma-helpers.js";
import { UniqueConstraintError } from "../../src/models/types.js";
import { toAccountProfileView, UserModel } from "../../src/models/user.model.js";

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
      createdAt: new Date("2026-11-11T00:00:00.000Z"),
      updatedAt: new Date("2026-11-11T00:00:00.000Z"),
      channel: null,
      follows: [{ channelSlug: "mira_codes" }],
    });

    expect(view.role).toBe("USER");
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
      username: "@new_user",
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
      username: "@updated_user",
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
});
