import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, parseRouteFromLocation } from "./App";
import { acceptCookiesWithTheme, clearPreferenceCookies, clearRememberMeCookie, setRememberMeCookie } from "../lib/cookies";

class MockLiveWebSocket {
  static instances: MockLiveWebSocket[] = [];
  url: string;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  onopen: (() => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockLiveWebSocket.instances.push(this);
  }
}

describe("App routing - parseRouteFromLocation", () => {
  const originalLocation = window.location.href;

  afterEach(() => {
    window.history.replaceState(null, "", originalLocation);
  });

  it("parses direct user slug path /userslug as watch route", () => {
    window.history.replaceState(null, "", "/testerslug");
    expect(parseRouteFromLocation()).toEqual({
      page: "watch",
      slug: "testerslug",
    });
  });

  it("parses /@userslug path as watch route", () => {
    window.history.replaceState(null, "", "/@alice_streamer");
    expect(parseRouteFromLocation()).toEqual({
      page: "watch",
      slug: "alice_streamer",
    });
  });

  it("parses /watch/userslug path as watch route", () => {
    window.history.replaceState(null, "", "/watch/bob_coder");
    expect(parseRouteFromLocation()).toEqual({
      page: "watch",
      slug: "bob_coder",
    });
  });

  it("parses /?channel=userslug query as watch route", () => {
    window.history.replaceState(null, "", "/?channel=mira_codes");
    expect(parseRouteFromLocation()).toEqual({
      page: "watch",
      slug: "mira_codes",
    });
  });

  it("parses /?page=watch&channel=userslug query as watch route", () => {
    window.history.replaceState(null, "", "/?page=watch&channel=kaelen_fps");
    expect(parseRouteFromLocation()).toEqual({
      page: "watch",
      slug: "kaelen_fps",
    });
  });

  it("parses /profile route", () => {
    window.history.replaceState(null, "", "/profile");
    expect(parseRouteFromLocation()).toEqual({ page: "profile" });
  });

  it("parses /studio route", () => {
    window.history.replaceState(null, "", "/studio");
    expect(parseRouteFromLocation()).toEqual({ page: "studio" });
  });

  it("parses /following route", () => {
    window.history.replaceState(null, "", "/following");
    expect(parseRouteFromLocation()).toEqual({ page: "following" });
  });

  it("parses root / as home route", () => {
    window.history.replaceState(null, "", "/");
    expect(parseRouteFromLocation()).toEqual({ page: "home" });
  });
});

describe("App routing guards and redirects", () => {
  const originalLocation = window.location.href;
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    clearPreferenceCookies();
    clearRememberMeCookie();
    window.localStorage.clear();
    window.sessionStorage.clear();
    acceptCookiesWithTheme("light");
    MockLiveWebSocket.instances = [];
    globalThis.WebSocket = MockLiveWebSocket as unknown as typeof WebSocket;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ channels: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    clearPreferenceCookies();
    clearRememberMeCookie();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", originalLocation);
    globalThis.WebSocket = originalWebSocket;
  });

  it("immediately redirects unsigned in user from ?page=studio to ?page=signin without showing 'Loading studio...' spinner", () => {
    window.history.replaceState(null, "", "/?page=studio");

    render(<App />);

    // Redirects immediately on mount via replaceState
    expect(window.location.search).toBe("?page=signin");
    expect(screen.queryByText(/loading studio\.\.\./i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /sign in to velostream/i })).toBeInTheDocument();
  });

  it("does not store 'studio' as last valid non-auth route for unsigned in users", () => {
    window.history.replaceState(null, "", "/?page=studio");

    render(<App />);

    expect(window.location.search).toBe("?page=signin");
    // velostream_last_route must NOT be studio
    const stored = window.sessionStorage.getItem("velostream_last_route");
    if (stored) {
      expect(JSON.parse(stored).page).not.toBe("studio");
    }
  });

  it("immediately redirects signed in user from ?page=signin without showing 'Checking session...' spinner", () => {
    window.sessionStorage.setItem(
      "velostream_last_route",
      JSON.stringify({ page: "watch", slug: "mira_codes" }),
    );

    setRememberMeCookie({
      user: {
        id: "usr_active_member",
        username: "mira_fan",
        displayName: "Mira Fan",
        email: "fan@velostream.dev",
        bio: "Watching streams",
        streamKey: "sk_fan_123",
        avatarUrl: null,
        channelTitle: "Fan channel",
        channelCategory: "Programming",
        theme: "light",
        sessionKind: "backend",
        bannedFromSlugs: [],
        followedSlugs: [],
        slowMode: false,
      },
      accessToken: "token_abc",
      refreshToken: "refresh_abc",
      rememberSession: true,
    });

    window.history.replaceState(null, "", "/?page=signin");

    render(<App />);

    // Redirects synchronously without flashing checking session spinner
    expect(window.location.search).toBe("?page=watch&channel=mira_codes");
    expect(screen.queryByText(/checking session\.\.\./i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /sign in to velostream/i })).not.toBeInTheDocument();
  });

  it("handles browser back popstate targeting ?page=signin for signed in users by maintaining valid route", async () => {
    window.sessionStorage.setItem(
      "velostream_last_route",
      JSON.stringify({ page: "watch", slug: "mira_codes" }),
    );

    setRememberMeCookie({
      user: {
        id: "usr_active_member",
        username: "mira_fan",
        displayName: "Mira Fan",
        email: "fan@velostream.dev",
        bio: "Watching streams",
        streamKey: "sk_fan_123",
        avatarUrl: null,
        channelTitle: "Fan channel",
        channelCategory: "Programming",
        theme: "light",
        sessionKind: "backend",
        bannedFromSlugs: [],
        followedSlugs: [],
        slowMode: false,
      },
      accessToken: "token_abc",
      refreshToken: "refresh_abc",
      rememberSession: true,
    });

    window.history.replaceState(null, "", "/?page=watch&channel=mira_codes");
    render(<App />);

    // Simulate browser back button to ?page=signin
    window.history.replaceState(null, "", "/?page=signin");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await waitFor(() => {
      expect(window.location.search).toBe("?page=watch&channel=mira_codes");
    });
    expect(screen.queryByRole("heading", { name: /sign in to velostream/i })).not.toBeInTheDocument();
  });

  it("handles browser back popstate targeting ?page=studio for unsigned users by redirecting to signin", async () => {
    window.history.replaceState(null, "", "/");
    render(<App />);

    // Simulate browser back button to ?page=studio
    window.history.replaceState(null, "", "/?page=studio");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await waitFor(() => {
      expect(window.location.search).toBe("?page=signin");
    });
    expect(screen.getByRole("heading", { name: /sign in to velostream/i })).toBeInTheDocument();
  });

  it("redirects unsigned in user from ?page=studio to ?page=signin using replaceState", async () => {
    window.history.replaceState(null, "", "/?page=studio");

    render(<App />);

    await waitFor(() => {
      expect(window.location.search).toBe("?page=signin");
    });

    // Sign in form is visible
    expect(screen.getByRole("heading", { name: /sign in to velostream/i })).toBeInTheDocument();
  });

  it("redirects unsigned in user when clicking 'Go live' button in Navbar to ?page=signin", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/");

    render(<App />);

    // Click 'Go live' in Navbar
    const goLiveBtn = screen.getByRole("button", { name: /go live/i });
    await user.click(goLiveBtn);

    await waitFor(() => {
      expect(window.location.search).toBe("?page=signin");
    });
    expect(screen.getByRole("heading", { name: /sign in to velostream/i })).toBeInTheDocument();
  });

  it("redirects signed in user visiting ?page=signin back to previous page without them noticing", async () => {
    // Simulate user was previously watching mira_codes
    window.sessionStorage.setItem(
      "velostream_last_route",
      JSON.stringify({ page: "watch", slug: "mira_codes" }),
    );

    setRememberMeCookie({
      user: {
        id: "usr_active_member",
        username: "mira_fan",
        displayName: "Mira Fan",
        email: "fan@velostream.dev",
        bio: "Watching streams",
        streamKey: "sk_fan_123",
        avatarUrl: null,
        channelTitle: "Fan channel",
        channelCategory: "Programming",
        theme: "light",
        sessionKind: "backend",
        bannedFromSlugs: [],
        followedSlugs: [],
        slowMode: false,
      },
      accessToken: "token_abc",
      refreshToken: "refresh_abc",
      rememberSession: true,
    });

    window.history.replaceState(null, "", "/?page=signin");

    render(<App />);

    await waitFor(() => {
      expect(window.location.search).toBe("?page=watch&channel=mira_codes");
    });

    // AuthPage heading should NOT be in the document
    expect(screen.queryByRole("heading", { name: /sign in to velostream/i })).not.toBeInTheDocument();
  });

  it("redirects signed in user visiting ?page=signup to home route when no prior route exists", async () => {
    setRememberMeCookie({
      user: {
        id: "usr_alice",
        username: "alice_creator",
        displayName: "Alice Creator",
        email: "alice@velostream.dev",
        bio: "Creator bio",
        streamKey: "sk_alice_123",
        avatarUrl: null,
        channelTitle: "Alice Live",
        channelCategory: "Programming",
        theme: "light",
        sessionKind: "backend",
        bannedFromSlugs: [],
        followedSlugs: [],
        slowMode: false,
      },
      accessToken: "token_alice",
      refreshToken: "refresh_alice",
      rememberSession: true,
    });

    window.history.replaceState(null, "", "/?page=signup");

    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/");
      expect(window.location.search).toBe("");
    });

    expect(screen.queryByRole("heading", { name: /create your creator account/i })).not.toBeInTheDocument();
  });

  it("redirects signed in user visiting ?page=signup back to prior route when prior route is set", async () => {
    window.sessionStorage.setItem(
      "velostream_last_route",
      JSON.stringify({ page: "following" }),
    );

    setRememberMeCookie({
      user: {
        id: "usr_alice",
        username: "alice_creator",
        displayName: "Alice Creator",
        email: "alice@velostream.dev",
        bio: "Creator bio",
        streamKey: "sk_alice_123",
        avatarUrl: null,
        channelTitle: "Alice Live",
        channelCategory: "Programming",
        theme: "light",
        sessionKind: "backend",
        bannedFromSlugs: [],
        followedSlugs: [],
        slowMode: false,
      },
      accessToken: "token_alice",
      refreshToken: "refresh_alice",
      rememberSession: true,
    });

    window.history.replaceState(null, "", "/?page=signup");

    render(<App />);

    await waitFor(() => {
      expect(window.location.search).toBe("?page=following");
    });

    expect(screen.queryByRole("heading", { name: /create your creator account/i })).not.toBeInTheDocument();
  });

  it("redirects unsigned in user from path /studio to ?page=signin", async () => {
    window.history.replaceState(null, "", "/studio");

    render(<App />);

    await waitFor(() => {
      expect(window.location.search).toBe("?page=signin");
    });
    expect(screen.getByRole("heading", { name: /sign in to velostream/i })).toBeInTheDocument();
  });
});

describe("App - Watch page channel not found handling", () => {
  const originalLocation = window.location.href;
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    clearPreferenceCookies();
    clearRememberMeCookie();
    window.localStorage.clear();
    window.sessionStorage.clear();
    acceptCookiesWithTheme("light");
    MockLiveWebSocket.instances = [];
    globalThis.WebSocket = MockLiveWebSocket as unknown as typeof WebSocket;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/v1/channels/live")) {
          return new Response(JSON.stringify({ channels: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        // Channel lookup for nonexistent channel returns 404
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    clearPreferenceCookies();
    clearRememberMeCookie();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", originalLocation);
    globalThis.WebSocket = originalWebSocket;
  });

  it("shows channel not found view instead of indefinitely running loading spinner for ?page=watch&channel=mira_codes", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/?page=watch&channel=mira_codes");

    render(<App />);

    // Wait for channel lookup to complete and show Channel not found
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /channel not found/i })).toBeInTheDocument();
    });

    // Loading spinner is NOT running
    expect(screen.queryByText(/loading channel\.\.\./i)).not.toBeInTheDocument();

    // Shows channel param and react icon
    expect(screen.getByText(/there is no channel for @mira_codes/i)).toBeInTheDocument();
    expect(screen.getByTestId("channel-not-found-icon")).toBeInTheDocument();

    // Clicking 'Browse other channels' navigates to home
    const browseBtn = screen.getByRole("button", { name: /browse other channels/i });
    await user.click(browseBtn);

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });
  });

  it("handles ?channel=@unknown_creator by normalizing leading @ in channel param display", async () => {
    window.history.replaceState(null, "", "/?channel=@unknown_creator");

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /channel not found/i })).toBeInTheDocument();
    });

    expect(screen.queryByText(/loading channel\.\.\./i)).not.toBeInTheDocument();
    expect(screen.getByText(/there is no channel for @unknown_creator/i)).toBeInTheDocument();
    expect(screen.getByTestId("channel-not-found-icon")).toBeInTheDocument();
  });

  it("handles empty or isolated @ in channel param without infinite spinner", async () => {
    window.history.replaceState(null, "", "/?page=watch&channel=@");

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /channel not found/i })).toBeInTheDocument();
    });

    expect(screen.queryByText(/loading channel\.\.\./i)).not.toBeInTheDocument();
    expect(screen.getByText(/no channel specified/i)).toBeInTheDocument();
    expect(screen.getByTestId("channel-not-found-icon")).toBeInTheDocument();
  });

  it("resolves existing live stream with leading @ in channel param immediately", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/v1/channels/live")) {
          return new Response(
            JSON.stringify({
              channels: [
                {
                  id: "usr_alex",
                  username: "alex_dev",
                  displayName: "Alex Dev",
                  channelTitle: "Building Rust",
                  channelCategory: "Programming",
                  isLive: true,
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/api/v1/users/alex_dev")) {
          return new Response(
            JSON.stringify({
              user: {
                id: "usr_alex",
                username: "alex_dev",
                displayName: "Alex Dev",
                channelTitle: "Building Rust",
                channelCategory: "Programming",
                isLive: true,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    window.history.replaceState(null, "", "/?page=watch&channel=@alex_dev");

    render(<App />);

    // Should render the watch page for alex_dev and NOT channel not found
    await waitFor(() => {
      expect(screen.getAllByText(/alex_dev/i).length).toBeGreaterThan(0);
    });

    expect(screen.queryByRole("heading", { name: /channel not found/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/loading channel\.\.\./i)).not.toBeInTheDocument();
  });
});
