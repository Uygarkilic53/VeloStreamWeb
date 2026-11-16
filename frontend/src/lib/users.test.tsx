import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../app/App";
import { acceptCookiesWithTheme, clearPreferenceCookies } from "./cookies";
import { fetchLiveChannelsApi } from "./users";

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

  emitMessage(payload: unknown) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(payload) });
    }
  }

  emitOpen() {
    if (this.onopen) {
      this.onopen();
    }
  }
}

describe("Index searchbar, user search (online & offline), and health removal", () => {
  beforeEach(() => {
    clearPreferenceCookies();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
    acceptCookiesWithTheme("light");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    clearPreferenceCookies();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
    MockLiveWebSocket.instances = [];
  });

  it("removes Core API / Real-Time Engine / Standby health status UI and does not probe /healthz", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ query: "", users: [], relatedLiveUsers: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    render(<App />);

    expect(screen.queryByText(/core api/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/real-time engine/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/services ready/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/standby/i)).not.toBeInTheDocument();
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("/healthz"))).toBe(false);
  });

  it("searches offline and online users by username or displayName, renders avatar/username/name, and shows related live users underneath", async () => {
    const offlineAvatar = "https://res.cloudinary.com/demo/image/upload/v1/VeloStream/avatar/uygar.png";

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/v1/users/search")) {
        return new Response(
          JSON.stringify({
            query: "uygar",
            users: [
              {
                id: "usr_offline_1",
                username: "uygar_dev",
                displayName: "Uygar Yilmaz",
                avatarUrl: offlineAvatar,
                bio: "Offline systems streamer",
                isLive: false,
                channelTitle: "Go & Rust notes",
                channelCategory: "Programming",
              },
            ],
            relatedLiveUsers: [
              {
                id: "usr_live_1",
                username: "mira_codes",
                displayName: "Mira Vance",
                avatarUrl: null,
                bio: "Rust graphics engine",
                isLive: true,
                channelTitle: "Building a custom 2D lighting engine in Rust from scratch",
                channelCategory: "Programming",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<App />);

    const searchInput = screen.getByRole("searchbox", {
      name: /search users, streams, or categories/i,
    });
    await user.type(searchInput, "uygar");

    const dropdown = await screen.findByRole("region", { name: /search results/i });
    await waitFor(() => {
      expect(within(dropdown).getByText("Uygar Yilmaz")).toBeInTheDocument();
    });

    expect(within(dropdown).getByText("@uygar_dev")).toBeInTheDocument();
    expect(within(dropdown).getByText("Offline")).toBeInTheDocument();
    const avatarImg = within(dropdown).getByAltText(/uygar yilmaz profile avatar/i);
    expect(avatarImg).toHaveAttribute("src", offlineAvatar);

    // Related live users appear directly underneath Users
    expect(within(dropdown).getByText("Related live users")).toBeInTheDocument();
    expect(within(dropdown).getByText("Mira Vance")).toBeInTheDocument();
    expect(within(dropdown).getByText("@mira_codes")).toBeInTheDocument();

    // Index page also renders Users + Related live users sections
    const usersSection = screen.getByRole("region", { name: /matching users/i });
    expect(within(usersSection).getByText("Uygar Yilmaz")).toBeInTheDocument();
    const relatedSection = screen.getByRole("region", { name: /related live users/i });
    expect(within(relatedSection).getByText(/@mira_codes/i)).toBeInTheDocument();

    // Clicking the offline user opens their channel stage (showing OFFLINE, not another creator)
    await user.click(within(dropdown).getByRole("button", { name: /uygar yilmaz/i }));
    expect(await screen.findByText("OFFLINE")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /go & rust notes/i })).toBeInTheDocument();
  });

  it("excludes banned creators from search and displays banned screen when navigating to their channel, then synchronizes unban in real-time", async () => {
    const originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = MockLiveWebSocket as unknown as typeof WebSocket;

    let isAlexBanned = true;

    // Store authenticated session for a user who was banned by alex_dev
    window.localStorage.setItem(
      "velostream_auth_session",
      JSON.stringify({
        accessToken: "mock_jwt_token",
        refreshToken: "mock_refresh_token",
        rememberSession: true,
      }),
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/api/v1/auth/me")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "usr_banned_1",
              username: "banned_viewer",
              displayName: "Banned Viewer",
              email: "viewer@velostream.dev",
              bannedUsers: [],
              bannedFromSlugs: ["alex_dev"],
              followedSlugs: [],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/api/v1/users/search")) {
        // Backend search endpoint returns empty list because creator banned this user
        return new Response(
          JSON.stringify({
            query: "alex",
            users: [],
            relatedLiveUsers: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/api/v1/users/alex_dev")) {
        if (isAlexBanned) {
          return new Response(
            JSON.stringify({
              error: "USER_BANNED",
              message: "You have been banned by @alex_dev.",
              banned: true,
              bannedBy: "alex_dev",
              reason: "Chat rule violation",
            }),
            { status: 403, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            user: {
              id: "usr_alex",
              username: "alex_dev",
              displayName: "Alex Dev",
              avatarUrl: null,
              bio: "Streaming dev",
              isLive: true,
              channelTitle: "Fullstack Live",
              channelCategory: "Programming",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/api/v1/channels/live")) {
        return new Response(JSON.stringify({ channels: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const user = userEvent.setup();
      render(<App />);

      // Wait for user hydration
      await waitFor(() => {
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/v1/auth/me"))).toBe(true);
      });

      // Search for alex - since alex_dev is in bannedFromSlugs, alex_dev must NOT be shown
      const searchInput = screen.getByRole("searchbox", {
        name: /search users, streams, or categories/i,
      });
      await user.type(searchInput, "alex");

      // Neither the dropdown nor matching users shows alex_dev
      await waitFor(() => {
        expect(screen.queryByText("@alex_dev")).not.toBeInTheDocument();
      });

      // Directly navigating to alex_dev channel page
      window.history.pushState(null, "", "/?page=watch&channel=alex_dev");
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      // Expect the banned view: "Channel unavailable", "@alex_dev has banned you", and reason if present
      expect(await screen.findByRole("heading", { name: /channel unavailable/i })).toBeInTheDocument();
      expect(screen.getByText(/@alex_dev has banned you from viewing their channel\./i)).toBeInTheDocument();
      expect(await screen.findByText(/chat rule violation/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/live stream chat/i)).not.toBeInTheDocument();

      // Now simulate real-time unban via WebSocket without page refresh
      isAlexBanned = false;
      const liveWs = MockLiveWebSocket.instances.find((ws) => ws.url.includes("/ws/live"));
      expect(liveWs).toBeDefined();

      await act(async () => {
        liveWs!.emitMessage({
          type: "moderation.unbanned",
          payload: {
            channelId: "chn_alex",
            channelSlug: "alex_dev",
            userId: "usr_banned_1",
            username: "banned_viewer",
          },
        });
      });

      // The banned view should immediately vanish and channel view should render in real time
      await waitFor(() => {
        expect(screen.queryByRole("heading", { name: /channel unavailable/i })).not.toBeInTheDocument();
      });
      expect(await screen.findByText("Fullstack Live")).toBeInTheDocument();
      expect(await screen.findByText(/your ban is vanished/i)).toBeInTheDocument();
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  });

  it("renders empty state on both sidebar and homepage when live channels API returns empty array", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/v1/channels/live")) {
        return new Response(JSON.stringify({ channels: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    // Sidebar empty state
    await waitFor(() => {
      expect(screen.getByText("No live channels")).toBeInTheDocument();
    });
    expect(screen.getByText("Nobody is broadcasting right now.")).toBeInTheDocument();
    expect(screen.getByText("0 on air")).toBeInTheDocument();

    // Homepage empty state
    expect(
      screen.getByRole("heading", { name: /no live broadcasts right now/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/nobody is currently streaming on velostream/i),
    ).toBeInTheDocument();

    // Initial dummy streams should NOT be rendered
    expect(
      screen.queryByText(/building a custom 2d lighting engine in rust from scratch/i),
    ).not.toBeInTheDocument();
  });

  it("falls back to initial dummy streams when live channels endpoint fails or is offline", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("Network offline");
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    // Dummy channels fallback preserved
    await waitFor(() => {
      expect(
        screen.getAllByText(/building a custom 2d lighting engine in rust from scratch/i).length,
      ).toBeGreaterThan(0);
    });
    expect(screen.queryByText("No live channels")).not.toBeInTheDocument();
    expect(screen.queryByText(/nobody is currently streaming on velostream/i)).not.toBeInTheDocument();
  });

  it("dynamically transitions between empty state and live channels via real-time WebSocket events", async () => {
    const originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = MockLiveWebSocket as unknown as typeof WebSocket;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/v1/channels/live")) {
        return new Response(JSON.stringify({ channels: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/v1/users/sarah_live")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "usr_sarah",
              username: "sarah_live",
              displayName: "Sarah Live",
              avatarUrl: null,
              bio: "Streaming live graphics shaders",
              isLive: true,
              channelTitle: "Live GLSL Shader Art",
              channelCategory: "Creative",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      render(<App />);

      // Initially empty state
      await waitFor(() => {
        expect(screen.getByText("No live channels")).toBeInTheDocument();
      });
      expect(
        screen.getByRole("heading", { name: /no live broadcasts right now/i }),
      ).toBeInTheDocument();

      // Find the created WebSocket
      expect(MockLiveWebSocket.instances.length).toBeGreaterThan(0);
      const ws = MockLiveWebSocket.instances[0]!;

      // Simulate a streamer going live in real time
      await act(async () => {
        ws.emitMessage({
          type: "stream.status",
          payload: {
            channelId: "sarah_live",
            status: "live",
          },
        });
      });

      // Streamer should appear in Sidebar and Homepage; empty state disappears
      await waitFor(() => {
        expect(screen.getAllByText("@sarah_live").length).toBeGreaterThan(0);
      });
      expect(screen.getAllByText("Live GLSL Shader Art").length).toBeGreaterThan(0);
      expect(screen.getByText("1 on air")).toBeInTheDocument();
      expect(screen.queryByText("No live channels")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: /no live broadcasts right now/i }),
      ).not.toBeInTheDocument();

      // Simulate the streamer ending their broadcast
      await act(async () => {
        ws.emitMessage({
          type: "stream.status",
          payload: {
            channelId: "sarah_live",
            status: "offline",
          },
        });
      });

      // Empty state should be restored
      await waitFor(() => {
        expect(screen.getByText("No live channels")).toBeInTheDocument();
      });
      expect(
        screen.getByRole("heading", { name: /no live broadcasts right now/i }),
      ).toBeInTheDocument();
      expect(screen.getByText("0 on air")).toBeInTheDocument();
      expect(screen.queryAllByText("Live GLSL Shader Art")).toHaveLength(0);
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  });

  it("preserves real-time WebSocket events that arrive before HTTP fetchLiveChannelsApi snapshot resolves", async () => {
    const originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = MockLiveWebSocket as unknown as typeof WebSocket;

    let resolveLiveChannels: (resp: Response) => void;
    const liveChannelsPromise = new Promise<Response>((resolve) => {
      resolveLiveChannels = resolve;
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/v1/channels/live")) {
        return liveChannelsPromise;
      }
      if (url.includes("/api/v1/users/fast_streamer")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "usr_fast",
              username: "fast_streamer",
              displayName: "Fast Streamer",
              avatarUrl: null,
              bio: "Fast WebRTC streamer",
              isLive: true,
              channelTitle: "Fast Stream",
              channelCategory: "Programming",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      render(<App />);

      await waitFor(() => {
        expect(MockLiveWebSocket.instances.length).toBeGreaterThan(0);
      });
      const ws = MockLiveWebSocket.instances[0]!;
      await waitFor(() => {
        expect(ws.onmessage).not.toBeNull();
      });

      // WebSocket event arrives while HTTP fetch is still in-flight
      await act(async () => {
        ws.emitMessage({
          type: "stream.status",
          payload: {
            channelId: "fast_streamer",
            status: "live",
          },
        });
      });

      await waitFor(() => {
        expect(screen.getAllByText("@fast_streamer").length).toBeGreaterThan(0);
      });

      // Now the slower HTTP snapshot resolves with empty list (from before fast_streamer went live)
      await act(async () => {
        resolveLiveChannels!(
          new Response(JSON.stringify({ channels: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      });

      // fast_streamer MUST NOT be wiped out by the stale empty HTTP snapshot
      await waitFor(() => {
        expect(screen.getAllByText("@fast_streamer").length).toBeGreaterThan(0);
      });
      expect(screen.queryByText("No live channels")).not.toBeInTheDocument();
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  });

  it("forwards authorization bearer token when fetching live channels for authenticated user", async () => {
    let capturedAuthHeader: string | null = null;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      capturedAuthHeader = headers.Authorization ?? null;
      return new Response(JSON.stringify({ channels: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchLiveChannelsApi(undefined, "test_access_token_123");
    expect(result).toEqual([]);
    expect(capturedAuthHeader).toBe("Bearer test_access_token_123");
  });
});
