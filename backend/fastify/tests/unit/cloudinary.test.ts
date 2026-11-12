import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  buildCloudinarySignature,
  CloudinaryMediaStorage,
  detectImageMimeType,
  extractCloudinaryPublicId,
  normalizeCloudinaryAvatarFolder,
} from "../../src/lib/cloudinary.js";
import { HttpApiError } from "../../src/lib/errors.js";

describe("CloudinaryMediaStorage & image helpers", () => {
  it("detects PNG, JPEG, GIF, and WebP magic bytes and rejects non-images", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const gif = Buffer.from("GIF89a000000", "ascii");
    const webp = Buffer.from("RIFF1234WEBP", "ascii");
    const text = Buffer.from("<html>not an image</html>", "utf8");

    expect(detectImageMimeType(png)).toBe("image/png");
    expect(detectImageMimeType(jpg)).toBe("image/jpeg");
    expect(detectImageMimeType(gif)).toBe("image/gif");
    expect(detectImageMimeType(webp)).toBe("image/webp");
    expect(detectImageMimeType(text)).toBeNull();
  });

  it("computes Cloudinary SHA-1 signature with alphabetically sorted parameters", () => {
    const sig = buildCloudinarySignature(
      { timestamp: "1700000000", folder: "VeloStream/avatar", public_id: "user_1" },
      "my_secret",
    );
    const expected = createHash("sha1")
      .update("folder=VeloStream/avatar&public_id=user_1&timestamp=1700000000my_secret")
      .digest("hex");
    expect(sig).toBe(expected);
  });

  it("normalizes Cloudinary avatar folder under VeloStream", () => {
    expect(normalizeCloudinaryAvatarFolder()).toBe("VeloStream/avatar");
    expect(normalizeCloudinaryAvatarFolder("avatar")).toBe("VeloStream/avatar");
    expect(normalizeCloudinaryAvatarFolder("/VeloStream/avatar/")).toBe("VeloStream/avatar");
    expect(normalizeCloudinaryAvatarFolder("VeloStream")).toBe("VeloStream/avatar");
    expect(normalizeCloudinaryAvatarFolder("creators/avatar")).toBe("VeloStream/creators/avatar");
  });

  it("uploads avatar into the configured 'VeloStream/avatar' folder and returns secure_url", async () => {
    let capturedUrl = "";
    let capturedForm: FormData | undefined;

    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      capturedUrl = typeof input === "string" ? input : input.toString();
      capturedForm = init?.body as FormData;
      return new Response(
        JSON.stringify({
          secure_url:
            "https://res.cloudinary.com/demo_cloud/image/upload/v1/VeloStream/avatar/user_usr_1.png",
          public_id: "VeloStream/avatar/user_usr_1",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const storage = new CloudinaryMediaStorage({
      cloudinaryUrl: "cloudinary://api_key_123:api_secret_xyz@demo_cloud",
      avatarFolder: "avatar",
      fetchFn: fetchMock,
    });

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const res = await storage.uploadAvatar({
      userId: "usr_1",
      buffer: png,
      mimeType: "image/png",
      filename: "avatar.png",
    });

    expect(capturedUrl).toBe("https://api.cloudinary.com/v1_1/demo_cloud/image/upload");
    expect(capturedForm?.get("folder")).toBe("VeloStream/avatar");
    expect(capturedForm?.get("api_key")).toBe("api_key_123");
    expect(String(capturedForm?.get("public_id"))).toMatch(/^user_usr_1_/);
    expect(res.secureUrl).toBe(
      "https://res.cloudinary.com/demo_cloud/image/upload/v1/VeloStream/avatar/user_usr_1.png",
    );
  });

  it("throws 502 MEDIA_UPLOAD_FAILED when Cloudinary fetch fails at the network layer", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    const storage = new CloudinaryMediaStorage({
      cloudinaryUrl: "cloudinary://api_key_123:api_secret_xyz@demo_cloud",
      avatarFolder: "VeloStream/avatar",
      fetchFn: fetchMock,
    });

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    await expect(
      storage.uploadAvatar({
        userId: "usr_1",
        buffer: png,
        mimeType: "image/png",
      }),
    ).rejects.toMatchObject({
      statusCode: 502,
      code: "MEDIA_UPLOAD_FAILED",
    } satisfies Partial<HttpApiError>);
  });

  it("extracts Cloudinary public_id only for matching cloud and VeloStream/avatar folder and calls image/destroy", async () => {
    expect(
      extractCloudinaryPublicId(
        "https://res.cloudinary.com/demo_cloud/image/upload/v170000/VeloStream/avatar/user_1_99.png",
        "demo_cloud",
        "VeloStream/avatar",
      ),
    ).toBe("VeloStream/avatar/user_1_99");
    expect(
      extractCloudinaryPublicId(
        "https://res.cloudinary.com/other_cloud/image/upload/v1/VeloStream/avatar/user_1.png",
        "demo_cloud",
        "VeloStream/avatar",
      ),
    ).toBeNull();
    expect(
      extractCloudinaryPublicId(
        "https://res.cloudinary.com/demo_cloud/image/upload/v1/VeloStream/other_folder/user_1.png",
        "demo_cloud",
        "VeloStream/avatar",
      ),
    ).toBeNull();

    let destroyUrl = "";
    let destroyForm: FormData | undefined;
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      destroyUrl = typeof input === "string" ? input : input.toString();
      destroyForm = init?.body as FormData;
      return new Response(JSON.stringify({ result: "ok" }), { status: 200 });
    }) as unknown as typeof fetch;

    const storage = new CloudinaryMediaStorage({
      cloudinaryUrl: "cloudinary://api_key_123:api_secret_xyz@demo_cloud",
      avatarFolder: "VeloStream/avatar",
      fetchFn: fetchMock,
    });

    await storage.deleteAvatarByUrl(
      "https://res.cloudinary.com/demo_cloud/image/upload/v170000/VeloStream/avatar/user_1_99.png",
    );
    expect(destroyUrl).toBe("https://api.cloudinary.com/v1_1/demo_cloud/image/destroy");
    expect(destroyForm?.get("public_id")).toBe("VeloStream/avatar/user_1_99");
    expect(destroyForm?.get("invalidate")).toBe("true");
  });
});
