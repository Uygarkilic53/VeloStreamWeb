import { createHash, randomUUID } from "node:crypto";
import { parseCloudinaryUrl, type CloudinaryCredentials } from "../config/env.js";
import { HttpApiError } from "./errors.js";

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MiB
const CLOUDINARY_REQUEST_TIMEOUT_MS = 15_000;

export const ALLOWED_AVATAR_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export interface UploadAvatarInput {
  userId: string;
  buffer: Buffer;
  mimeType: string;
  filename?: string;
}

export interface UploadedMediaResult {
  secureUrl: string;
  publicId: string;
}

export interface MediaStorageService {
  uploadAvatar(input: UploadAvatarInput): Promise<UploadedMediaResult>;
  deleteAvatarByUrl?(avatarUrl: string): Promise<void>;
}

/**
 * Inspects image magic bytes so spoofed Content-Type headers cannot slip past validation.
 */
export function detectImageMimeType(buffer: Buffer): string | null {
  if (buffer.length < 12) {
    return null;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // GIF: GIF87a / GIF89a
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return "image/gif";
  }

  // WebP: RIFF....WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

export function buildCloudinarySignature(
  params: Record<string, string>,
  apiSecret: string,
): string {
  const serialized = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return createHash("sha1")
    .update(`${serialized}${apiSecret}`)
    .digest("hex");
}

export function normalizeCloudinaryAvatarFolder(folder?: string): string {
  const cleaned = (folder ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!cleaned) {
    return "VeloStream/avatar";
  }
  if (cleaned === "VeloStream" || cleaned.startsWith("VeloStream/")) {
    return cleaned === "VeloStream" ? "VeloStream/avatar" : cleaned;
  }
  return `VeloStream/${cleaned}`;
}

export function extractCloudinaryPublicId(
  avatarUrl: string,
  cloudName: string,
  avatarFolder: string,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(avatarUrl);
  } catch {
    return null;
  }

  if (parsed.hostname !== "res.cloudinary.com") {
    return null;
  }

  const normalizedFolder = normalizeCloudinaryAvatarFolder(avatarFolder);
  const folderSegments = normalizedFolder.split("/").filter(Boolean);
  const segments = parsed.pathname.split("/").filter(Boolean);
  // Expected shape: /<cloudName>/image/upload/[v12345/]<folderSegments...>/<public_id>.<ext>
  if (segments.length < 4 + folderSegments.length || segments[0] !== cloudName || segments[1] !== "image" || segments[2] !== "upload") {
    return null;
  }

  const afterUpload = segments.slice(3);
  const withoutVersion = /^v\d+$/.test(afterUpload[0] ?? "") ? afterUpload.slice(1) : afterUpload;
  if (
    withoutVersion.length <= folderSegments.length ||
    !folderSegments.every((seg, index) => withoutVersion[index] === seg)
  ) {
    return null;
  }

  const joined = withoutVersion.join("/");
  return joined.replace(/\.[^./]+$/, "");
}

export class CloudinaryMediaStorage implements MediaStorageService {
  private readonly credentials: CloudinaryCredentials;
  private readonly avatarFolder: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: {
    cloudinaryUrl: string;
    avatarFolder?: string;
    fetchFn?: typeof fetch;
  }) {
    this.credentials = parseCloudinaryUrl(options.cloudinaryUrl);
    this.avatarFolder = normalizeCloudinaryAvatarFolder(options.avatarFolder);
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async uploadAvatar(input: UploadAvatarInput): Promise<UploadedMediaResult> {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const safeUserId = input.userId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const publicId = `user_${safeUserId}_${Date.now()}_${randomUUID().slice(0, 8)}`;

    const signableParams = {
      folder: this.avatarFolder,
      public_id: publicId,
      timestamp,
    };

    const signature = buildCloudinarySignature(signableParams, this.credentials.apiSecret);
    const form = new FormData();
    const blob = new Blob([new Uint8Array(input.buffer)], { type: input.mimeType });

    form.append("file", blob, input.filename || `${publicId}.png`);
    form.append("api_key", this.credentials.apiKey);
    form.append("timestamp", timestamp);
    form.append("folder", this.avatarFolder);
    form.append("public_id", publicId);
    form.append("signature", signature);

    const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(this.credentials.cloudName)}/image/upload`;
    let response: Response;
    try {
      response = await this.fetchFn(endpoint, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(CLOUDINARY_REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new HttpApiError(
        502,
        "MEDIA_UPLOAD_FAILED",
        "Could not reach Cloudinary to upload the avatar image.",
      );
    }

    if (!response.ok) {
      let detail = `Cloudinary rejected the upload (HTTP ${response.status}).`;
      try {
        const errPayload = (await response.json()) as { error?: { message?: string } };
        if (errPayload?.error?.message) {
          detail = `Cloudinary upload failed: ${errPayload.error.message}`;
        }
      } catch {
        // Keep generic message if body is not JSON.
      }
      throw new HttpApiError(502, "MEDIA_UPLOAD_FAILED", detail);
    }

    const body = (await response.json()) as { secure_url?: unknown; public_id?: unknown };
    if (typeof body.secure_url !== "string" || body.secure_url.length === 0) {
      throw new HttpApiError(
        502,
        "MEDIA_UPLOAD_FAILED",
        "Cloudinary upload response did not include a secure_url.",
      );
    }

    return {
      secureUrl: body.secure_url,
      publicId:
        typeof body.public_id === "string"
          ? body.public_id
          : `${this.avatarFolder}/${publicId}`,
    };
  }

  async deleteAvatarByUrl(avatarUrl: string): Promise<void> {
    const publicId = extractCloudinaryPublicId(
      avatarUrl,
      this.credentials.cloudName,
      this.avatarFolder,
    );
    if (!publicId) {
      return;
    }

    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = buildCloudinarySignature(
      { invalidate: "true", public_id: publicId, timestamp },
      this.credentials.apiSecret,
    );

    const form = new FormData();
    form.append("public_id", publicId);
    form.append("invalidate", "true");
    form.append("api_key", this.credentials.apiKey);
    form.append("timestamp", timestamp);
    form.append("signature", signature);

    const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(this.credentials.cloudName)}/image/destroy`;
    try {
      await this.fetchFn(endpoint, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(CLOUDINARY_REQUEST_TIMEOUT_MS),
      });
    } catch {
      // Best-effort cleanup; DB state remains authoritative.
    }
  }
}
