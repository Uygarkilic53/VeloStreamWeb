export const COOKIE_CONSENT_NAME = "velostream_cookie_consent";
export const COOKIE_THEME_NAME = "velostream_theme";
export const COOKIE_CONSENT_ACCEPTED = "accepted";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

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
    name: COOKIE_THEME_NAME,
    purpose:
      "Remembers your Light Mode or Dark Mode choice automatically across visits, even when you are not signed in.",
    retention: "365 days (SameSite=Lax)",
    category: "Preference",
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

export function getStoredThemePreference(cookieSource?: string): ThemeMode {
  const source =
    cookieSource ?? (typeof document !== "undefined" ? document.cookie : "");
  const cookies = parseCookies(source);
  if (cookies[COOKIE_CONSENT_NAME] !== COOKIE_CONSENT_ACCEPTED) {
    return "light";
  }
  return cookies[COOKIE_THEME_NAME] === "dark" ? "dark" : "light";
}

export function persistThemeCookie(theme: ThemeMode): boolean {
  if (!hasAcceptedCookies()) {
    return false;
  }
  setCookie(COOKIE_THEME_NAME, theme);
  return true;
}

export function acceptCookiesWithTheme(theme: ThemeMode): void {
  setCookie(COOKIE_CONSENT_NAME, COOKIE_CONSENT_ACCEPTED);
  setCookie(COOKIE_THEME_NAME, theme);
}

export function clearPreferenceCookies(): void {
  deleteCookie(COOKIE_CONSENT_NAME);
  deleteCookie(COOKIE_THEME_NAME);
}

