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
  acceptCookiesWithTheme,
  clearPreferenceCookies,
  getStoredThemePreference,
  hasAcceptedCookies,
  persistThemeCookie,
  type ThemeMode,
} from "./cookies";

interface ThemeContextValue {
  theme: ThemeMode;
  cookiesAccepted: boolean;
  isCookieDialogOpen: boolean;
  setTheme: (next: ThemeMode) => void;
  toggleTheme: () => void;
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
  const [cookiesAccepted, setCookiesAccepted] = useState<boolean>(() => hasAcceptedCookies());
  const [theme, setThemeState] = useState<ThemeMode>(() => getStoredThemePreference());
  const [isCookieDialogOpen, setIsCookieDialogOpen] = useState<boolean>(
    () => !hasAcceptedCookies(),
  );

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const setTheme = useCallback(
    (next: ThemeMode) => {
      setThemeState(next);
      if (cookiesAccepted) {
        persistThemeCookie(next);
      }
    },
    [cookiesAccepted],
  );

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemeMode = prev === "light" ? "dark" : "light";
      if (cookiesAccepted) {
        persistThemeCookie(next);
      }
      return next;
    });
  }, [cookiesAccepted]);

  const acceptCookies = useCallback(() => {
    acceptCookiesWithTheme(theme);
    setCookiesAccepted(true);
    setIsCookieDialogOpen(false);
  }, [theme]);

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
    setThemeState("light");
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

