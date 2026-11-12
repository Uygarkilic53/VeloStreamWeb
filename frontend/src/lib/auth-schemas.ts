import { z } from "zod";

export const STREAM_CATEGORIES = [
  "Gaming",
  "Just Chatting",
  "Programming",
  "Music & Audio",
  "Creative",
] as const;

export type StreamCategory = (typeof STREAM_CATEGORIES)[number];

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

export const UsernameFieldSchema = z
  .string()
  .trim()
  .transform((val) => val.replace(/^@/, ""))
  .pipe(
    z
      .string()
      .min(3, "Channel handle must be at least 3 characters.")
      .max(32, "Channel handle must be at most 32 characters.")
      .regex(
        USERNAME_REGEX,
        "Use only letters, numbers, and underscores for your channel handle.",
      )
      .refine(
        (val) => !RESERVED_HANDLES.has(val.toLowerCase()),
        "That channel handle is reserved.",
      ),
  );

export const EmailFieldSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email address is too long.")
  .email("Enter a valid email address.");

export const PasswordFieldSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long.")
  .max(128, "Password must be at most 128 characters long.")
  .refine((val) => val.trim().length > 0, "Password cannot be only whitespace.");

export const SignInValidationSchema = z
  .object({
    identifier: z.string().trim(),
    password: z
      .string()
      .min(1, "Enter your password.")
      .max(128, "Password is too long."),
    rememberSession: z.boolean().optional().default(true),
  })
  .superRefine((data, ctx) => {
    const raw = data.identifier.trim();
    if (!raw) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["identifier"],
        message: "Enter your username or email address.",
      });
      return;
    }
    if (raw.includes("@") && !raw.startsWith("@")) {
      const parsed = EmailFieldSchema.safeParse(raw);
      if (!parsed.success) {
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
        message: "Enter a valid username (3–32 letters, digits, or _) or email.",
      });
    }
  });

export const SignUpValidationSchema = z
  .object({
    username: UsernameFieldSchema,
    displayName: z
      .string()
      .trim()
      .max(50, "Display name must be at most 50 characters.")
      .optional()
      .transform((val) => (val && val.length > 0 ? val : undefined)),
    email: EmailFieldSchema,
    password: PasswordFieldSchema,
    confirmPassword: z.string().optional(),
    rememberSession: z.boolean().optional().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.confirmPassword !== undefined && data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

export const ProfileUpdateValidationSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Display name cannot be empty.")
    .max(50, "Display name must be at most 50 characters."),
  username: UsernameFieldSchema,
  email: EmailFieldSchema,
  bio: z.string().trim().max(500, "Channel bio must be at most 500 characters."),
});

export const ChannelSettingsValidationSchema = z.object({
  channelTitle: z
    .string()
    .trim()
    .min(1, "Stream title cannot be empty.")
    .max(140, "Stream title must be at most 140 characters."),
  channelCategory: z.enum(STREAM_CATEGORIES),
  slowMode: z.boolean().optional(),
});

export const PasswordUpdateValidationSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "Enter your current password to confirm changes.")
      .max(128, "Current password is too long."),
    newPassword: PasswordFieldSchema,
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .superRefine((data, ctx) => {
    if (data.newPassword !== data.confirmPassword) {
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

export const BanUserValidationSchema = z.object({
  username: z
    .string()
    .trim()
    .transform((val) => val.replace(/^@/, ""))
    .pipe(
      z
        .string()
        .min(3, "Username must be at least 3 characters.")
        .max(32, "Username must be at most 32 characters.")
        .regex(USERNAME_REGEX, "Use only letters, numbers, and underscores."),
    ),
  reason: z
    .string()
    .trim()
    .max(200, "Reason must be at most 200 characters.")
    .optional(),
});

export const BackendChannelBanSchema = z.object({
  id: z.string(),
  userId: z.string(),
  username: z.string(),
  reason: z.string(),
  bannedAt: z.string(),
  expiresAt: z.string().nullable().optional(),
});

export const BackendChannelSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  category: z.enum(STREAM_CATEGORIES),
  streamKey: z.string(),
  slowMode: z.boolean(),
  isLive: z.boolean(),
});

export const BackendUserProfileSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  displayName: z.string().min(1).optional(),
  email: z.string().email(),
  bio: z.string().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  role: z.string().optional(),
  channel: BackendChannelSchema.nullable().optional(),
  bannedUsers: z.array(BackendChannelBanSchema).optional(),
  followedSlugs: z.array(z.string()).optional(),
});

export const AuthSessionResponseSchema = z.object({
  accessToken: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
  refreshToken: z.string().min(1).optional(),
  expiresIn: z.number().optional(),
  message: z.string().optional(),
  user: BackendUserProfileSchema,
});

export const ApiErrorResponseSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
  fieldErrors: z.record(z.array(z.string())).optional(),
});

export type FieldErrorMap = Record<string, string[]>;

export function extractZodFieldErrors(error: z.ZodError): {
  message: string;
  fieldErrors: FieldErrorMap;
} {
  const fieldErrors: FieldErrorMap = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "_form";
    const list = fieldErrors[key] ?? [];
    list.push(issue.message);
    fieldErrors[key] = list;
  }
  return {
    message: error.issues[0]?.message ?? "Check the highlighted fields and try again.",
    fieldErrors,
  };
}

