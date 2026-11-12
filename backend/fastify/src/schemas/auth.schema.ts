import { z } from "zod";
import { STREAM_CATEGORIES } from "../models/types.js";

export const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

export const RESERVED_HANDLES = new Set([
  "admin",
  "administrator",
  "root",
  "system",
  "api",
  "auth",
  "health",
  "healthz",
  "readyz",
  "following",
  "signin",
  "signup",
  "login",
  "register",
  "profile",
  "studio",
  "watch",
  "moderation",
  "velostream",
]);

export const usernameSchema = z
  .string({ required_error: "Channel handle is required." })
  .trim()
  .transform((val) => val.replace(/^@/, ""))
  .pipe(
    z
      .string()
      .min(3, "Channel handle must be at least 3 characters.")
      .max(32, "Channel handle must be at most 32 characters.")
      .regex(
        USERNAME_REGEX,
        "Channel handle may only contain letters, numbers, and underscores.",
      )
      .refine(
        (val) => !RESERVED_HANDLES.has(val.toLowerCase()),
        "That channel handle is reserved.",
      ),
  );

export const emailSchema = z
  .string({ required_error: "Email address is required." })
  .trim()
  .toLowerCase()
  .max(254, "Email address is too long.")
  .email("Enter a valid email address.");

export const passwordSchema = z
  .string({ required_error: "Password is required." })
  .min(8, "Password must be at least 8 characters long.")
  .max(128, "Password must be at most 128 characters long.")
  .refine((val) => val.trim().length > 0, "Password cannot be only whitespace.");

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Display name cannot be empty.")
  .max(50, "Display name must be at most 50 characters.");

export const RegisterBodySchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema.optional(),
  rememberSession: z.boolean().optional().default(true),
});

export const LoginBodySchema = z
  .object({
    identifier: z.string().trim().optional(),
    email: z.string().trim().optional(),
    password: z
      .string({ required_error: "Password is required." })
      .min(1, "Password is required.")
      .max(128, "Password is too long."),
    rememberSession: z.boolean().optional().default(true),
  })
  .superRefine((data, ctx) => {
    const raw = (data.identifier ?? data.email ?? "").trim();
    if (!raw) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["identifier"],
        message: "Enter your username or email address.",
      });
      return;
    }
    if (raw.includes("@") && !raw.startsWith("@")) {
      const check = emailSchema.safeParse(raw);
      if (!check.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["identifier"],
          message: "Enter a valid email address.",
        });
      }
      return;
    }
    const clean = raw.replace(/^@/, "");
    if (clean.length < 3 || clean.length > 32 || !USERNAME_REGEX.test(clean)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["identifier"],
        message: "Enter a valid username (3–32 letters, numbers, or _) or email.",
      });
    }
  })
  .transform((data) => ({
    identifier: (data.identifier ?? data.email ?? "").trim(),
    password: data.password,
    rememberSession: data.rememberSession,
  }));

export const RefreshBodySchema = z.object({
  refreshToken: z
    .string({ required_error: "Refresh token is required." })
    .trim()
    .min(16, "Invalid refresh token."),
});

export const LogoutBodySchema = z.object({
  refreshToken: z.string().trim().min(1).optional(),
});

export const ChangePasswordBodySchema = z
  .object({
    currentPassword: z
      .string({ required_error: "Current password is required." })
      .min(1, "Enter your current password.")
      .max(128, "Current password is too long."),
    newPassword: passwordSchema,
    confirmPassword: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.confirmPassword !== undefined && data.newPassword !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "New password and confirmation do not match.",
      });
    }
    if (data.currentPassword === data.newPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newPassword"],
        message: "New password must be different from your current password.",
      });
    }
  });

export const avatarUrlSchema = z
  .string()
  .trim()
  .url("Avatar URL must be a valid URL.")
  .max(2048, "Avatar URL is too long.")
  .refine(
    (val) => val.startsWith("https://") || val.startsWith("http://"),
    "Avatar URL must use http:// or https://.",
  );

export const UpdateProfileBodySchema = z.object({
  displayName: displayNameSchema,
  username: usernameSchema,
  email: emailSchema,
  bio: z
    .string()
    .trim()
    .max(500, "Channel bio must be at most 500 characters.")
    .default(""),
  avatarUrl: avatarUrlSchema.nullable().optional(),
});

export const StreamCategorySchema = z.enum(STREAM_CATEGORIES);

export const UpdateChannelBodySchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Stream title cannot be empty.")
      .max(140, "Stream title must be at most 140 characters.")
      .optional(),
    channelTitle: z
      .string()
      .trim()
      .min(1, "Stream title cannot be empty.")
      .max(140, "Stream title must be at most 140 characters.")
      .optional(),
    category: StreamCategorySchema.optional(),
    channelCategory: StreamCategorySchema.optional(),
    slowMode: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.title && !data.channelTitle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["title"],
        message: "Stream title cannot be empty.",
      });
    }
    if (!data.category && !data.channelCategory) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "Select a valid stream category.",
      });
    }
  })
  .transform((data) => ({
    title: (data.title ?? data.channelTitle ?? "").trim(),
    category: (data.category ?? data.channelCategory)!,
    slowMode: data.slowMode,
  }));

export const FollowSlugParamSchema = z.object({
  slug: z
    .string()
    .trim()
    .transform((val) => val.replace(/^@/, ""))
    .pipe(
      z
        .string()
        .min(3, "Channel slug must be at least 3 characters.")
        .max(32, "Channel slug must be at most 32 characters.")
        .regex(USERNAME_REGEX, "Invalid channel handle format."),
    ),
});

export const BanUserBodySchema = z.object({
  username: z
    .string({ required_error: "Username to ban is required." })
    .trim()
    .transform((val) => val.replace(/^@/, ""))
    .pipe(
      z
        .string()
        .min(3, "Username must be at least 3 characters.")
        .max(32, "Username must be at most 32 characters.")
        .regex(USERNAME_REGEX, "Invalid username format."),
    ),
  reason: z
    .string()
    .trim()
    .max(200, "Ban reason must be at most 200 characters.")
    .optional()
    .transform((val) => (val && val.length > 0 ? val : "Channel moderation action")),
});

export const BanUsernameParamSchema = z.object({
  username: z
    .string()
    .trim()
    .transform((val) => val.replace(/^@/, ""))
    .pipe(z.string().min(1).max(32)),
});

export const SearchUsersQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(64, "Search query must be at most 64 characters.")
    .optional()
    .default(""),
  limit: z.coerce.number().int().min(1).max(30).optional().default(12),
});

export const PublicUsernameParamSchema = z.object({
  username: z
    .string()
    .trim()
    .transform((val) => val.replace(/^@/, ""))
    .pipe(
      z
        .string()
        .min(1, "Username is required.")
        .max(32, "Username must be at most 32 characters.")
        .regex(USERNAME_REGEX, "Invalid username format."),
    ),
});
