import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ToastContainer } from "react-toastify";
import {
  acceptCookiesConsent,
  clearPreferenceCookies,
  deleteCookie,
  hasAcceptedCookies,
  COOKIE_THEME_NAME,
  type ThemeMode,
} from "./cookies";
import { AuthContext, type AuthAttemptResult } from "./auth";

interface ThemeContextValue {
  theme: ThemeMode;
  cookiesAccepted: boolean;
  isCookieDialogOpen: boolean;
  setTheme: (next: ThemeMode) => Promise<AuthAttemptResult>;
  toggleTheme: () => Promise<AuthAttemptResult>;
  acceptCookies: () => void;
  openCookieSettings: () => void;
  closeCookieSettings: () => void;
  revokeCookies: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyThemeToDocument(theme: ThemeMode): void {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const auth = useContext(AuthContext);
  const [cookiesAccepted, setCookiesAccepted] = useState<boolean>(() => hasAcceptedCookies());
  const [isCookieDialogOpen, setIsCookieDialogOpen] = useState<boolean>(
    () => !hasAcceptedCookies(),
  );

  // Appearance is a user preference setting when signed in; unauthenticated visitors default to "light".
  const theme: ThemeMode = auth?.user?.theme ?? "light";

  // Clean up any legacy device-wide theme cookies so they do not linger.
  useEffect(() => {
    deleteCookie(COOKIE_THEME_NAME);
  }, []);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const setTheme = useCallback(
    async (next: ThemeMode): Promise<AuthAttemptResult> => {
      if (!auth) {
        applyThemeToDocument(next);
        return { ok: true };
      }
      return auth.updateTheme(next);
    },
    [auth],
  );

  const toggleTheme = useCallback(async (): Promise<AuthAttemptResult> => {
    const next: ThemeMode = theme === "light" ? "dark" : "light";
    return setTheme(next);
  }, [setTheme, theme]);

  const acceptCookies = useCallback(() => {
    acceptCookiesConsent();
    setCookiesAccepted(true);
    setIsCookieDialogOpen(false);
  }, []);

  const openCookieSettings = useCallback(() => {
    setIsCookieDialogOpen(true);
  }, []);

  const closeCookieSettings = useCallback(() => {
    if (cookiesAccepted) {
      setIsCookieDialogOpen(false);
    }
  }, [cookiesAccepted]);

  const revokeCookies = useCallback(() => {
    clearPreferenceCookies();
    setCookiesAccepted(false);
    setIsCookieDialogOpen(true);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      cookiesAccepted,
      isCookieDialogOpen,
      setTheme,
      toggleTheme,
      acceptCookies,
      openCookieSettings,
      closeCookieSettings,
      revokeCookies,
    }),
    [
      theme,
      cookiesAccepted,
      isCookieDialogOpen,
      setTheme,
      toggleTheme,
      acceptCookies,
      openCookieSettings,
      closeCookieSettings,
      revokeCookies,
    ],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
      <ToastContainer
        theme={theme}
        position="bottom-right"
        autoClose={3500}
        newestOnTop
        closeOnClick
        pauseOnHover
        role="status"
      />
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}

export type { ThemeMode } from "./cookies";
