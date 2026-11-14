import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acceptCookiesConsent,
  acceptCookiesWithTheme,
  clearPreferenceCookies,
  clearRememberMeCookie,
  COOKIE_CONSENT_ACCEPTED,
  COOKIE_CONSENT_NAME,
  COOKIE_DISCLOSURES,
  COOKIE_REMEMBER_NAME,
  COOKIE_THEME_NAME,
  getRememberMeCookie,
  getStoredThemePreference,
  hasAcceptedCookies,
  parseCookies,
  persistThemeCookie,
  serializeRememberSession,
  setCookie,
  setRememberMeCookie,
  type RememberedSessionData,
} from "./cookies";

describe("cookies preference helpers and disclosures", () => {
  beforeEach(() => {
    clearPreferenceCookies();
  });

  afterEach(() => {
    clearPreferenceCookies();
  });

  it("discloses essential consent and remember session cookies in allow cookies policy", () => {
    expect(COOKIE_DISCLOSURES).toHaveLength(2);
    const consentDisclosure = COOKIE_DISCLOSURES.find((d) => d.name === COOKIE_CONSENT_NAME);
    const rememberDisclosure = COOKIE_DISCLOSURES.find((d) => d.name === COOKIE_REMEMBER_NAME);

    expect(consentDisclosure).toBeDefined();
    expect(consentDisclosure?.category).toBe("Essential");
    expect(consentDisclosure?.retention).toContain("365 days");

    expect(rememberDisclosure).toBeDefined();
    expect(rememberDisclosure?.category).toBe("Essential");
    expect(rememberDisclosure?.retention).toContain("30 days");
    expect(rememberDisclosure?.purpose).toMatch(/signed-in session|remember me/i);
  });

  it("parses cookie strings safely including URL-encoded values", () => {
    expect(parseCookies("")).toEqual({});
    expect(
      parseCookies(`${COOKIE_CONSENT_NAME}=${COOKIE_CONSENT_ACCEPTED}; ${COOKIE_THEME_NAME}=dark`),
    ).toEqual({
      [COOKIE_CONSENT_NAME]: COOKIE_CONSENT_ACCEPTED,
      [COOKIE_THEME_NAME]: "dark",
    });
  });

  it("defaults to light mode and ensures theme is not persisted to cookies", () => {
    expect(hasAcceptedCookies()).toBe(false);
    expect(getStoredThemePreference()).toBe("light");

    const persisted = persistThemeCookie("dark");
    expect(persisted).toBe(false);
    expect(parseCookies(document.cookie)[COOKIE_THEME_NAME]).toBeUndefined();

    // Even if a stale theme cookie existed without consent, default stays light.
    setCookie(COOKIE_THEME_NAME, "dark");
    expect(getStoredThemePreference(document.cookie)).toBe("light");
  });

  it("stores consent cookie once accepted without storing device-wide theme cookies", () => {
    acceptCookiesConsent();
    expect(hasAcceptedCookies()).toBe(true);
    expect(parseCookies(document.cookie)[COOKIE_CONSENT_NAME]).toBe(COOKIE_CONSENT_ACCEPTED);
    expect(parseCookies(document.cookie)[COOKIE_THEME_NAME]).toBeUndefined();

    const persisted = persistThemeCookie("dark");
    expect(persisted).toBe(false);
    expect(parseCookies(document.cookie)[COOKIE_THEME_NAME]).toBeUndefined();
  });

  it("persists and retrieves remember-me session cookie cleanly", () => {
    const mockSession: RememberedSessionData = {
      user: {
        id: "usr_persisted_1",
        username: "dev_persisted",
        displayName: "Dev Persisted",
        email: "dev@velostream.dev",
        bio: "Streaming Rust and WebRTC",
        avatarUrl: "https://res.cloudinary.com/velostream/avatar.png",
        role: "USER",
        theme: "dark",
        channelTitle: "Dev's Channel",
        channelCategory: "Programming",
        streamKey: "sk_live_123456",
        slowMode: false,
        sessionKind: "backend",
      },
      accessToken: "access_token_123",
      refreshToken: "refresh_token_456",
      rememberSession: true,
    };

    setRememberMeCookie(mockSession);
    const retrieved = getRememberMeCookie();
    expect(retrieved).not.toBeNull();
    expect(retrieved?.user.id).toBe("usr_persisted_1");
    expect(retrieved?.user.username).toBe("dev_persisted");
    expect(retrieved?.user.theme).toBe("dark");
    expect(retrieved?.accessToken).toBe("access_token_123");
    expect(retrieved?.refreshToken).toBe("refresh_token_456");

    clearRememberMeCookie();
    expect(getRememberMeCookie()).toBeNull();
  });

  it("strips oversized data URLs from remember cookie to prevent exceeding 4KB cookie limit", () => {
    const giantAvatar = `data:image/png;base64,${"A".repeat(1500)}`;
    const mockSession: RememberedSessionData = {
      user: {
        id: "usr_giant",
        username: "giant_user",
        displayName: "Giant User",
        email: "giant@velostream.dev",
        avatarUrl: giantAvatar,
        sessionKind: "preview",
      },
      accessToken: null,
      refreshToken: null,
      rememberSession: true,
    };

    const serialized = serializeRememberSession(mockSession);
    const parsed = JSON.parse(serialized) as RememberedSessionData;
    expect(parsed.user.avatarUrl).toBeNull();
    expect(serialized.length).toBeLessThan(1000);
  });

  it("clears consent, theme, and remember-me cookies on reset", () => {
    acceptCookiesWithTheme("light");
    setCookie(COOKIE_THEME_NAME, "dark");
    setRememberMeCookie({
      user: {
        id: "usr_reset",
        username: "reset_user",
        displayName: "Reset User",
        email: "reset@velostream.dev",
      },
      accessToken: "token",
      refreshToken: "refresh",
      rememberSession: true,
    });
    expect(hasAcceptedCookies()).toBe(true);
    expect(getRememberMeCookie()).not.toBeNull();

    clearPreferenceCookies();
    expect(hasAcceptedCookies()).toBe(false);
    expect(parseCookies(document.cookie)[COOKIE_THEME_NAME]).toBeUndefined();
    expect(parseCookies(document.cookie)[COOKIE_REMEMBER_NAME]).toBeUndefined();
    expect(getRememberMeCookie()).toBeNull();
    expect(getStoredThemePreference()).toBe("light");
  });
});
