import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  acceptCookiesWithTheme,
  clearPreferenceCookies,
  clearRememberMeCookie,
  setRememberMeCookie,
} from "../lib/cookies";
import { publishWhipStream, type WhipSession } from "../lib/whip";

vi.mock("../lib/whip", () => ({
  publishWhipStream: vi.fn(),
  WhipError: class WhipError extends Error {
    constructor(message: string, public readonly statusCode?: number) {
      super(message);
      this.name = "WhipError";
    }
  },
}));

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

describe("Studio broadcasting leave guard (AppLeaveStudioGuard)", () => {
  const originalLocation = window.location.href;
  const originalWebSocket = globalThis.WebSocket;

  const mockBackendUser = {
    id: "usr_broadcaster_1",
    username: "broadcaster_bob",
    displayName: "Bob The Streamer",
    email: "bob@velostream.dev",
    bio: "Live coding every day",
    avatarUrl: null,
    theme: "light" as const,
    channel: {
      id: "ch_bob",
      title: "Building Low-Latency WebRTC",
      category: "Programming" as const,
      streamKey: "sk_live_bob123",
      isLive: false,
      slowMode: false,
    },
    bannedFromSlugs: [],
    followedSlugs: [],
  };

  beforeEach(() => {
    clearPreferenceCookies();
    clearRememberMeCookie();
    window.localStorage.clear();
    window.sessionStorage.clear();
    acceptCookiesWithTheme("light");
    MockLiveWebSocket.instances = [];
    globalThis.WebSocket = MockLiveWebSocket as unknown as typeof WebSocket;

    // Provide mocked mediaDevices
    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [
            { kind: "video", stop: vi.fn(), addEventListener: vi.fn(), enabled: true },
            { kind: "audio", stop: vi.fn(), addEventListener: vi.fn(), enabled: true },
          ],
          getVideoTracks: () => [
            { kind: "video", stop: vi.fn(), addEventListener: vi.fn(), enabled: true },
          ],
          getAudioTracks: () => [
            { kind: "audio", stop: vi.fn(), addEventListener: vi.fn(), enabled: true },
          ],
          removeTrack: vi.fn(),
        }),
      },
    });

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
        if (url.includes("/api/v1/auth/me")) {
          return new Response(JSON.stringify({ user: mockBackendUser }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("/api/v1/users/channel/live")) {
          return new Response(JSON.stringify({ ok: true, isLive: false }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
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

  function loginBroadcaster() {
    const previewUser = {
      id: "usr_broadcaster_bob",
      username: "broadcaster_bob",
      displayName: "Bob The Streamer",
      email: "bob@velostream.dev",
      bio: "Live coding every day",
      avatarUrl: null,
      role: "USER",
      theme: "light" as const,
      channelTitle: "Building Low-Latency WebRTC",
      channelCategory: "Programming" as const,
      streamKey: "sk_live_bob123",
      slowMode: false,
      bannedUsers: [],
      bannedFromSlugs: [],
      followedSlugs: [],
      accessToken: null,
      sessionKind: "preview" as const,
    };
    window.localStorage.setItem("velostream_preview_user", JSON.stringify(previewUser));
    setRememberMeCookie({
      user: previewUser,
      accessToken: null,
      refreshToken: null,
      rememberSession: true,
    });
  }

  function loginAuthenticatedBroadcaster() {
    const authUser = {
      id: "usr_broadcaster_bob",
      username: "broadcaster_bob",
      displayName: "Bob The Streamer",
      email: "bob@velostream.dev",
      bio: "Live coding every day",
      avatarUrl: null,
      role: "USER",
      theme: "light" as const,
      channelTitle: "Building Low-Latency WebRTC",
      channelCategory: "Programming" as const,
      streamKey: "sk_live_bob123",
      slowMode: false,
      bannedUsers: [],
      bannedFromSlugs: [],
      followedSlugs: [],
      accessToken: "mock_jwt_access_token",
      sessionKind: "backend" as const,
    };
    setRememberMeCookie({
      user: authUser,
      accessToken: "mock_jwt_access_token",
      refreshToken: "mock_refresh_token",
      rememberSession: true,
    });
  }

  it("navigates immediately when clicking other links while NOT broadcasting", async () => {
    loginBroadcaster();
    window.history.replaceState(null, "", "/?page=studio");

    const user = userEvent.setup();
    render(<App />);

    // Studio page is mounted
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /broadcast studio/i })).toBeInTheDocument();
    });

    // Clicking 'Browse' in Navbar navigates immediately without modal
    const browseBtn = screen.getByRole("button", { name: /^browse$/i });
    await user.click(browseBtn);

    expect(screen.queryByTestId("leave-studio-modal")).not.toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("asks broadcaster when clicking other links while currently live, stays in studio on cancel", async () => {
    loginBroadcaster();
    window.history.replaceState(null, "", "/?page=studio");

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /broadcast studio/i })).toBeInTheDocument();
    });

    // Simulate going live via WebSocket stream.status frame from OBS
    const wsInstance = MockLiveWebSocket.instances.find((ws) => ws.url.includes("/ws/live"));
    expect(wsInstance).toBeDefined();

    act(() => {
      wsInstance?.onmessage?.({
        data: JSON.stringify({
          type: "stream.status",
          payload: { channelId: "broadcaster_bob", status: "live" },
        }),
      });
    });

    // End broadcast button indicates we are live
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /end broadcast/i })).toBeInTheDocument();
    });

    // Broadcaster clicks "Browse" in navbar
    const browseBtn = screen.getByRole("button", { name: /^browse$/i });
    await user.click(browseBtn);

    // Confirmation dialog appears asking if they proceed to leave studio streaming will be ended
    expect(screen.getByTestId("leave-studio-modal")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /leave studio and end broadcast\?/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/if you proceed to leave studio, your live streaming will be ended and you will be redirected to browse\./i),
    ).toBeInTheDocument();

    // Click 'Stay in studio'
    const stayBtn = screen.getByRole("button", { name: /stay in studio/i });
    await user.click(stayBtn);

    // Modal is dismissed, user remains in studio and broadcast is still live
    expect(screen.queryByTestId("leave-studio-modal")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /end broadcast/i })).toBeInTheDocument();
    expect(window.location.search).toBe("?page=studio");
  });

  it("ends streaming and navigates to target link when broadcaster confirms leave", async () => {
    loginBroadcaster();
    window.history.replaceState(null, "", "/?page=studio");

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /broadcast studio/i })).toBeInTheDocument();
    });

    // Simulate going live via WebSocket
    const wsInstance = MockLiveWebSocket.instances.find((ws) => ws.url.includes("/ws/live"));
    act(() => {
      wsInstance?.onmessage?.({
        data: JSON.stringify({
          type: "stream.status",
          payload: { channelId: "broadcaster_bob", status: "live" },
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /end broadcast/i })).toBeInTheDocument();
    });

    // Broadcaster clicks "Following" tab in navbar
    const followingBtn = screen.getByRole("button", { name: /following/i });
    await user.click(followingBtn);

    // Modal is displayed
    expect(screen.getByTestId("leave-studio-modal")).toBeInTheDocument();
    expect(
      screen.getByText(/if you proceed to leave studio, your live streaming will be ended and you will be redirected to following\./i),
    ).toBeInTheDocument();

    // Click 'End stream & leave'
    const confirmBtn = screen.getByRole("button", { name: /end stream & leave/i });
    await user.click(confirmBtn);

    // Modal closes and user is redirected to following
    await waitFor(() => {
      expect(screen.queryByTestId("leave-studio-modal")).not.toBeInTheDocument();
      expect(window.location.search).toBe("?page=following");
    });
  });

  it("intercepts 'Directory' link inside studio page while broadcasting", async () => {
    loginBroadcaster();
    window.history.replaceState(null, "", "/?page=studio");

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /broadcast studio/i })).toBeInTheDocument();
    });

    // Simulate going live
    const wsInstance = MockLiveWebSocket.instances.find((ws) => ws.url.includes("/ws/live"));
    act(() => {
      wsInstance?.onmessage?.({
        data: JSON.stringify({
          type: "stream.status",
          payload: { channelId: "broadcaster_bob", status: "live" },
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /end broadcast/i })).toBeInTheDocument();
    });

    // Click 'Directory' inside StudioPage header
    const directoryBtn = screen.getByRole("button", { name: /directory/i });
    await user.click(directoryBtn);

    // Modal appears
    expect(screen.getByTestId("leave-studio-modal")).toBeInTheDocument();

    // Confirm leave
    const confirmBtn = screen.getByRole("button", { name: /end stream & leave/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(screen.queryByTestId("leave-studio-modal")).not.toBeInTheDocument();
      expect(window.location.search).toBe("");
    });
  });

  it("protects sign-out while broadcasting: stays live on cancel, ends stream and logs out on confirm", async () => {
    loginBroadcaster();
    window.history.replaceState(null, "", "/?page=studio");

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /broadcast studio/i })).toBeInTheDocument();
    });

    // Simulate going live
    const wsInstance = MockLiveWebSocket.instances.find((ws) => ws.url.includes("/ws/live"));
    act(() => {
      wsInstance?.onmessage?.({
        data: JSON.stringify({
          type: "stream.status",
          payload: { channelId: "broadcaster_bob", status: "live" },
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /end broadcast/i })).toBeInTheDocument();
    });

    // Broadcaster clicks 'Sign out' button in navbar
    const signOutBtn = screen.getByRole("button", { name: /sign out/i });
    await user.click(signOutBtn);

    // Leave studio modal should be shown
    expect(screen.getByTestId("leave-studio-modal")).toBeInTheDocument();

    // Cancel sign out
    const stayBtn = screen.getByRole("button", { name: /stay in studio/i });
    await user.click(stayBtn);

    expect(screen.queryByTestId("leave-studio-modal")).not.toBeInTheDocument();
    // User is still authenticated and broadcast is still live
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /end broadcast/i })).toBeInTheDocument();

    // Click Sign out again and confirm
    await user.click(screen.getByRole("button", { name: /sign out/i }));
    expect(screen.getByTestId("leave-studio-modal")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /end stream & leave/i }));

    await waitFor(() => {
      expect(screen.queryByTestId("leave-studio-modal")).not.toBeInTheDocument();
      // Should now be on home route and signed out
      expect(window.location.search).toBe("");
      expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    });
  });

  it("does not prompt modal when clicking 'Go live' (studio link) while already in studio", async () => {
    loginBroadcaster();
    window.history.replaceState(null, "", "/?page=studio");

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /broadcast studio/i })).toBeInTheDocument();
    });

    // Simulate going live
    const wsInstance = MockLiveWebSocket.instances.find((ws) => ws.url.includes("/ws/live"));
    act(() => {
      wsInstance?.onmessage?.({
        data: JSON.stringify({
          type: "stream.status",
          payload: { channelId: "broadcaster_bob", status: "live" },
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /end broadcast/i })).toBeInTheDocument();
    });

    // Navbar 'Go live' button points to studio
    const navbar = screen.getByRole("banner");
    const navStudioBtn = within(navbar).getByRole("button", { name: /go live/i });
    await user.click(navStudioBtn);

    // No modal should be displayed because we are staying on studio
    expect(screen.queryByTestId("leave-studio-modal")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /end broadcast/i })).toBeInTheDocument();
  });

  it("intercepts profile button click in navbar while broadcasting, navigates to profile on confirm", async () => {
    loginBroadcaster();
    window.history.replaceState(null, "", "/?page=studio");

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /broadcast studio/i })).toBeInTheDocument();
    });

    // Simulate going live
    const wsInstance = MockLiveWebSocket.instances.find((ws) => ws.url.includes("/ws/live"));
    act(() => {
      wsInstance?.onmessage?.({
        data: JSON.stringify({
          type: "stream.status",
          payload: { channelId: "broadcaster_bob", status: "live" },
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /end broadcast/i })).toBeInTheDocument();
    });

    // Click profile button in navbar
    const profileBtn = screen.getByTitle(/open @broadcaster_bob profile/i);
    await user.click(profileBtn);

    expect(screen.getByTestId("leave-studio-modal")).toBeInTheDocument();
    expect(
      screen.getByText(/if you proceed to leave studio, your live streaming will be ended and you will be redirected to profile\./i),
    ).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: /end stream & leave/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(screen.queryByTestId("leave-studio-modal")).not.toBeInTheDocument();
      expect(window.location.search).toBe("?page=profile");
    });
  });

  it("intercepts browser back popstate while broadcasting and protects session until confirmed", async () => {
    loginBroadcaster();
    window.history.replaceState(null, "", "/?page=studio");

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /broadcast studio/i })).toBeInTheDocument();
    });

    // Simulate going live
    const wsInstance = MockLiveWebSocket.instances.find((ws) => ws.url.includes("/ws/live"));
    act(() => {
      wsInstance?.onmessage?.({
        data: JSON.stringify({
          type: "stream.status",
          payload: { channelId: "broadcaster_bob", status: "live" },
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /end broadcast/i })).toBeInTheDocument();
    });

    // Simulate user pressing browser back button to navigate to ?page=following
    act(() => {
      window.history.replaceState(null, "", "/?page=following");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    // Modal dialog must be prompted
    await waitFor(() => {
      expect(screen.getByTestId("leave-studio-modal")).toBeInTheDocument();
    });

    // User cancels leave
    const stayBtn = screen.getByRole("button", { name: /stay in studio/i });
    await user.click(stayBtn);

    expect(screen.queryByTestId("leave-studio-modal")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /end broadcast/i })).toBeInTheDocument();

    // Trigger popstate again and confirm
    act(() => {
      window.history.replaceState(null, "", "/?page=following");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("leave-studio-modal")).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole("button", { name: /end stream & leave/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(screen.queryByTestId("leave-studio-modal")).not.toBeInTheDocument();
      expect(window.location.search).toBe("?page=following");
    });
  });

  it("registers beforeunload warning when live broadcasting", async () => {
    loginBroadcaster();
    window.history.replaceState(null, "", "/?page=studio");

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /broadcast studio/i })).toBeInTheDocument();
    });

    // Go live
    const wsInstance = MockLiveWebSocket.instances.find((ws) => ws.url.includes("/ws/live"));
    act(() => {
      wsInstance?.onmessage?.({
        data: JSON.stringify({
          type: "stream.status",
          payload: { channelId: "broadcaster_bob", status: "live" },
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /end broadcast/i })).toBeInTheDocument();
    });

    // Trigger beforeunload event
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("prompts broadcaster when clicking other links while WHIP connection is in connecting state, stays on cancel", async () => {
    loginAuthenticatedBroadcaster();
    window.history.replaceState(null, "", "/?page=studio");

    let resolveWhip: ((session: WhipSession) => void) | undefined;
    const whipPromise = new Promise<WhipSession>((resolve) => {
      resolveWhip = resolve;
    });
    vi.mocked(publishWhipStream).mockReturnValue(whipPromise);

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /broadcast studio/i })).toBeInTheDocument();
    });

    // Broadcaster initiates streaming via WHIP
    const goLiveBtn = within(screen.getByRole("main")).getByRole("button", { name: /^go live$/i });
    await user.click(goLiveBtn);

    // Studio is now connecting
    expect(screen.getByRole("button", { name: /connecting\.\.\./i })).toBeInTheDocument();

    // While connecting, broadcaster clicks "Browse" link in Navbar
    const browseBtn = screen.getByRole("button", { name: /^browse$/i });
    await user.click(browseBtn);

    // LeaveStudioModal must appear
    expect(screen.getByTestId("leave-studio-modal")).toBeInTheDocument();
    expect(
      screen.getByText(/if you proceed to leave studio, your live streaming will be ended and you will be redirected to browse\./i)
    ).toBeInTheDocument();

    // Broadcaster cancels leaving
    const stayBtn = screen.getByRole("button", { name: /stay in studio/i });
    await user.click(stayBtn);

    expect(screen.queryByTestId("leave-studio-modal")).not.toBeInTheDocument();
    expect(window.location.search).toBe("?page=studio");

    // WHIP connection completes
    const mockWhipSession: WhipSession = {
      sessionUrl: "http://localhost:8889/broadcaster_bob/whip/session_1",
      peerConnection: {} as unknown as RTCPeerConnection,
      stop: vi.fn().mockResolvedValue(undefined),
    };
    await act(async () => {
      resolveWhip?.(mockWhipSession);
    });

    // We are now live
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /end broadcast/i })).toBeInTheDocument();
    });
  });

  it("aborts pending WHIP session cleanly without leaking live state when confirmed while connecting", async () => {
    loginAuthenticatedBroadcaster();
    window.history.replaceState(null, "", "/?page=studio");

    let resolveWhip: ((session: WhipSession) => void) | undefined;
    const whipPromise = new Promise<WhipSession>((resolve) => {
      resolveWhip = resolve;
    });
    vi.mocked(publishWhipStream).mockReturnValue(whipPromise);

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /broadcast studio/i })).toBeInTheDocument();
    });

    // Initiate Go Live
    await user.click(within(screen.getByRole("main")).getByRole("button", { name: /^go live$/i }));
    expect(screen.getByRole("button", { name: /connecting\.\.\./i })).toBeInTheDocument();

    // Click Following in Navbar
    await user.click(screen.getByRole("button", { name: /following/i }));
    expect(screen.getByTestId("leave-studio-modal")).toBeInTheDocument();

    // Confirm leave while connecting
    const mockStop = vi.fn().mockResolvedValue(undefined);
    const mockWhipSession: WhipSession = {
      sessionUrl: "http://localhost:8889/broadcaster_bob/whip/session_abort",
      peerConnection: {} as unknown as RTCPeerConnection,
      stop: mockStop,
    };

    await user.click(screen.getByRole("button", { name: /end stream & leave/i }));

    // Now WHIP promise completes after leave confirm
    await act(async () => {
      resolveWhip?.(mockWhipSession);
    });

    // The late-arriving session must be immediately stopped
    await waitFor(() => {
      expect(mockStop).toHaveBeenCalled();
      expect(screen.queryByTestId("leave-studio-modal")).not.toBeInTheDocument();
      expect(window.location.search).toBe("?page=following");
    });
  });

  it("guarantees live state reset and backend offline cleanup when endBroadcastRef rejects", async () => {
    loginBroadcaster();
    window.history.replaceState(null, "", "/?page=studio");

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /broadcast studio/i })).toBeInTheDocument();
    });

    // Simulate going live via OBS WebSocket
    const wsInstance = MockLiveWebSocket.instances.find((ws) => ws.url.includes("/ws/live"));
    act(() => {
      wsInstance?.onmessage?.({
        data: JSON.stringify({
          type: "stream.status",
          payload: { channelId: "broadcaster_bob", status: "live" },
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /end broadcast/i })).toBeInTheDocument();
    });

    // Mock fetch so setChannelLiveApi rejects on teardown
    vi.mocked(globalThis.fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/channels/me/live")) {
        throw new Error("500 Internal Server Error");
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    // Click Browse
    await user.click(screen.getByRole("button", { name: /^browse$/i }));
    expect(screen.getByTestId("leave-studio-modal")).toBeInTheDocument();

    // Confirm leave even if teardown throws
    await user.click(screen.getByRole("button", { name: /end stream & leave/i }));

    // User is still navigated to Browse and modal is closed cleanly
    await waitFor(() => {
      expect(screen.queryByTestId("leave-studio-modal")).not.toBeInTheDocument();
      expect(window.location.search).toBe("");
    });
  });

  it("intercepts VeloStream logo click while broadcasting and navigates to Browse on confirm", async () => {
    loginBroadcaster();
    window.history.replaceState(null, "", "/?page=studio");

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /broadcast studio/i })).toBeInTheDocument();
    });

    const wsInstance = MockLiveWebSocket.instances.find((ws) => ws.url.includes("/ws/live"));
    act(() => {
      wsInstance?.onmessage?.({
        data: JSON.stringify({
          type: "stream.status",
          payload: { channelId: "broadcaster_bob", status: "live" },
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /end broadcast/i })).toBeInTheDocument();
    });

    // Click VeloStream logo
    const logoBtn = screen.getByLabelText(/velostream home/i);
    await user.click(logoBtn);

    expect(screen.getByTestId("leave-studio-modal")).toBeInTheDocument();
    expect(
      screen.getByText(/if you proceed to leave studio, your live streaming will be ended and you will be redirected to browse\./i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /end stream & leave/i }));

    await waitFor(() => {
      expect(screen.queryByTestId("leave-studio-modal")).not.toBeInTheDocument();
      expect(window.location.search).toBe("");
    });
  });

  it("displays natural sign out description in modal when sign out is clicked while broadcasting", async () => {
    loginBroadcaster();
    window.history.replaceState(null, "", "/?page=studio");

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /broadcast studio/i })).toBeInTheDocument();
    });

    const wsInstance = MockLiveWebSocket.instances.find((ws) => ws.url.includes("/ws/live"));
    act(() => {
      wsInstance?.onmessage?.({
        data: JSON.stringify({
          type: "stream.status",
          payload: { channelId: "broadcaster_bob", status: "live" },
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /end broadcast/i })).toBeInTheDocument();
    });

    // Click Sign out
    await user.click(screen.getByRole("button", { name: /sign out/i }));

    expect(screen.getByTestId("leave-studio-modal")).toBeInTheDocument();
    expect(
      screen.getByText(/if you proceed to leave studio, your live streaming will be ended and you will be signed out\./i)
    ).toBeInTheDocument();

    // Cancel sign out
    await user.click(screen.getByRole("button", { name: /stay in studio/i }));
    expect(screen.queryByTestId("leave-studio-modal")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /end broadcast/i })).toBeInTheDocument();
  });
});
