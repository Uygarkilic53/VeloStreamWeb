import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "react-toastify";
import { z } from "zod";
import {
  ApiErrorResponseSchema,
  AuthSessionResponseSchema,
  BackendChannelSchema,
  BackendUserProfileSchema,
  BanUserValidationSchema,
  ChannelSettingsValidationSchema,
  extractZodFieldErrors,
  ProfileUpdateValidationSchema,
  PasswordUpdateValidationSchema,
  SignInValidationSchema,
  SignUpValidationSchema,
  type FieldErrorMap,
  type StreamCategory,
} from "./auth-schemas";
import {
  clearRememberMeCookie,
  getRememberMeCookie,
  hasStoredSession,
  setRememberMeCookie,
} from "./cookies";
import { getFrontendEnv } from "./env";

export type { StreamCategory } from "./auth-schemas";

export interface BannedChatUser {
  username: string;
  bannedAtLabel: string;
  reason: string;
}

export interface ChannelModeratorView {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  assignedAt: string;
}

export interface ChannelMuteView {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  reason: string;
  expiresAt: string | null;
  mutedAt: string;
}

export interface ChannelWarningView {
  id: string;
  channelId: string;
  userId: string;
  username: string;
  moderatorUsername: string;
  reason: string;
  createdAt: string;
}

export interface UserAccount {
  id: string;
  username: string;
  displayName: string;
  email: string;
  bio: string;
  avatarUrl: string | null;
  role: string;
  theme: "light" | "dark";
  channelTitle: string;
  channelCategory: StreamCategory;
  streamKey: string;
  slowMode: boolean;
  bannedUsers: BannedChatUser[];
  bannedFromSlugs: string[];
  followedSlugs: string[];
  accessToken: string | null;
  sessionKind: "backend" | "preview";
}

export interface SignInInput {
  identifier: string;
  password: string;
  rememberSession?: boolean;
}

export interface SignUpInput {
  username: string;
  displayName?: string;
  email: string;
  password: string;
  confirmPassword?: string;
  rememberSession?: boolean;
}

export interface AuthAttemptResult {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: FieldErrorMap;
  backendUnavailable?: boolean;
  fromApi?: boolean;
}

interface StoredSessionTokens {
  accessToken: string;
  refreshToken: string;
  rememberSession: boolean;
}

const SESSION_STORAGE_KEY = "velostream_auth_session";

const DEFAULT_BANNED_USERS: BannedChatUser[] = [
  {
    username: "spam_bot_99",
    bannedAtLabel: "Yesterday",
    reason: "Automated phishing links",
  },
  {
    username: "troll_user",
    bannedAtLabel: "3 days ago",
    reason: "Repeated harassment in chat",
  },
];

function generateLocalStreamKey(): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let suffix = "";
  for (let i = 0; i < 16; i += 1) {
    suffix += chars[Math.floor(Math.random() * chars.length)] ?? "x";
  }
  return `sk_live_${suffix}`;
}

function formatBanTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function buildPreviewAccount(username: string, email: string, displayName?: string): UserAccount {
  const cleanUsername = username.replace(/^@/, "") || "deniz_k";
  return {
    id: `usr_${cleanUsername}`,
    username: cleanUsername,
    displayName: displayName?.trim() || "Deniz Kaya",
    email: email.trim() || `${cleanUsername}@velostream.dev`,
    bio: "Systems engineer building low-latency WebRTC pipelines and Go real-time chat services.",
    avatarUrl: null,
    role: "USER",
    theme: "light",
    channelTitle: "Late night Rust & Go live coding — zero-allocation chat hub",
    channelCategory: "Programming",
    streamKey: generateLocalStreamKey(),
    slowMode: true,
    bannedUsers: DEFAULT_BANNED_USERS,
    bannedFromSlugs: [],
    followedSlugs: ["mira_codes", "dev_alex", "sarah_j", "kuro_fps"],
    accessToken: null,
    sessionKind: "preview",
  };
}

function mapBackendProfileToUserAccount(
  profile: z.infer<typeof BackendUserProfileSchema>,
  accessToken: string | null,
): UserAccount {
  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.displayName ?? profile.username,
    email: profile.email,
    bio: profile.bio ?? "",
    avatarUrl: profile.avatarUrl ?? null,
    role: profile.role ?? "USER",
    theme: profile.theme ?? "light",
    channelTitle: profile.channel?.title ?? `${profile.username}'s live broadcast`,
    channelCategory: profile.channel?.category ?? "Programming",
    streamKey: profile.channel?.streamKey ?? "",
    slowMode: profile.channel?.slowMode ?? false,
    bannedUsers: (profile.bannedUsers ?? []).map((ban) => ({
      username: ban.username,
      reason: ban.reason,
      bannedAtLabel: formatBanTimestamp(ban.bannedAt),
    })),
    bannedFromSlugs: profile.bannedFromSlugs ?? [],
    followedSlugs: profile.followedSlugs ?? [],
    accessToken,
    sessionKind: "backend",
  };
}

function getCoreApiBaseUrl(): string {
  return getFrontendEnv().coreApiUrl.replace(/\/+$/, "");
}

function readStoredTokens(): StoredSessionTokens | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const fromLocal = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (fromLocal) {
      const parsed = JSON.parse(fromLocal) as Partial<StoredSessionTokens>;
      if (parsed.accessToken && parsed.refreshToken) {
        return {
          accessToken: parsed.accessToken,
          refreshToken: parsed.refreshToken,
          rememberSession: true,
        };
      }
    }
    const fromSession = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (fromSession) {
      const parsed = JSON.parse(fromSession) as Partial<StoredSessionTokens>;
      if (parsed.accessToken && parsed.refreshToken) {
        return {
          accessToken: parsed.accessToken,
          refreshToken: parsed.refreshToken,
          rememberSession: false,
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

function writeStoredTokens(tokens: StoredSessionTokens | null): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    if (!tokens) {
      return;
    }
    const serialized = JSON.stringify(tokens);
    if (tokens.rememberSession) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, serialized);
    } else {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, serialized);
    }
  } catch {
    // Ignore storage quota / restricted context errors.
  }
}

async function parseErrorResponse(response: Response): Promise<{
  code?: string;
  message: string;
  fieldErrors?: FieldErrorMap;
  backendUnavailable: boolean;
}> {
  let raw: unknown = null;
  try {
    raw = await response.json();
  } catch {
    raw = null;
  }
  const parsed = ApiErrorResponseSchema.safeParse(raw);
  const code = parsed.success ? parsed.data.error : undefined;
  const fieldErrors = parsed.success ? parsed.data.fieldErrors : undefined;

  if (
    response.status === 404 ||
    (response.status === 503 &&
      (code === "DATABASE_UNCONFIGURED" || code === "AUTH_UNCONFIGURED"))
  ) {
    return {
      ...(code ? { code } : {}),
      backendUnavailable: true,
      message:
        parsed.success && parsed.data.message
          ? `${parsed.data.message} You can use a local preview session below while connecting PostgreSQL.`
          : "Core API authentication service is unavailable right now. You can use a local preview session to explore signed-in pages.",
    };
  }

  return {
    ...(code ? { code } : {}),
    ...(fieldErrors ? { fieldErrors } : {}),
    backendUnavailable: false,
    message:
      parsed.success && parsed.data.message
        ? parsed.data.message
        : `Request rejected by server (HTTP ${response.status}).`,
  };
}

export interface AuthContextValue {
  user: UserAccount | null;
  isSubmitting: boolean;
  isHydrating: boolean;
  signIn: (input: SignInInput) => Promise<AuthAttemptResult>;
  signUp: (input: SignUpInput) => Promise<AuthAttemptResult>;
  enterPreviewSession: (overrides?: {
    username?: string;
    email?: string;
    displayName?: string;
    rememberSession?: boolean;
  }) => void;
  signOut: () => Promise<void>;
  updateTheme: (theme: "light" | "dark") => Promise<AuthAttemptResult>;
  updateProfile: (patch: {
    displayName: string;
    username: string;
    email: string;
    bio: string;
  }) => Promise<AuthAttemptResult>;
  uploadAvatar: (file: File) => Promise<AuthAttemptResult>;
  removeAvatar: () => Promise<AuthAttemptResult>;
  updateChannelSettings: (patch: {
    channelTitle: string;
    channelCategory: StreamCategory;
    slowMode?: boolean;
  }) => Promise<AuthAttemptResult>;
  rotateStreamKey: () => Promise<AuthAttemptResult>;
  changePassword: (patch: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => Promise<AuthAttemptResult>;
  unbanUser: (username: string, channelSlug?: string) => Promise<AuthAttemptResult>;
  banUser: (username: string, reason?: string, channelSlug?: string) => Promise<AuthAttemptResult>;
  listModerators: (channelSlug?: string) => Promise<{ ok: boolean; moderators?: ChannelModeratorView[]; error?: string }>;
  addModerator: (username: string, channelSlug?: string) => Promise<AuthAttemptResult>;
  removeModerator: (username: string, channelSlug?: string) => Promise<AuthAttemptResult>;
  listSilences: (channelSlug?: string) => Promise<{ ok: boolean; silences?: ChannelMuteView[]; error?: string }>;
  silenceUser: (username: string, duration?: string, reason?: string, channelSlug?: string) => Promise<AuthAttemptResult>;
  unsilenceUser: (username: string, channelSlug?: string) => Promise<AuthAttemptResult>;
  sendWarning: (username: string, reason: string, channelSlug?: string) => Promise<AuthAttemptResult>;
  toggleFollow: (slug: string) => Promise<AuthAttemptResult>;
  markChannelBanned: (slug: string) => void;
  clearChannelBanned?: (slug: string) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserAccount | null>(() => {
    if (typeof window === "undefined") return null;
    const rememberedCookie = getRememberMeCookie();
    if (rememberedCookie?.user) {
      return rememberedCookie.user as UserAccount;
    }
    try {
      const previewRaw =
        window.localStorage.getItem("velostream_preview_user") ||
        window.sessionStorage.getItem("velostream_preview_user");
      if (previewRaw) {
        const previewObj = JSON.parse(previewRaw) as UserAccount;
        if (previewObj && previewObj.sessionKind === "preview") {
          return previewObj;
        }
      }
    } catch {
      // Ignore storage errors
    }
    return null;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHydrating, setIsHydrating] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return hasStoredSession();
  });
  const tokensRef = useRef<StoredSessionTokens | null>(null);

  const persistTokens = useCallback((next: StoredSessionTokens | null) => {
    tokensRef.current = next;
    writeStoredTokens(next);
  }, []);

  const refreshBackendSession = useCallback(async (): Promise<StoredSessionTokens | null> => {
    const current = tokensRef.current;
    if (!current?.refreshToken) {
      return null;
    }

    const response = await fetch(`${getCoreApiBaseUrl()}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        persistTokens(null);
        setUser(null);
      }
      return null;
    }

    const raw: unknown = await response.json();
    const parsed = AuthSessionResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return null;
    }

    const accessToken = parsed.data.accessToken ?? parsed.data.token;
    const refreshToken = parsed.data.refreshToken ?? current.refreshToken;
    if (!accessToken) {
      return null;
    }

    const updatedTokens: StoredSessionTokens = {
      accessToken,
      refreshToken,
      rememberSession: current.rememberSession,
    };
    persistTokens(updatedTokens);
    const updatedUser = mapBackendProfileToUserAccount(parsed.data.user, accessToken);
    if (current.rememberSession) {
      setRememberMeCookie({
        user: updatedUser,
        accessToken,
        refreshToken,
        rememberSession: true,
      });
    }
    setUser(updatedUser);
    return updatedTokens;
  }, [persistTokens]);

  const authorizedFetch = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const baseUrl = getCoreApiBaseUrl();
      const makeRequest = (token: string | null) => {
        const headers = new Headers(init.headers);
        headers.set("Accept", "application/json");
        if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
          headers.set("Content-Type", "application/json");
        }
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }
        return fetch(`${baseUrl}${path}`, { ...init, headers });
      };

      const initialToken = tokensRef.current?.accessToken ?? null;
      const firstResponse = await makeRequest(initialToken);
      if (firstResponse.status !== 401 || !tokensRef.current?.refreshToken) {
        return firstResponse;
      }

      const refreshed = await refreshBackendSession();
      if (!refreshed) {
        return firstResponse;
      }
      return makeRequest(refreshed.accessToken);
    },
    [refreshBackendSession],
  );

  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      const rememberedCookie = getRememberMeCookie();
      const stored = readStoredTokens();

      // If we have a remembered cookie with user details, hydrate user immediately!
      if (rememberedCookie?.user) {
        setUser(rememberedCookie.user as UserAccount);
        if (rememberedCookie.accessToken && rememberedCookie.refreshToken) {
          tokensRef.current = {
            accessToken: rememberedCookie.accessToken,
            refreshToken: rememberedCookie.refreshToken,
            rememberSession: true,
          };
        } else if (stored) {
          tokensRef.current = stored;
        }
      } else if (stored) {
        tokensRef.current = stored;
      }

      if (!tokensRef.current?.accessToken && !tokensRef.current?.refreshToken) {
        // If already restored from cookie (such as a remembered preview session or offline account)
        if (rememberedCookie?.user) {
          if (!cancelled) {
            setIsHydrating(false);
          }
          return;
        }

        if (typeof window !== "undefined") {
          try {
            const previewRaw =
              window.localStorage.getItem("velostream_preview_user") ||
              window.sessionStorage.getItem("velostream_preview_user");
            if (previewRaw) {
              const previewObj = JSON.parse(previewRaw) as UserAccount;
              if (previewObj && previewObj.sessionKind === "preview") {
                setUser(previewObj);
              }
            }
          } catch {
            // Ignore sessionStorage parse errors
          }
        }
        if (!cancelled) {
          setIsHydrating(false);
        }
        return;
      }

      try {
        const response = await authorizedFetch("/api/v1/auth/me", { method: "GET" });
        if (cancelled) return;
        if (response.ok) {
          const raw: unknown = await response.json();
          const parsed = z.object({ user: BackendUserProfileSchema }).safeParse(raw);
          if (parsed.success) {
            const currentToken = tokensRef.current?.accessToken ?? stored?.accessToken ?? null;
            const updatedUser = mapBackendProfileToUserAccount(
              parsed.data.user,
              currentToken,
            );
            setUser(updatedUser);
            if (tokensRef.current?.rememberSession) {
              setRememberMeCookie({
                user: updatedUser,
                accessToken: currentToken,
                refreshToken: tokensRef.current.refreshToken,
                rememberSession: true,
              });
            }
          }
        } else if (response.status === 401 || response.status === 403) {
          persistTokens(null);
          clearRememberMeCookie();
          setUser(null);
        }
      } catch {
        // Core API server is shut down or temporarily unreachable.
        // If the user clicked "Remember me", keep them signed in from the cookie!
        if (rememberedCookie?.user) {
          setUser(rememberedCookie.user as UserAccount);
        }
      } finally {
        if (!cancelled) {
          setIsHydrating(false);
        }
      }
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, [authorizedFetch, persistTokens]);

  // Sync updates to user profile/theme/channel into the remember me cookie when active
  useEffect(() => {
    if (!user) {
      return;
    }
    const isRemembered =
      tokensRef.current?.rememberSession ||
      Boolean(getRememberMeCookie()?.rememberSession);

    if (isRemembered) {
      setRememberMeCookie({
        user,
        accessToken: tokensRef.current?.accessToken ?? user.accessToken,
        refreshToken: tokensRef.current?.refreshToken ?? null,
        rememberSession: true,
      });
    }
  }, [user]);

  const signIn = useCallback(
    async ({ identifier, password, rememberSession = true }: SignInInput): Promise<AuthAttemptResult> => {
      const validation = SignInValidationSchema.safeParse({
        identifier,
        password,
        rememberSession,
      });
      if (!validation.success) {
        const formatted = extractZodFieldErrors(validation.error);
        return { ok: false, error: formatted.message, fieldErrors: formatted.fieldErrors };
      }

      setIsSubmitting(true);
      try {
        const response = await fetch(`${getCoreApiBaseUrl()}/api/v1/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            identifier: validation.data.identifier,
            password: validation.data.password,
            rememberSession: validation.data.rememberSession,
          }),
        });

        if (!response.ok) {
          const errInfo = await parseErrorResponse(response);
          return {
            ok: false,
            error: errInfo.message,
            ...(errInfo.fieldErrors ? { fieldErrors: errInfo.fieldErrors } : {}),
            backendUnavailable: errInfo.backendUnavailable,
            fromApi: true,
          };
        }

        const raw: unknown = await response.json();
        const parsed = AuthSessionResponseSchema.safeParse(raw);
        if (!parsed.success) {
          return { ok: false, error: "Unexpected response from authentication server." };
        }

        const accessToken = parsed.data.accessToken ?? parsed.data.token ?? null;
        if (accessToken && parsed.data.refreshToken) {
          persistTokens({
            accessToken,
            refreshToken: parsed.data.refreshToken,
            rememberSession: validation.data.rememberSession,
          });
        }
        const userAccount = mapBackendProfileToUserAccount(parsed.data.user, accessToken);
        if (validation.data.rememberSession) {
          setRememberMeCookie({
            user: userAccount,
            accessToken,
            refreshToken: parsed.data.refreshToken ?? null,
            rememberSession: true,
          });
        } else {
          clearRememberMeCookie();
        }
        setUser(userAccount);
        return {
          ok: true,
          message: parsed.data.message ?? "Signed in successfully.",
        };
      } catch {
        return {
          ok: false,
          backendUnavailable: true,
          error:
            "Could not reach Core API. Start the backend or use a local preview session to explore signed-in pages.",
        };
      } finally {
        setIsSubmitting(false);
      }
    },
    [persistTokens],
  );

  const signUp = useCallback(
    async ({
      username,
      displayName,
      email,
      password,
      confirmPassword,
      rememberSession = true,
    }: SignUpInput): Promise<AuthAttemptResult> => {
      const validation = SignUpValidationSchema.safeParse({
        username,
        displayName,
        email,
        password,
        confirmPassword,
        rememberSession,
      });
      if (!validation.success) {
        const formatted = extractZodFieldErrors(validation.error);
        return { ok: false, error: formatted.message, fieldErrors: formatted.fieldErrors };
      }

      setIsSubmitting(true);
      try {
        const response = await fetch(`${getCoreApiBaseUrl()}/api/v1/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            username: validation.data.username,
            ...(validation.data.displayName ? { displayName: validation.data.displayName } : {}),
            email: validation.data.email,
            password: validation.data.password,
            rememberSession: validation.data.rememberSession,
          }),
        });

        if (!response.ok) {
          const errInfo = await parseErrorResponse(response);
          return {
            ok: false,
            error: errInfo.message,
            ...(errInfo.fieldErrors ? { fieldErrors: errInfo.fieldErrors } : {}),
            backendUnavailable: errInfo.backendUnavailable,
            fromApi: true,
          };
        }

        const raw: unknown = await response.json();
        const parsed = AuthSessionResponseSchema.safeParse(raw);
        if (!parsed.success) {
          return { ok: false, error: "Unexpected response from registration server." };
        }

        const accessToken = parsed.data.accessToken ?? parsed.data.token ?? null;
        if (accessToken && parsed.data.refreshToken) {
          persistTokens({
            accessToken,
            refreshToken: parsed.data.refreshToken,
            rememberSession: validation.data.rememberSession,
          });
        }
        const userAccount = mapBackendProfileToUserAccount(parsed.data.user, accessToken);
        if (validation.data.rememberSession) {
          setRememberMeCookie({
            user: userAccount,
            accessToken,
            refreshToken: parsed.data.refreshToken ?? null,
            rememberSession: true,
          });
        } else {
          clearRememberMeCookie();
        }
        setUser(userAccount);
        return {
          ok: true,
          message: parsed.data.message ?? "Account created successfully.",
        };
      } catch {
        return {
          ok: false,
          backendUnavailable: true,
          error:
            "Could not reach Core API. Use a local preview session below to explore signed-in channel & studio pages.",
        };
      } finally {
        setIsSubmitting(false);
      }
    },
    [persistTokens],
  );

  const enterPreviewSession = useCallback(
    (overrides?: {
      username?: string;
      email?: string;
      displayName?: string;
      rememberSession?: boolean;
    }) => {
      persistTokens(null);
      const cleanUsername = overrides?.username?.replace(/^@/, "").trim() || "deniz_k";
      const account = buildPreviewAccount(
        cleanUsername,
        overrides?.email?.trim() || `${cleanUsername}@velostream.dev`,
        overrides?.displayName || (overrides?.username ? overrides.username : undefined),
      );
      const shouldRemember = overrides?.rememberSession ?? true;
      if (typeof window !== "undefined") {
        try {
          if (shouldRemember) {
            window.localStorage.setItem("velostream_preview_user", JSON.stringify(account));
            window.sessionStorage.removeItem("velostream_preview_user");
          } else {
            window.sessionStorage.setItem("velostream_preview_user", JSON.stringify(account));
            window.localStorage.removeItem("velostream_preview_user");
          }
        } catch {
          // Ignore storage errors
        }
      }
      if (shouldRemember) {
        setRememberMeCookie({
          user: account,
          accessToken: null,
          refreshToken: null,
          rememberSession: true,
        });
      } else {
        clearRememberMeCookie();
      }
      setUser(account);
      toast.info("Entered local preview session.");
    },
    [persistTokens],
  );

  const signOut = useCallback(async () => {
    const currentSessionKind = user?.sessionKind;
    const refreshToken = tokensRef.current?.refreshToken;
    persistTokens(null);
    clearRememberMeCookie();
    setUser(null);

    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem("velostream_preview_user");
        window.sessionStorage.removeItem("velostream_preview_user");
      } catch {
        // Ignore storage errors
      }
    }

    if (currentSessionKind === "preview" || !refreshToken) {
      toast.info("Signed out of local preview session.");
      return;
    }

    try {
      const response = await fetch(`${getCoreApiBaseUrl()}/api/v1/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        const errInfo = await parseErrorResponse(response);
        toast.error(errInfo.message);
        return;
      }

      const raw: unknown = await response.json().catch(() => null);
      const parsed = z
        .object({
          ok: z.boolean().optional(),
          message: z.string().optional(),
        })
        .safeParse(raw);

      toast.success(
        parsed.success && parsed.data.message
          ? parsed.data.message
          : "Logged out successfully.",
      );
    } catch {
      toast.info("Signed out locally.");
    }
  }, [persistTokens, user?.sessionKind]);

  const updateProfile = useCallback(
    async (patch: {
      displayName: string;
      username: string;
      email: string;
      bio: string;
    }): Promise<AuthAttemptResult> => {
      const validation = ProfileUpdateValidationSchema.safeParse(patch);
      if (!validation.success) {
        const formatted = extractZodFieldErrors(validation.error);
        return { ok: false, error: formatted.message, fieldErrors: formatted.fieldErrors };
      }

      if (!user) {
        return { ok: false, error: "Sign in before editing your profile." };
      }

      if (user.sessionKind === "preview") {
        setUser((prev) =>
          prev
            ? {
                ...prev,
                displayName: validation.data.displayName,
                username: validation.data.username,
                email: validation.data.email,
                bio: validation.data.bio,
              }
            : prev,
        );
        return { ok: true };
      }

      try {
        const response = await authorizedFetch("/api/v1/users/me", {
          method: "PATCH",
          body: JSON.stringify(validation.data),
        });
        if (!response.ok) {
          const errInfo = await parseErrorResponse(response);
          return {
            ok: false,
            error: errInfo.message,
            ...(errInfo.fieldErrors ? { fieldErrors: errInfo.fieldErrors } : {}),
          };
        }

        const raw: unknown = await response.json();
        const parsed = z
          .object({
            user: BackendUserProfileSchema,
            accessToken: z.string().min(1).optional(),
            message: z.string().optional(),
          })
          .safeParse(raw);
        if (!parsed.success) {
          return { ok: false, error: "Unexpected response from profile service." };
        }

        const nextAccessToken = parsed.data.accessToken ?? tokensRef.current?.accessToken ?? user.accessToken;
        if (parsed.data.accessToken && tokensRef.current) {
          persistTokens({
            ...tokensRef.current,
            accessToken: parsed.data.accessToken,
          });
        }
        setUser(mapBackendProfileToUserAccount(parsed.data.user, nextAccessToken));
        return {
          ok: true,
          message: parsed.data.message ?? "Public profile updated.",
        };
      } catch {
        return { ok: false, error: "Could not reach Core API to save profile changes." };
      }
    },
    [authorizedFetch, persistTokens, user],
  );

  const updateTheme = useCallback(
    async (nextTheme: "light" | "dark"): Promise<AuthAttemptResult> => {
      if (!user) {
        return { ok: false, error: "Sign in before changing appearance preferences." };
      }

      if (user.sessionKind === "preview") {
        setUser((prev) => {
          if (!prev) return prev;
          const next = { ...prev, theme: nextTheme };
          if (typeof window !== "undefined") {
            try {
              window.sessionStorage.setItem("velostream_preview_user", JSON.stringify(next));
            } catch {
              // Ignore storage errors
            }
          }
          return next;
        });
        return {
          ok: true,
          message: `Appearance preference set to ${nextTheme === "dark" ? "Dark" : "Light"} Mode.`,
        };
      }

      try {
        const response = await authorizedFetch("/api/v1/users/me/theme", {
          method: "PATCH",
          body: JSON.stringify({ theme: nextTheme }),
        });
        if (!response.ok) {
          const errInfo = await parseErrorResponse(response);
          return {
            ok: false,
            error: errInfo.message,
            ...(errInfo.fieldErrors ? { fieldErrors: errInfo.fieldErrors } : {}),
          };
        }

        const raw: unknown = await response.json();
        const parsed = z
          .object({
            user: BackendUserProfileSchema,
            message: z.string().optional(),
          })
          .safeParse(raw);
        if (!parsed.success) {
          return { ok: false, error: "Unexpected response from appearance preference service." };
        }

        const token = tokensRef.current?.accessToken ?? user.accessToken;
        setUser(mapBackendProfileToUserAccount(parsed.data.user, token));
        return {
          ok: true,
          message:
            parsed.data.message ??
            `Appearance preference set to ${nextTheme === "dark" ? "Dark" : "Light"} Mode.`,
        };
      } catch {
        return { ok: false, error: "Could not reach Core API to update appearance preference." };
      }
    },
    [authorizedFetch, user],
  );

  const uploadAvatar = useCallback(
    async (file: File): Promise<AuthAttemptResult> => {
      if (!user) {
        return { ok: false, error: "Sign in before uploading a profile photo." };
      }

      const allowedTypes = new Set([
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif",
      ]);
      const hasValidMime = file.type ? allowedTypes.has(file.type.toLowerCase()) : false;
      const hasValidExt = /\.(png|jpe?g|webp|gif)$/i.test(file.name);
      if ((file.type && !hasValidMime) || (!file.type && !hasValidExt)) {
        return {
          ok: false,
          error: "Unsupported image format. Upload PNG, JPEG, WebP, or GIF.",
        };
      }
      if (file.size === 0) {
        return { ok: false, error: "Selected image file is empty." };
      }
      if (file.size > 5 * 1024 * 1024) {
        return { ok: false, error: "Avatar image must be 5 MB or smaller." };
      }

      if (user.sessionKind === "preview") {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") {
              resolve(reader.result);
            } else {
              reject(new Error("Could not read image preview."));
            }
          };
          reader.onerror = () => reject(new Error("Could not read image preview."));
          reader.readAsDataURL(file);
        }).catch(() => null);

        if (!dataUrl) {
          return { ok: false, error: "Could not read selected image file." };
        }
        setUser((prev) => (prev ? { ...prev, avatarUrl: dataUrl } : prev));
        return { ok: true };
      }

      try {
        const formData = new FormData();
        formData.append("avatar", file);
        const response = await authorizedFetch("/api/v1/users/me/avatar", {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          const errInfo = await parseErrorResponse(response);
          return {
            ok: false,
            error: errInfo.message,
            ...(errInfo.fieldErrors ? { fieldErrors: errInfo.fieldErrors } : {}),
          };
        }

        const raw: unknown = await response.json();
        const parsed = z
          .object({
            user: BackendUserProfileSchema,
            message: z.string().optional(),
          })
          .safeParse(raw);
        if (!parsed.success) {
          return { ok: false, error: "Unexpected response from avatar upload service." };
        }

        const token = tokensRef.current?.accessToken ?? user.accessToken;
        setUser(mapBackendProfileToUserAccount(parsed.data.user, token));
        return {
          ok: true,
          message: parsed.data.message ?? "Profile photo updated.",
        };
      } catch {
        return { ok: false, error: "Could not reach Core API to upload profile avatar." };
      }
    },
    [authorizedFetch, user],
  );

  const removeAvatar = useCallback(async (): Promise<AuthAttemptResult> => {
    if (!user) {
      return { ok: false, error: "Sign in before removing your profile photo." };
    }

    if (user.sessionKind === "preview") {
      setUser((prev) => (prev ? { ...prev, avatarUrl: null } : prev));
      return { ok: true };
    }

    try {
      const response = await authorizedFetch("/api/v1/users/me/avatar", {
        method: "DELETE",
      });
      if (!response.ok) {
        const errInfo = await parseErrorResponse(response);
        return { ok: false, error: errInfo.message };
      }

      const raw: unknown = await response.json();
      const parsed = z
        .object({
          user: BackendUserProfileSchema,
          message: z.string().optional(),
        })
        .safeParse(raw);
      if (!parsed.success) {
        return { ok: false, error: "Unexpected response from avatar service." };
      }

      const token = tokensRef.current?.accessToken ?? user.accessToken;
      setUser(mapBackendProfileToUserAccount(parsed.data.user, token));
      return {
        ok: true,
        message: parsed.data.message ?? "Profile photo removed.",
      };
    } catch {
      return { ok: false, error: "Could not reach Core API to remove profile avatar." };
    }
  }, [authorizedFetch, user]);

  const updateChannelSettings = useCallback(
    async (patch: {
      channelTitle: string;
      channelCategory: StreamCategory;
      slowMode?: boolean;
    }): Promise<AuthAttemptResult> => {
      const validation = ChannelSettingsValidationSchema.safeParse(patch);
      if (!validation.success) {
        const formatted = extractZodFieldErrors(validation.error);
        return { ok: false, error: formatted.message, fieldErrors: formatted.fieldErrors };
      }

      if (!user) {
        return { ok: false, error: "Sign in before changing channel settings." };
      }

      if (user.sessionKind === "preview") {
        setUser((prev) =>
          prev
            ? {
                ...prev,
                channelTitle: validation.data.channelTitle,
                channelCategory: validation.data.channelCategory,
                slowMode: validation.data.slowMode ?? prev.slowMode,
              }
            : prev,
        );
        return { ok: true };
      }

      try {
        const response = await authorizedFetch("/api/v1/channels/me", {
          method: "PATCH",
          body: JSON.stringify({
            title: validation.data.channelTitle,
            category: validation.data.channelCategory,
            ...(validation.data.slowMode !== undefined
              ? { slowMode: validation.data.slowMode }
              : {}),
          }),
        });
        if (!response.ok) {
          const errInfo = await parseErrorResponse(response);
          return {
            ok: false,
            error: errInfo.message,
            ...(errInfo.fieldErrors ? { fieldErrors: errInfo.fieldErrors } : {}),
          };
        }

        const raw: unknown = await response.json();
        const parsed = z
          .object({
            channel: BackendChannelSchema,
            message: z.string().optional(),
          })
          .safeParse(raw);
        if (!parsed.success) {
          return { ok: false, error: "Unexpected response from channel service." };
        }

        setUser((prev) =>
          prev
            ? {
                ...prev,
                channelTitle: parsed.data.channel.title,
                channelCategory: parsed.data.channel.category,
                slowMode: parsed.data.channel.slowMode,
              }
            : prev,
        );
        return {
          ok: true,
          ...(parsed.data.message ? { message: parsed.data.message } : {}),
        };
      } catch {
        return { ok: false, error: "Could not reach Core API to save channel settings." };
      }
    },
    [authorizedFetch, user],
  );

  const rotateStreamKey = useCallback(async (): Promise<AuthAttemptResult> => {
    if (!user) {
      return { ok: false, error: "Sign in before rotating your stream key." };
    }

    if (user.sessionKind === "preview") {
      setUser((prev) => (prev ? { ...prev, streamKey: generateLocalStreamKey() } : prev));
      return { ok: true };
    }

    try {
      const response = await authorizedFetch("/api/v1/channels/me/stream-key/rotate", {
        method: "POST",
      });
      if (!response.ok) {
        const errInfo = await parseErrorResponse(response);
        return { ok: false, error: errInfo.message };
      }
      const raw: unknown = await response.json();
      const parsed = z
        .object({
          streamKey: z.string().min(1),
          message: z.string().optional(),
        })
        .safeParse(raw);
      if (!parsed.success) {
        return { ok: false, error: "Unexpected stream key response." };
      }

      setUser((prev) => (prev ? { ...prev, streamKey: parsed.data.streamKey } : prev));
      return {
        ok: true,
        message:
          parsed.data.message ??
          "Rotated stream key. Update your encoder before starting a new stream.",
      };
    } catch {
      return { ok: false, error: "Could not reach Core API to rotate stream key." };
    }
  }, [authorizedFetch, user]);

  const changePassword = useCallback(
    async (patch: {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    }): Promise<AuthAttemptResult> => {
      const validation = PasswordUpdateValidationSchema.safeParse(patch);
      if (!validation.success) {
        const formatted = extractZodFieldErrors(validation.error);
        return { ok: false, error: formatted.message, fieldErrors: formatted.fieldErrors };
      }

      if (!user) {
        return { ok: false, error: "Sign in before updating your password." };
      }

      if (user.sessionKind === "preview") {
        return { ok: true };
      }

      try {
        const response = await authorizedFetch("/api/v1/auth/password", {
          method: "PATCH",
          body: JSON.stringify(validation.data),
        });
        if (!response.ok) {
          const errInfo = await parseErrorResponse(response);
          return {
            ok: false,
            error: errInfo.message,
            ...(errInfo.fieldErrors ? { fieldErrors: errInfo.fieldErrors } : {}),
          };
        }
        const raw: unknown = await response.json().catch(() => null);
        const parsed = z
          .object({
            ok: z.boolean().optional(),
            message: z.string().optional(),
          })
          .safeParse(raw);
        return {
          ok: true,
          message:
            parsed.success && parsed.data.message
              ? parsed.data.message
              : "Password updated.",
        };
      } catch {
        return { ok: false, error: "Could not reach Core API to update your password." };
      }
    },
    [authorizedFetch, user],
  );

  const banUser = useCallback(
    async (
      username: string,
      reason = "Moderator action in chat",
      channelSlug?: string,
    ): Promise<AuthAttemptResult> => {
      const validation = BanUserValidationSchema.safeParse({ username, reason });
      if (!validation.success) {
        const formatted = extractZodFieldErrors(validation.error);
        return { ok: false, error: formatted.message, fieldErrors: formatted.fieldErrors };
      }

      const clean = validation.data.username;
      if (!user) {
        return { ok: false, error: "Sign in to manage channel bans." };
      }
      if (clean.toLowerCase() === user.username.toLowerCase()) {
        return { ok: false, error: "You cannot ban your own channel account." };
      }

      if (user.sessionKind === "preview") {
        setUser((prev) => {
          if (!prev || prev.bannedUsers.some((b) => b.username === clean)) {
            return prev;
          }
          return {
            ...prev,
            bannedUsers: [
              { username: clean, bannedAtLabel: "Just now", reason: validation.data.reason || reason },
              ...prev.bannedUsers,
            ],
          };
        });
        return { ok: true };
      }

      try {
        const response = await authorizedFetch("/api/v1/moderation/bans", {
          method: "POST",
          body: JSON.stringify({
            username: clean,
            reason: validation.data.reason || reason,
            channelSlug,
          }),
        });
        if (!response.ok) {
          const errInfo = await parseErrorResponse(response);
          return {
            ok: false,
            error: errInfo.message,
            ...(errInfo.fieldErrors ? { fieldErrors: errInfo.fieldErrors } : {}),
          };
        }

        const raw: unknown = await response.json();
        const parsed = z
          .object({
            ban: z.object({
              username: z.string(),
              reason: z.string(),
              bannedAt: z.string(),
            }),
            message: z.string().optional(),
          })
          .safeParse(raw);
        if (!parsed.success) {
          return { ok: false, error: "Unexpected response from moderation service." };
        }

        setUser((prev) => {
          if (!prev) return prev;
          const remaining = prev.bannedUsers.filter(
            (b) => b.username.toLowerCase() !== parsed.data.ban.username.toLowerCase(),
          );
          return {
            ...prev,
            bannedUsers: [
              {
                username: parsed.data.ban.username,
                reason: parsed.data.ban.reason,
                bannedAtLabel: formatBanTimestamp(parsed.data.ban.bannedAt),
              },
              ...remaining,
            ],
          };
        });
        return {
          ok: true,
          message:
            parsed.data.message ??
            `@${parsed.data.ban.username} added to channel ban list.`,
        };
      } catch {
        return { ok: false, error: "Could not reach Core API to ban user." };
      }
    },
    [authorizedFetch, user],
  );

  const unbanUser = useCallback(
    async (username: string, channelSlug?: string): Promise<AuthAttemptResult> => {
      const clean = username.trim().replace(/^@/, "");
      if (!user) {
        return { ok: false, error: "Sign in to manage channel bans." };
      }

      if (user.sessionKind === "preview") {
        setUser((prev) =>
          prev
            ? {
                ...prev,
                bannedUsers: prev.bannedUsers.filter((b) => b.username !== clean),
              }
            : prev,
        );
        return { ok: true };
      }

      try {
        const url = channelSlug
          ? `/api/v1/moderation/bans/${encodeURIComponent(clean)}?channelSlug=${encodeURIComponent(channelSlug)}`
          : `/api/v1/moderation/bans/${encodeURIComponent(clean)}`;
        const response = await authorizedFetch(url, { method: "DELETE" });
        if (!response.ok) {
          const errInfo = await parseErrorResponse(response);
          return { ok: false, error: errInfo.message };
        }

        const raw: unknown = await response.json().catch(() => null);
        const parsed = z
          .object({
            ok: z.boolean().optional(),
            message: z.string().optional(),
          })
          .safeParse(raw);

        setUser((prev) =>
          prev
            ? {
                ...prev,
                bannedUsers: prev.bannedUsers.filter(
                  (b) => b.username.toLowerCase() !== clean.toLowerCase(),
                ),
              }
            : prev,
        );
        return {
          ok: true,
          message:
            parsed.success && parsed.data.message
              ? parsed.data.message
              : `Unbanned @${clean}.`,
        };
      } catch {
        return { ok: false, error: "Could not reach Core API to unban user." };
      }
    },
    [authorizedFetch, user],
  );

  const listModerators = useCallback(
    async (
      channelSlug?: string,
    ): Promise<{ ok: boolean; moderators?: ChannelModeratorView[]; error?: string }> => {
      if (!user) return { ok: false, error: "Sign in required." };
      if (user.sessionKind === "preview") {
        return {
          ok: true,
          moderators: [
            {
              id: "cmod_preview",
              userId: "u_preview_mod",
              username: "sarah_j",
              displayName: "Sarah Jenkins",
              avatarUrl: null,
              assignedAt: new Date(Date.now() - 86400000).toISOString(),
            },
          ],
        };
      }
      try {
        const cleanSlug = channelSlug ? channelSlug.trim().replace(/^@/, "") : "";
        const url = cleanSlug
          ? `/api/v1/moderation/moderators?channelSlug=${encodeURIComponent(cleanSlug)}`
          : "/api/v1/moderation/moderators";
        const response = await authorizedFetch(url);
        if (!response.ok) {
          const errInfo = await parseErrorResponse(response);
          return { ok: false, error: errInfo.message };
        }
        const data = (await response.json()) as { moderators: ChannelModeratorView[] };
        return { ok: true, moderators: data.moderators || [] };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Failed to load moderators." };
      }
    },
    [user, authorizedFetch],
  );

  const addModerator = useCallback(
    async (username: string, channelSlug?: string): Promise<AuthAttemptResult> => {
      const clean = username.trim().replace(/^@/, "");
      if (!user) return { ok: false, error: "Sign in required." };
      if (user.sessionKind === "preview") {
        return { ok: true, message: `@${clean} is now a channel moderator.` };
      }
      try {
        const bodyPayload: Record<string, string> = { username: clean };
        if (channelSlug) {
          bodyPayload.channelSlug = channelSlug.trim().replace(/^@/, "");
        }
        const response = await authorizedFetch("/api/v1/moderation/moderators", {
          method: "POST",
          body: JSON.stringify(bodyPayload),
        });
        if (!response.ok) {
          const errInfo = await parseErrorResponse(response);
          return { ok: false, error: errInfo.message };
        }
        const data = (await response.json()) as { message?: string };
        return { ok: true, message: data.message ?? `@${clean} is now a channel moderator.` };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Failed to add moderator." };
      }
    },
    [user, authorizedFetch],
  );

  const removeModerator = useCallback(
    async (username: string, channelSlug?: string): Promise<AuthAttemptResult> => {
      const clean = username.trim().replace(/^@/, "");
      if (!user) return { ok: false, error: "Sign in required." };
      if (user.sessionKind === "preview") {
        return { ok: true, message: `Removed moderator privileges for @${clean}.` };
      }
      try {
        const query = channelSlug ? `?channelSlug=${encodeURIComponent(channelSlug.trim().replace(/^@/, ""))}` : "";
        const response = await authorizedFetch(
          `/api/v1/moderation/moderators/${encodeURIComponent(clean)}${query}`,
          { method: "DELETE" },
        );
        if (!response.ok) {
          const errInfo = await parseErrorResponse(response);
          return { ok: false, error: errInfo.message };
        }
        const data = (await response.json()) as { message?: string };
        return { ok: true, message: data.message ?? `Removed moderator privileges for @${clean}.` };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Failed to remove moderator." };
      }
    },
    [user, authorizedFetch],
  );

  const listSilences = useCallback(
    async (
      channelSlug?: string,
    ): Promise<{ ok: boolean; silences?: ChannelMuteView[]; error?: string }> => {
      if (!user) return { ok: false, error: "Sign in required." };
      if (user.sessionKind === "preview") {
        return {
          ok: true,
          silences: [
            {
              id: "mute_preview",
              userId: "u_preview_mute",
              username: "troll_user",
              displayName: "Troll User",
              avatarUrl: null,
              reason: "Spam in chat",
              expiresAt: new Date(Date.now() + 3600000).toISOString(),
              mutedAt: new Date(Date.now() - 1800000).toISOString(),
            },
          ],
        };
      }
      try {
        const cleanSlug = channelSlug ? channelSlug.trim().replace(/^@/, "") : "";
        const url = cleanSlug
          ? `/api/v1/moderation/silences?channelSlug=${encodeURIComponent(cleanSlug)}`
          : "/api/v1/moderation/silences";
        const response = await authorizedFetch(url);
        if (!response.ok) {
          const errInfo = await parseErrorResponse(response);
          return { ok: false, error: errInfo.message };
        }
        const data = (await response.json()) as { silences: ChannelMuteView[] };
        return { ok: true, silences: data.silences || [] };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Failed to load silenced users." };
      }
    },
    [user, authorizedFetch],
  );

  const silenceUser = useCallback(
    async (
      username: string,
      duration = "1h",
      reason = "Channel moderation action",
      channelSlug?: string,
    ): Promise<AuthAttemptResult> => {
      const clean = username.trim().replace(/^@/, "");
      if (!user) return { ok: false, error: "Sign in required." };
      if (user.sessionKind === "preview") {
        return { ok: true, message: `@${clean} has been silenced.` };
      }
      try {
        const cleanSlug = channelSlug ? channelSlug.trim().replace(/^@/, "") : undefined;
        const response = await authorizedFetch("/api/v1/moderation/silences", {
          method: "POST",
          body: JSON.stringify({ username: clean, duration, reason, channelSlug: cleanSlug }),
        });
        if (!response.ok) {
          const errInfo = await parseErrorResponse(response);
          return { ok: false, error: errInfo.message };
        }
        const data = (await response.json()) as { message?: string };
        return { ok: true, message: data.message ?? `@${clean} has been silenced.` };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Failed to silence user." };
      }
    },
    [user, authorizedFetch],
  );

  const unsilenceUser = useCallback(
    async (username: string, channelSlug?: string): Promise<AuthAttemptResult> => {
      const clean = username.trim().replace(/^@/, "");
      if (!user) return { ok: false, error: "Sign in required." };
      if (user.sessionKind === "preview") {
        return { ok: true, message: `Unsilenced @${clean}.` };
      }
      try {
        const cleanSlug = channelSlug ? channelSlug.trim().replace(/^@/, "") : "";
        const url = cleanSlug
          ? `/api/v1/moderation/silences/${encodeURIComponent(clean)}?channelSlug=${encodeURIComponent(cleanSlug)}`
          : `/api/v1/moderation/silences/${encodeURIComponent(clean)}`;
        const response = await authorizedFetch(url, {
          method: "DELETE",
        });
        if (!response.ok) {
          const errInfo = await parseErrorResponse(response);
          return { ok: false, error: errInfo.message };
        }
        const data = (await response.json()) as { message?: string };
        return { ok: true, message: data.message ?? `Unsilenced @${clean}.` };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Failed to unsilence user." };
      }
    },
    [user, authorizedFetch],
  );

  const sendWarning = useCallback(
    async (username: string, reason: string, channelSlug?: string): Promise<AuthAttemptResult> => {
      const clean = username.trim().replace(/^@/, "");
      if (!user) return { ok: false, error: "Sign in required." };
      if (user.sessionKind === "preview") {
        return { ok: true, message: `Warning sent to @${clean}.` };
      }
      try {
        const cleanSlug = channelSlug ? channelSlug.trim().replace(/^@/, "") : undefined;
        const response = await authorizedFetch("/api/v1/moderation/warnings", {
          method: "POST",
          body: JSON.stringify({ username: clean, reason, channelSlug: cleanSlug }),
        });
        if (!response.ok) {
          const errInfo = await parseErrorResponse(response);
          return { ok: false, error: errInfo.message };
        }
        const data = (await response.json()) as { message?: string };
        return { ok: true, message: data.message ?? `Warning sent to @${clean}.` };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Failed to send warning." };
      }
    },
    [user, authorizedFetch],
  );

  const toggleFollow = useCallback(
    async (slug: string): Promise<AuthAttemptResult> => {
      if (!user) {
        return { ok: false, error: "Sign in to follow channels." };
      }

      const cleanSlug = slug.trim().replace(/^@/, "");
      const currentlyFollowing = user.followedSlugs.includes(cleanSlug);

      if (user.sessionKind === "preview") {
        setUser((prev) => {
          if (!prev) return prev;
          const exists = prev.followedSlugs.includes(cleanSlug);
          return {
            ...prev,
            followedSlugs: exists
              ? prev.followedSlugs.filter((item) => item !== cleanSlug)
              : [...prev.followedSlugs, cleanSlug],
          };
        });
        return { ok: true };
      }

      try {
        const response = await authorizedFetch(
          `/api/v1/users/me/follows/${encodeURIComponent(cleanSlug)}`,
          { method: currentlyFollowing ? "DELETE" : "POST" },
        );
        if (!response.ok) {
          const errInfo = await parseErrorResponse(response);
          return { ok: false, error: errInfo.message };
        }
        const raw: unknown = await response.json();
        const parsed = z
          .object({
            followedSlugs: z.array(z.string()),
            message: z.string().optional(),
          })
          .safeParse(raw);
        if (!parsed.success) {
          return { ok: false, error: "Unexpected response from follow service." };
        }
        setUser((prev) => (prev ? { ...prev, followedSlugs: parsed.data.followedSlugs } : prev));
        return {
          ok: true,
          message:
            parsed.data.message ??
            (currentlyFollowing ? `Unfollowed @${cleanSlug}.` : `Followed @${cleanSlug}.`),
        };
      } catch {
        return { ok: false, error: "Could not reach Core API to update follow status." };
      }
    },
    [authorizedFetch, user],
  );

  const markChannelBanned = useCallback((slug: string) => {
    const clean = slug.trim().replace(/^@/, "").toLowerCase();
    if (!clean) return;
    setUser((prev) => {
      if (!prev) return prev;
      if (prev.bannedFromSlugs.some((s) => s.trim().replace(/^@/, "").toLowerCase() === clean)) {
        return prev;
      }
      return {
        ...prev,
        bannedFromSlugs: [...prev.bannedFromSlugs, clean],
        followedSlugs: prev.followedSlugs.filter(
          (s) => s.trim().replace(/^@/, "").toLowerCase() !== clean,
        ),
      };
    });
  }, []);

  const clearChannelBanned = useCallback((slug: string) => {
    const clean = slug.trim().replace(/^@/, "").toLowerCase();
    if (!clean) return;
    setUser((prev) => {
      if (!prev) return prev;
      const exists = prev.bannedFromSlugs.some(
        (s) => s.trim().replace(/^@/, "").toLowerCase() === clean,
      );
      if (!exists) return prev;
      return {
        ...prev,
        bannedFromSlugs: prev.bannedFromSlugs.filter(
          (s) => s.trim().replace(/^@/, "").toLowerCase() !== clean,
        ),
      };
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isSubmitting,
      isHydrating,
      signIn,
      signUp,
      enterPreviewSession,
      signOut,
      updateTheme,
      updateProfile,
      uploadAvatar,
      removeAvatar,
      updateChannelSettings,
      rotateStreamKey,
      changePassword,
      unbanUser,
      banUser,
      listModerators,
      addModerator,
      removeModerator,
      listSilences,
      silenceUser,
      unsilenceUser,
      sendWarning,
      toggleFollow,
      markChannelBanned,
      clearChannelBanned,
    }),
    [
      user,
      isSubmitting,
      isHydrating,
      signIn,
      signUp,
      enterPreviewSession,
      signOut,
      updateTheme,
      updateProfile,
      uploadAvatar,
      removeAvatar,
      updateChannelSettings,
      rotateStreamKey,
      changePassword,
      unbanUser,
      banUser,
      listModerators,
      addModerator,
      removeModerator,
      listSilences,
      silenceUser,
      unsilenceUser,
      sendWarning,
      toggleFollow,
      markChannelBanned,
      clearChannelBanned,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
