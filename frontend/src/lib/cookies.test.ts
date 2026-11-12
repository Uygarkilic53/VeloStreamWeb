import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acceptCookiesWithTheme,
  clearPreferenceCookies,
  COOKIE_CONSENT_ACCEPTED,
  COOKIE_CONSENT_NAME,
  COOKIE_THEME_NAME,
  getStoredThemePreference,
  hasAcceptedCookies,
  parseCookies,
  persistThemeCookie,
  setCookie,
} from "./cookies";

describe("cookies preference helpers", () => {
  beforeEach(() => {
    clearPreferenceCookies();
  });

  afterEach(() => {
    clearPreferenceCookies();
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

  it("defaults to light mode and blocks persisting theme until cookies are accepted", () => {
    expect(hasAcceptedCookies()).toBe(false);
    expect(getStoredThemePreference()).toBe("light");

    const persisted = persistThemeCookie("dark");
    expect(persisted).toBe(false);
    expect(parseCookies(document.cookie)[COOKIE_THEME_NAME]).toBeUndefined();

    // Even if a stale theme cookie existed without consent, default stays light.
    setCookie(COOKIE_THEME_NAME, "dark");
    expect(getStoredThemePreference(document.cookie)).toBe("light");
  });

  it("stores theme cookie once consent is accepted and remembers dark or light across checks", () => {
    acceptCookiesWithTheme("light");
    expect(hasAcceptedCookies()).toBe(true);
    expect(getStoredThemePreference()).toBe("light");

    const updatedDark = persistThemeCookie("dark");
    expect(updatedDark).toBe(true);
    expect(hasAcceptedCookies()).toBe(true);
    expect(getStoredThemePreference()).toBe("dark");

    const updatedLight = persistThemeCookie("light");
    expect(updatedLight).toBe(true);
    expect(getStoredThemePreference()).toBe("light");
  });

  it("clears both consent and theme cookies on reset", () => {
    acceptCookiesWithTheme("dark");
    expect(getStoredThemePreference()).toBe("dark");

    clearPreferenceCookies();
    expect(hasAcceptedCookies()).toBe(false);
    expect(getStoredThemePreference()).toBe("light");
  });
});

