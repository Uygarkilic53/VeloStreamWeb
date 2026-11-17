export const COOKIE_CONSENT_NAME = "velostream_cookie_consent";
export const COOKIE_THEME_NAME = "velostream_theme";
export const COOKIE_REMEMBER_NAME = "velostream_remember_session";
export const COOKIE_CONSENT_ACCEPTED = "accepted";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
export const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

export type ThemeMode = "light" | "dark";

export interface CookieDisclosureItem {
  name: string;
  purpose: string;
  retention: string;
  category: "Essential" | "Preference";
}

export const COOKIE_DISCLOSURES: readonly CookieDisclosureItem[] = [
  {
    name: COOKIE_CONSENT_NAME,
    purpose: "Stores your decision to accept VeloStream cookies so you are not asked again on return visits.",
    retention: "365 days (SameSite=Lax)",
    category: "Essential",
  },
  {
    name: COOKIE_REMEMBER_NAME,
    purpose:
      "Stores your signed-in session on this device when you select 'Remember me', keeping you signed in even if the server restarts or is temporarily offline.",
    retention: "30 days (SameSite=Lax)",
    category: "Essential",
  },
];

export function parseCookies(cookieString: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieString) {
    return result;
  }

  for (const part of cookieString.split(";")) {
    const eqIndex = part.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }
    const rawKey = part.slice(0, eqIndex).trim();
    if (!rawKey) {
      continue;
    }
    const rawValue = part.slice(eqIndex + 1).trim();
    try {
      result[rawKey] = decodeURIComponent(rawValue);
    } catch {
      result[rawKey] = rawValue;
    }
  }

  return result;
}

function buildCookieString(name: string, value: string, maxAgeSeconds: number): string {
  const secureFlag =
    typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secureFlag}`;
}

export function setCookie(name: string, value: string, maxAgeSeconds = ONE_YEAR_SECONDS): void {
  if (typeof document === "undefined") {
    return;
  }
  document.cookie = buildCookieString(name, value, maxAgeSeconds);
}

export function deleteCookie(name: string): void {
  if (typeof document === "undefined") {
    return;
  }
  document.cookie = buildCookieString(name, "", 0);
}

export function hasAcceptedCookies(cookieSource?: string): boolean {
  const source =
    cookieSource ?? (typeof document !== "undefined" ? document.cookie : "");
  const cookies = parseCookies(source);
  return cookies[COOKIE_CONSENT_NAME] === COOKIE_CONSENT_ACCEPTED;
}

export function getStoredThemePreference(_cookieSource?: string): ThemeMode {
  return "light";
}

export function persistThemeCookie(_theme: ThemeMode): boolean {
  deleteCookie(COOKIE_THEME_NAME);
  return false;
}

export function acceptCookiesConsent(): void {
  setCookie(COOKIE_CONSENT_NAME, COOKIE_CONSENT_ACCEPTED);
  deleteCookie(COOKIE_THEME_NAME);
}

export function acceptCookiesWithTheme(_theme?: ThemeMode): void {
  acceptCookiesConsent();
}

export interface RememberedSessionUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  bio?: string | undefined;
  avatarUrl?: string | null | undefined;
  role?: string | undefined;
  theme?: "light" | "dark" | undefined;
  channelTitle?: string | undefined;
  channelCategory?: string | undefined;
  streamKey?: string | undefined;
  slowMode?: boolean | undefined;
  bannedUsers?: { username: string; bannedAtLabel: string; reason: string }[] | undefined;
  bannedFromSlugs?: string[] | undefined;
  followedSlugs?: string[] | undefined;
  accessToken?: string | null | undefined;
  sessionKind?: "backend" | "preview" | undefined;
}

export interface RememberedSessionData {
  user: RememberedSessionUser;
  accessToken: string | null;
  refreshToken: string | null;
  rememberSession: boolean;
}

export function serializeRememberSession(data: RememberedSessionData): string {
  const avatarUrl =
    data.user.avatarUrl && data.user.avatarUrl.length > 500 ? null : (data.user.avatarUrl ?? null);
  const bio =
    data.user.bio && data.user.bio.length > 300
      ? data.user.bio.slice(0, 300)
      : (data.user.bio ?? "");

  const safeUser: RememberedSessionUser = {
    ...data.user,
    // Omit large base64 data URIs from cookie to avoid exceeding 4KB browser limit
    avatarUrl,
    bio,
  };
  return JSON.stringify({
    ...data,
    user: safeUser,
  });
}

export function setRememberMeCookie(
  data: RememberedSessionData,
  maxAgeSeconds = THIRTY_DAYS_SECONDS,
): void {
  if (typeof document === "undefined") {
    return;
  }
  try {
    const serialized = serializeRememberSession(data);
    setCookie(COOKIE_REMEMBER_NAME, serialized, maxAgeSeconds);
  } catch {
    // Ignore serialization or storage restriction errors
  }
}

export function getRememberMeCookie(cookieSource?: string): RememberedSessionData | null {
  const source =
    cookieSource ?? (typeof document !== "undefined" ? document.cookie : "");
  const cookies = parseCookies(source);
  const raw = cookies[COOKIE_REMEMBER_NAME];
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<RememberedSessionData>;
    if (parsed && parsed.user && typeof parsed.user.username === "string" && parsed.user.id) {
      return parsed as RememberedSessionData;
    }
  } catch {
    return null;
  }
  return null;
}

export function clearRememberMeCookie(): void {
  deleteCookie(COOKIE_REMEMBER_NAME);
}

export function clearPreferenceCookies(): void {
  deleteCookie(COOKIE_CONSENT_NAME);
  deleteCookie(COOKIE_THEME_NAME);
  deleteCookie(COOKIE_REMEMBER_NAME);
}

export function hasStoredSession(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const rememberedCookie = getRememberMeCookie();
    if (rememberedCookie?.user) {
      return true;
    }
    const localTokens = window.localStorage.getItem("velostream_auth_session");
    if (localTokens) {
      const parsed = JSON.parse(localTokens);
      if (parsed?.accessToken) {
        return true;
      }
    }
    const sessionTokens = window.sessionStorage.getItem("velostream_auth_session");
    if (sessionTokens) {
      const parsed = JSON.parse(sessionTokens);
      if (parsed?.accessToken) {
        return true;
      }
    }
    const previewRaw =
      window.localStorage.getItem("velostream_preview_user") ||
      window.sessionStorage.getItem("velostream_preview_user");
    if (previewRaw) {
      const previewObj = JSON.parse(previewRaw);
      if (previewObj && previewObj.sessionKind === "preview") {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}


