import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth";
import {
  clearPreferenceCookies,
  clearRememberMeCookie,
  getRememberMeCookie,
  setRememberMeCookie,
} from "./cookies";

function AuthTestConsumer() {
  const { user, isHydrating, signIn, enterPreviewSession, signOut } = useAuth();

  if (isHydrating) {
    return <div data-testid="hydrating">Hydrating...</div>;
  }

  return (
    <div>
      <div data-testid="auth-status">{user ? `Signed in as @${user.username}` : "Signed out"}</div>
      {user && <div data-testid="user-theme">{user.theme}</div>}
      <button
        type="button"
        data-testid="signin-btn"
        onClick={() => {
          void signIn({
            identifier: "server_offline_tester",
            password: "StrongPass123",
            rememberSession: true,
          });
        }}
      >
        Sign in with remember me
      </button>
      <button
        type="button"
        data-testid="signin-no-remember-btn"
        onClick={() => {
          void signIn({
            identifier: "ephemeral_user",
            password: "StrongPass123",
            rememberSession: false,
          });
        }}
      >
        Sign in without remember me
      </button>
      <button
        type="button"
        data-testid="preview-btn"
        onClick={() => {
          enterPreviewSession({ username: "preview_hero", rememberSession: true });
        }}
      >
        Preview with remember me
      </button>
      <button
        type="button"
        data-testid="signout-btn"
        onClick={() => {
          void signOut();
        }}
      >
        Sign out
      </button>
    </div>
  );
}

describe("Authentication with Remember-Me Cookie & Server Shutdown Resilience", () => {
  beforeEach(() => {
    clearPreferenceCookies();
    clearRememberMeCookie();
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    clearPreferenceCookies();
    clearRememberMeCookie();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("restores user session from cookie when server is shut down (offline network error)", async () => {
    // Simulate server being shut down: any fetch throws a network connection refused error
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.reject(new TypeError("Failed to fetch (ERR_CONNECTION_REFUSED - server shut down)")),
    );

    // Seed the remember me cookie as would happen when user previously clicked 'Remember me'
    setRememberMeCookie({
      user: {
        id: "usr_persisted_server_down",
        username: "resilient_streamer",
        displayName: "Resilient Streamer",
        email: "streamer@velostream.dev",
        bio: "Streaming even when server restarts",
        avatarUrl: null,
        role: "USER",
        theme: "dark",
        channelTitle: "Resilient Stream",
        channelCategory: "Programming",
        streamKey: "sk_live_resilient",
        slowMode: false,
        sessionKind: "backend",
      },
      accessToken: "persisted_jwt_token",
      refreshToken: "persisted_refresh_token",
      rememberSession: true,
    });

    render(
      <AuthProvider>
        <AuthTestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("hydrating")).toBeNull();
    });

    // The user MUST remain signed in even though server is shut down!
    expect(screen.getByTestId("auth-status").textContent).toBe("Signed in as @resilient_streamer");
    expect(screen.getByTestId("user-theme").textContent).toBe("dark");
  });

  it("creates a 30-day cookie when signing in with remember me, keeping user signed in on next mount", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/login")) {
        return new Response(
          JSON.stringify({
            accessToken: "mock_jwt_access",
            refreshToken: "mock_refresh_token",
            expiresIn: 900,
            tokenType: "Bearer",
            user: {
              id: "usr_mock_1",
              username: "cookie_streamer",
              displayName: "Cookie Streamer",
              email: "cookie@velostream.dev",
              bio: "",
              avatarUrl: null,
              role: "USER",
              theme: "light",
              channel: {
                id: "ch_1",
                slug: "cookie_streamer",
                title: "Live Cookie Broadcast",
                category: "Programming",
                streamKey: "sk_live_cookie",
                slowMode: false,
                isLive: false,
              },
              bannedUsers: [],
              bannedFromSlugs: [],
              followedSlugs: [],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 });
    });

    const { unmount } = render(
      <AuthProvider>
        <AuthTestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("hydrating")).toBeNull();
    });

    expect(screen.getByTestId("auth-status").textContent).toBe("Signed out");
    expect(getRememberMeCookie()).toBeNull();

    // Click Sign In with remember me
    await act(async () => {
      screen.getByTestId("signin-btn").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-status").textContent).toBe("Signed in as @cookie_streamer");
    });

    // Cookie must now be populated
    const cookieData = getRememberMeCookie();
    expect(cookieData).not.toBeNull();
    expect(cookieData?.user.username).toBe("cookie_streamer");
    expect(cookieData?.rememberSession).toBe(true);

    unmount();

    // Now simulate server shutdown on next visit
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.reject(new TypeError("Failed to fetch (ERR_CONNECTION_REFUSED)")),
    );

    render(
      <AuthProvider>
        <AuthTestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("hydrating")).toBeNull();
    });

    // User is automatically signed in from the cookie despite server being shut down!
    expect(screen.getByTestId("auth-status").textContent).toBe("Signed in as @cookie_streamer");
  });

  it("deletes the remember cookie when user explicitly signs out", async () => {
    setRememberMeCookie({
      user: {
        id: "usr_to_signout",
        username: "signout_user",
        displayName: "Sign Out User",
        email: "signout@velostream.dev",
        sessionKind: "backend",
      },
      accessToken: "token_1",
      refreshToken: "token_2",
      rememberSession: true,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/logout")) {
        return new Response(JSON.stringify({ ok: true, message: "Logged out." }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 });
    });

    render(
      <AuthProvider>
        <AuthTestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("hydrating")).toBeNull();
    });

    expect(screen.getByTestId("auth-status").textContent).toBe("Signed in as @signout_user");
    expect(getRememberMeCookie()).not.toBeNull();

    await act(async () => {
      screen.getByTestId("signout-btn").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-status").textContent).toBe("Signed out");
    });

    expect(getRememberMeCookie()).toBeNull();
  });
});
