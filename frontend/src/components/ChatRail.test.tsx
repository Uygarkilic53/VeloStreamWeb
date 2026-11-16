import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "react-toastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../lib/auth";
import { buildChatSocketUrl, isJwtExpired } from "../lib/chat";
import { ChatRail } from "./ChatRail";

function createMockJwt(expDeltaSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: "EdDSA", typ: "JWT" }));
  const exp = Math.floor(Date.now() / 1000) + expDeltaSeconds;
  const payload = btoa(
    JSON.stringify({
      sub: "u-1",
      username: "viewer_bob",
      role: "user",
      exp,
    }),
  );
  return `${header}.${payload}.sig`;
}

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState: number = WebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { wasClean: boolean; code: number; reason: string }) => void) | null = null;
  sentData: string[] = [];
  openTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    this.openTimer = setTimeout(() => {
      if (this.readyState === WebSocket.OPEN) {
        act(() => {
          this.onopen?.();
        });
      }
    }, 0);
  }

  cancelOpen() {
    if (this.openTimer !== null) {
      clearTimeout(this.openTimer);
      this.openTimer = null;
    }
  }

  send(data: string) {
    this.sentData.push(data);
  }

  close(code = 1000, reason = "") {
    this.cancelOpen();
    this.readyState = WebSocket.CLOSED;
    act(() => {
      this.onclose?.({ wasClean: code === 1000, code, reason });
    });
  }

  emitMessage(data: unknown) {
    act(() => {
      this.onmessage?.({ data: JSON.stringify(data) });
    });
  }

  emitError() {
    this.cancelOpen();
    act(() => {
      this.onerror?.();
    });
  }

  emitClose(code = 1006, reason = "") {
    this.cancelOpen();
    this.readyState = WebSocket.CLOSED;
    act(() => {
      this.onclose?.({ wasClean: code === 1000, code, reason });
    });
  }
}

function renderWithAuth(
  ui: React.ReactElement,
  authOverrides: Partial<AuthContextValue> = {},
) {
  const defaultAuth: AuthContextValue = {
    user: {
      id: "u-1",
      email: "viewer@example.com",
      username: "viewer_bob",
      displayName: "Bob",
      channelTitle: "Bob's Channel",
      channelCategory: "Gaming",
      bio: "Test bio",
      streamKey: "key_bob",
      avatarUrl: null,
      role: "user",
      theme: "dark",
      slowMode: false,
      bannedUsers: [],
      bannedFromSlugs: [],
      followedSlugs: [],
      accessToken: "test_token_123",
      sessionKind: "backend",
    },
    isSubmitting: false,
    isHydrating: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    enterPreviewSession: vi.fn(),
    signOut: vi.fn(),
    updateTheme: vi.fn(),
    updateProfile: vi.fn(),
    uploadAvatar: vi.fn(),
    removeAvatar: vi.fn(),
    updateChannelSettings: vi.fn(),
    rotateStreamKey: vi.fn(),
    changePassword: vi.fn(),
    toggleFollow: vi.fn(),
    banUser: vi.fn(),
    unbanUser: vi.fn(),
    markChannelBanned: vi.fn(),
    listModerators: vi.fn(async () => ({ ok: true, moderators: [] })),
    addModerator: vi.fn(async () => ({ ok: true })),
    removeModerator: vi.fn(async () => ({ ok: true })),
    listSilences: vi.fn(async () => ({ ok: true, silences: [] })),
    silenceUser: vi.fn(async () => ({ ok: true })),
    unsilenceUser: vi.fn(async () => ({ ok: true })),
    sendWarning: vi.fn(async () => ({ ok: true })),
    ...authOverrides,
  };

  const renderResult = render(<AuthContext.Provider value={defaultAuth}>{ui}</AuthContext.Provider>);
  return {
    auth: defaultAuth,
    ...renderResult,
    rerender: (newUi: React.ReactElement) =>
      renderResult.rerender(<AuthContext.Provider value={defaultAuth}>{newUi}</AuthContext.Provider>),
  };
}

describe("ChatRail", () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders chat rail header and empty welcome state", () => {
    renderWithAuth(<ChatRail channelSlug="alex_dev" />);

    expect(screen.getByText(/Stream chat/i)).toBeInTheDocument();
    expect(screen.getByText(/No messages yet/i)).toBeInTheDocument();
  });

  it("receives and displays chat messages with role badges (Creator, Moderator, User)", async () => {
    renderWithAuth(<ChatRail channelSlug="alex_dev" />);

    expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    const ws = MockWebSocket.instances[0]!;

    // Emit chat messages with various roles
    ws.emitMessage({
      type: "chat.message",
      payload: {
        id: "msg-1",
        username: "alex_dev",
        role: "Creator",
        content: "Welcome everyone to the stream!",
        createdAt: new Date().toISOString(),
      },
    });

    ws.emitMessage({
      type: "chat.message",
      payload: {
        id: "msg-2",
        username: "mod_alice",
        role: "Moderator",
        content: "Remember to follow chat rules.",
        createdAt: new Date().toISOString(),
      },
    });

    ws.emitMessage({
      type: "chat.message",
      payload: {
        id: "msg-3",
        username: "charlie",
        role: "User",
        content: "Hey chat!",
        createdAt: new Date().toISOString(),
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Welcome everyone to the stream!")).toBeInTheDocument();
      expect(screen.getByText("Remember to follow chat rules.")).toBeInTheDocument();
      expect(screen.getByText("Hey chat!")).toBeInTheDocument();
    });

    expect(screen.getByText("Creator")).toBeInTheDocument();
    expect(screen.getByText("Moderator")).toBeInTheDocument();
    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.getByTestId("creator-badge-icon")).toBeInTheDocument();
    expect(screen.getByTestId("moderator-badge-icon")).toBeInTheDocument();
    expect(screen.getByTestId("user-badge-icon")).toBeInTheDocument();
  });

  it("normalizes role aliases like 'mod' and 'host' to display with proper icons and titles", async () => {
    renderWithAuth(<ChatRail channelSlug="alex_dev" />);
    const ws = MockWebSocket.instances[0]!;

    ws.emitMessage({
      type: "chat.message",
      payload: {
        id: "msg-mod-alias",
        username: "guard_bot",
        role: "mod",
        content: "Warning issued.",
        createdAt: new Date().toISOString(),
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Warning issued.")).toBeInTheDocument();
    });

    expect(screen.getByText("Moderator")).toBeInTheDocument();
    expect(screen.getByTestId("moderator-badge-icon")).toBeInTheDocument();
  });

  it("renders tombstone 'This message has been deleted.' when message is deleted", async () => {
    renderWithAuth(<ChatRail channelSlug="alex_dev" />);
    const ws = MockWebSocket.instances[0]!;

    ws.emitMessage({
      type: "chat.message",
      payload: {
        id: "msg-to-delete",
        username: "spammer",
        role: "User",
        content: "Spam link http://spam.com",
        createdAt: new Date().toISOString(),
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Spam link http://spam.com")).toBeInTheDocument();
    });

    // Receive message deleted event
    ws.emitMessage({
      type: "chat.message_deleted",
      payload: {
        messageId: "msg-to-delete",
        channelId: "alex_dev",
        deletedBy: "alex_dev",
      },
    });

    await waitFor(() => {
      expect(screen.getByText("This message has been deleted.")).toBeInTheDocument();
      expect(screen.queryByText("Spam link http://spam.com")).not.toBeInTheDocument();
    });
  });

  it("displays silenced countdown banner and disables input when user is silenced", async () => {
    renderWithAuth(<ChatRail channelSlug="alex_dev" />);
    const ws = MockWebSocket.instances[0]!;

    // 1 hour in the future
    const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();

    ws.emitMessage({
      type: "moderation.silenced",
      payload: {
        channelId: "alex_dev",
        userId: "u-1",
        username: "viewer_bob",
        duration: "1h",
        expiresAt: futureDate,
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/Silenced:/i)).toBeInTheDocument();
    });

    const chatInput = screen.getByPlaceholderText(/Silenced/i);
    expect(chatInput).toBeDisabled();
  });

  it("opens UserActionModal when a username is clicked", async () => {
    renderWithAuth(<ChatRail channelSlug="alex_dev" />);
    const ws = MockWebSocket.instances[0]!;

    ws.emitMessage({
      type: "chat.message",
      payload: {
        id: "msg-click",
        username: "sammy",
        role: "User",
        content: "Hello everyone",
        createdAt: new Date().toISOString(),
      },
    });

    await waitFor(() => {
      expect(screen.getByText("@sammy")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("@sammy"));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "@sammy" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /View Profile/i })).toBeInTheDocument();
    });
  });

  it("freezes and disables chat input when a moderation warning modal is active", async () => {
    renderWithAuth(<ChatRail channelSlug="alex_dev" />);
    const ws = MockWebSocket.instances[0]!;

    ws.emitMessage({
      type: "moderation.warning",
      payload: {
        channelId: "alex_dev",
        channelSlug: "alex_dev",
        moderatorUsername: "mod_sarah",
        reason: "Refrain from offensive language",
        warnedAt: new Date().toISOString(),
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("moderation-warning-modal")).toBeInTheDocument();
      expect(screen.getByText(/Refrain from offensive language/i)).toBeInTheDocument();
    });

    // Chat input should be frozen/disabled
    const chatInput = screen.getByPlaceholderText(/Chat is frozen: Acknowledge warning above/i);
    expect(chatInput).toBeDisabled();

    // Acknowledge warning
    fireEvent.click(screen.getByRole("button", { name: /I Understand & Acknowledge/i }));

    await waitFor(() => {
      expect(screen.queryByTestId("moderation-warning-modal")).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Message as @viewer_bob/i)).not.toBeDisabled();
    });
  });

  it("supports creator mode chat message sending and normalizes channel room to lowercase", async () => {
    renderWithAuth(<ChatRail channelSlug="Alex_Dev" creatorMode={true} />);
    const ws = MockWebSocket.instances[0]!;
    expect(ws.url).toContain("/ws/chat/alex_dev");

    const input = screen.getByPlaceholderText(/Message as @viewer_bob/i);
    fireEvent.change(input, { target: { value: "Hello from creator!" } });
    fireEvent.submit(input.closest("form")!);

    expect(ws.sentData.length).toBe(1);
    const sent = JSON.parse(ws.sentData[0]!);
    expect(sent.type).toBe("chat.message");
    expect(sent.payload.content).toBe("Hello from creator!");
  });

  it("forwards onViewProfile when View Profile is clicked inside UserActionModal", async () => {
    const onViewProfile = vi.fn();
    renderWithAuth(<ChatRail channelSlug="alex_dev" onViewProfile={onViewProfile} />);
    const ws = MockWebSocket.instances[0]!;

    ws.emitMessage({
      type: "chat.message",
      payload: {
        id: "msg-view-profile",
        username: "sammy_target",
        role: "User",
        content: "Check my profile",
        createdAt: new Date().toISOString(),
      },
    });

    await waitFor(() => {
      expect(screen.getByText("@sammy_target")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("@sammy_target"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /View Profile/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /View Profile/i }));

    expect(onViewProfile).toHaveBeenCalledWith("sammy_target");
  });

  it("handles onopen by clearing any reconnection notice and resetting state", async () => {
    renderWithAuth(<ChatRail channelSlug="alex_dev" />);
    const ws = MockWebSocket.instances[0]!;

    // Trigger an error to set reconnect notice
    ws.emitError();
    await waitFor(() => {
      expect(screen.getByText(/Live chat server reconnecting.../i)).toBeInTheDocument();
    });

    // When onopen fires, notice should be cleared
    act(() => {
      ws.onopen?.();
    });
    await waitFor(() => {
      expect(screen.queryByText(/Live chat server reconnecting.../i)).not.toBeInTheDocument();
    });
  });

  it("handles abnormal disconnect by showing reconnecting notice and scheduling reconnect", async () => {
    renderWithAuth(<ChatRail channelSlug="alex_dev" />);
    expect(MockWebSocket.instances.length).toBe(1);
    const ws1 = MockWebSocket.instances[0]!;

    // Simulate unexpected socket close (e.g. 1006 abnormal closure)
    act(() => {
      ws1.emitClose(1006, "Abnormal Closure");
    });

    // Notice should indicate reconnecting and offer Retry button
    await waitFor(() => {
      expect(screen.getByText(/Live chat server reconnecting.../i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
    });

    // Reconnect should fire automatically after exponential backoff delay (~1s)
    await waitFor(
      () => {
        expect(MockWebSocket.instances.length).toBe(2);
      },
      { timeout: 3000 },
    );
    const ws2 = MockWebSocket.instances[1]!;
    expect(ws2.url).toContain("/ws/chat/alex_dev");
  });

  it("allows user to manually retry connection via Retry button", async () => {
    renderWithAuth(<ChatRail channelSlug="alex_dev" />);
    expect(MockWebSocket.instances.length).toBe(1);
    const ws1 = MockWebSocket.instances[0]!;

    // Emit error
    act(() => {
      ws1.emitError();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
    });

    // Click Retry
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Retry/i }));
    });

    // Immediately connects a new WebSocket
    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(2);
    });
  });

  it("displays session expired notice on authentication failure close code (4001, 1008)", async () => {
    renderWithAuth(<ChatRail channelSlug="alex_dev" />);
    const ws = MockWebSocket.instances[0]!;

    // Emit 4001 auth failure close
    ws.emitClose(4001, "Unauthorized");

    await waitFor(() => {
      expect(screen.getByText(/Chat session expired. Please sign in again./i)).toBeInTheDocument();
    });
  });

  it("does not initiate WebSocket when user is logged out (guest) and shows sign-in placeholder", async () => {
    renderWithAuth(<ChatRail channelSlug="alex_dev" />, { user: null });

    // No WebSocket instance created
    expect(MockWebSocket.instances.length).toBe(0);

    // Shows sign in placeholder
    expect(screen.getByPlaceholderText(/Sign in to send chat messages/i)).toBeInTheDocument();
    expect(screen.queryByText(/Live chat server reconnecting.../i)).not.toBeInTheDocument();
  });

  it("does not initiate WebSocket in preview session and supports local messaging fallback", async () => {
    renderWithAuth(<ChatRail channelSlug="alex_dev" />, {
      user: {
        id: "usr_preview",
        email: "preview@velostream.dev",
        username: "preview_user",
        displayName: "Preview User",
        channelTitle: "Preview Channel",
        channelCategory: "Programming",
        bio: "",
        streamKey: "sk_preview",
        avatarUrl: null,
        role: "USER",
        theme: "light",
        slowMode: false,
        bannedUsers: [],
        bannedFromSlugs: [],
        followedSlugs: [],
        accessToken: null,
        sessionKind: "preview",
      },
    });

    // No WebSocket created
    expect(MockWebSocket.instances.length).toBe(0);

    // Send local message
    const input = screen.getByPlaceholderText(/Message as @preview_user/i);
    fireEvent.change(input, { target: { value: "Hello from local preview!" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("Hello from local preview!")).toBeInTheDocument();
      expect(screen.getByText("Sent in local preview.")).toBeInTheDocument();
    });
  });

  it("cleans up active WebSocket and reconnect timers when unmounted", () => {
    const { unmount } = renderWithAuth(<ChatRail channelSlug="alex_dev" />);
    const ws = MockWebSocket.instances[0]!;

    unmount();

    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });

  describe("URL normalization and JWT expiry handling", () => {
    it("normalizes socket URL by stripping leading @ and falling back gracefully", () => {
      const urlWithAt = buildChatSocketUrl("ws://localhost:3002", "@Streamer_Bob", "tok123");
      expect(urlWithAt).toBe("ws://localhost:3002/ws/chat/streamer_bob?token=tok123");

      const urlEmpty = buildChatSocketUrl("", "test_chan", "tok456");
      expect(urlEmpty).toContain("/ws/chat/test_chan?token=tok456");
      expect(urlEmpty).not.toContain("ws:///");
    });

    it("evaluates JWT expiration correctly", () => {
      const freshJwt = createMockJwt(3600); // +1 hour
      const expiredJwt = createMockJwt(-3600); // -1 hour

      expect(isJwtExpired(freshJwt)).toBe(false);
      expect(isJwtExpired(expiredJwt)).toBe(true);
      expect(isJwtExpired(null)).toBe(true);
      expect(isJwtExpired(undefined)).toBe(true);
      expect(isJwtExpired("non-jwt-string")).toBe(false);
    });

    it("does not initiate WebSocket and displays expired notice when token is expired", async () => {
      const expiredToken = createMockJwt(-600);
      renderWithAuth(<ChatRail channelSlug="alex_dev" />, {
        user: {
          id: "u-1",
          email: "viewer@example.com",
          username: "viewer_bob",
          displayName: "Bob",
          channelTitle: "Bob's Channel",
          channelCategory: "Gaming",
          bio: "",
          streamKey: "key_bob",
          avatarUrl: null,
          role: "user",
          theme: "dark",
          slowMode: false,
          bannedUsers: [],
          bannedFromSlugs: [],
          followedSlugs: [],
          accessToken: expiredToken,
          sessionKind: "backend",
        },
      });

      // No WebSocket created
      expect(MockWebSocket.instances.length).toBe(0);

      await waitFor(() => {
        expect(
          screen.getByText(/Chat session expired. Please sign in again./i),
        ).toBeInTheDocument();
      });
    });

    it("stops reconnection loop and sets session expired notice on 1006 abnormal closure if token is expired", async () => {
      const expiredToken = createMockJwt(-100);
      const { rerender } = renderWithAuth(<ChatRail channelSlug="alex_dev" />, {
        user: {
          id: "u-1",
          email: "viewer@example.com",
          username: "viewer_bob",
          displayName: "Bob",
          channelTitle: "Bob's Channel",
          channelCategory: "Gaming",
          bio: "",
          streamKey: "key_bob",
          avatarUrl: null,
          role: "user",
          theme: "dark",
          slowMode: false,
          bannedUsers: [],
          bannedFromSlugs: [],
          followedSlugs: [],
          accessToken: "valid_dummy_token",
          sessionKind: "backend",
        },
      });

      const ws = MockWebSocket.instances[0]!;

      // Re-render with expired token so userRef has expired token
      rerender(
        <AuthContext.Provider
          value={{
            user: {
              id: "u-1",
              email: "viewer@example.com",
              username: "viewer_bob",
              displayName: "Bob",
              channelTitle: "Bob's Channel",
              channelCategory: "Gaming",
              bio: "",
              streamKey: "key_bob",
              avatarUrl: null,
              role: "user",
              theme: "dark",
              slowMode: false,
              bannedUsers: [],
              bannedFromSlugs: [],
              followedSlugs: [],
              accessToken: expiredToken,
              sessionKind: "backend",
            },
            isSubmitting: false,
            isHydrating: false,
            signIn: vi.fn(),
            signUp: vi.fn(),
            enterPreviewSession: vi.fn(),
            signOut: vi.fn(),
            updateTheme: vi.fn(),
            updateProfile: vi.fn(),
            uploadAvatar: vi.fn(),
            removeAvatar: vi.fn(),
            updateChannelSettings: vi.fn(),
            rotateStreamKey: vi.fn(),
            changePassword: vi.fn(),
            toggleFollow: vi.fn(),
            banUser: vi.fn(),
            unbanUser: vi.fn(),
            markChannelBanned: vi.fn(),
            listModerators: vi.fn(async () => ({ ok: true, moderators: [] })),
            addModerator: vi.fn(async () => ({ ok: true })),
            removeModerator: vi.fn(async () => ({ ok: true })),
            listSilences: vi.fn(async () => ({ ok: true, silences: [] })),
            silenceUser: vi.fn(async () => ({ ok: true })),
            unsilenceUser: vi.fn(async () => ({ ok: true })),
            sendWarning: vi.fn(async () => ({ ok: true })),
          }}
        >
          <ChatRail channelSlug="alex_dev" />
        </AuthContext.Provider>,
      );

      // Trigger 1006 closure
      ws.emitClose(1006, "Abnormal closure");

      // Because the token is expired, it should show session expired and not reconnect
      await waitFor(() => {
        expect(
          screen.getByText(/Chat session expired. Please sign in again./i),
        ).toBeInTheDocument();
      });
    });

    it("displays appropriate notice for guest and preview sessions and fetches message history", async () => {
      const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [
            {
              id: "hist-1",
              username: "sammy",
              role: "User",
              content: "Past history message",
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      } as Response);

      renderWithAuth(<ChatRail channelSlug="@alex_dev" />, { user: null });

      // Shows guest notice
      await waitFor(() => {
        expect(screen.getByText(/Sign in to participate in live chat./i)).toBeInTheDocument();
        expect(screen.getByText("Past history message")).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/chat/alex_dev/messages?limit=50"),
      );
    });
  });

  describe("ChatRail - Silence Persistence, Chat Reset, and Creator Freeze", () => {
    it("immediately re-applies silence on reload when receiving moderation.silenced frame", async () => {
      renderWithAuth(<ChatRail channelSlug="alex_dev" />);
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;

      // Simulate incoming moderation.silenced frame sent on connect
      const futureExpiry = new Date(Date.now() + 3600 * 1000).toISOString();
      ws.emitMessage({
        type: "moderation.silenced",
        payload: {
          channelId: "alex_dev",
          userId: "u-1",
          username: "viewer_bob",
          expiresAt: futureExpiry,
          reason: "Spamming links",
        },
      });

      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent(/Silenced:/i);
        const input = screen.getByRole("textbox");
        expect(input).toBeDisabled();
      });
    });

    it("clears local chat messages upon receiving chat.reset frame", async () => {
      renderWithAuth(<ChatRail channelSlug="alex_dev" />);
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;

      // Post a message
      ws.emitMessage({
        type: "chat.message",
        payload: {
          id: "m-1",
          channelId: "alex_dev",
          username: "sammy",
          content: "Hello before stream ends",
        },
      });

      await waitFor(() => {
        expect(screen.getByText("Hello before stream ends")).toBeInTheDocument();
      });

      // Stream ends -> Fiber broadcasts chat.reset
      ws.emitMessage({
        type: "chat.reset",
        payload: {
          channelId: "alex_dev",
        },
      });

      await waitFor(() => {
        expect(screen.queryByText("Hello before stream ends")).not.toBeInTheDocument();
        expect(screen.getByText(/No messages yet\. Say hello in chat!/i)).toBeInTheDocument();
      });
    });

    it("clears chat messages when resetKey prop changes", async () => {
      const { rerender } = renderWithAuth(<ChatRail channelSlug="alex_dev" resetKey={0} />);
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;

      ws.emitMessage({
        type: "chat.message",
        payload: {
          id: "m-2",
          channelId: "alex_dev",
          username: "sammy",
          content: "Message to be reset by prop",
        },
      });

      await waitFor(() => {
        expect(screen.getByText("Message to be reset by prop")).toBeInTheDocument();
      });

      // Increment resetKey (e.g. StudioPage ending broadcast)
      rerender(
        <AuthContext.Provider
          value={{
            user: {
              id: "u-1",
              email: "viewer@example.com",
              username: "viewer_bob",
              displayName: "Bob",
              channelTitle: "Bob's Channel",
              channelCategory: "Gaming",
              bio: "Test bio",
              streamKey: "key_bob",
              avatarUrl: null,
              role: "user",
              theme: "dark",
              slowMode: false,
              bannedUsers: [],
              bannedFromSlugs: [],
              followedSlugs: [],
              accessToken: createMockJwt(3600),
              sessionKind: "backend",
            },
            isSubmitting: false,
            isHydrating: false,
            signIn: vi.fn(),
            signUp: vi.fn(),
            enterPreviewSession: vi.fn(),
            signOut: vi.fn(),
            updateTheme: vi.fn(),
            updateProfile: vi.fn(),
            uploadAvatar: vi.fn(),
            removeAvatar: vi.fn(),
            updateChannelSettings: vi.fn(),
            rotateStreamKey: vi.fn(),
            changePassword: vi.fn(),
            toggleFollow: vi.fn(),
            banUser: vi.fn(),
            unbanUser: vi.fn(),
            markChannelBanned: vi.fn(),
            listModerators: vi.fn(async () => ({ ok: true, moderators: [] })),
            addModerator: vi.fn(async () => ({ ok: true })),
            removeModerator: vi.fn(async () => ({ ok: true })),
            listSilences: vi.fn(async () => ({ ok: true, silences: [] })),
            silenceUser: vi.fn(async () => ({ ok: true })),
            unsilenceUser: vi.fn(async () => ({ ok: true })),
            sendWarning: vi.fn(async () => ({ ok: true })),
          }}
        >
          <ChatRail channelSlug="alex_dev" resetKey={1} />
        </AuthContext.Provider>,
      );

      await waitFor(() => {
        expect(screen.queryByText("Message to be reset by prop")).not.toBeInTheDocument();
      });
    });

    it("displays freeze toggle for creator, allows pausing chat, and updates viewer state", async () => {
      // Render as channel creator
      renderWithAuth(<ChatRail channelSlug="alex_dev" creatorMode={true} />);
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;

      // Creator sees Pause Chat button in header
      const pauseBtn = screen.getByRole("button", { name: /Pause Chat/i });
      expect(pauseBtn).toBeInTheDocument();

      // Click to pause chat
      fireEvent.click(pauseBtn);

      // Verify chat.freeze frame sent over WebSocket
      expect(ws.sentData).toContain(
        JSON.stringify({
          type: "chat.freeze",
          payload: {
            channelId: "alex_dev",
            isFrozen: true,
          },
        }),
      );

      // Button toggles to Resume Chat
      expect(screen.getByRole("button", { name: /Resume Chat/i })).toBeInTheDocument();

      // Creator can still use the input
      const input = screen.getByRole("textbox");
      expect(input).not.toBeDisabled();
    });

    it("disables composer and displays prominent pause banner for viewers when chat is frozen", async () => {
      // Render as non-creator viewer
      renderWithAuth(<ChatRail channelSlug="alex_dev" creatorMode={false} />);
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;

      // Non-creator does NOT see pause toggle button
      expect(screen.queryByRole("button", { name: /Pause Chat/i })).not.toBeInTheDocument();

      // Ingress chat.freeze frame received from creator
      ws.emitMessage({
        type: "chat.freeze",
        payload: {
          channelId: "alex_dev",
          isFrozen: true,
          frozenBy: "alex_dev",
        },
      });

      await waitFor(() => {
        expect(screen.getByText("Chat is paused by the creator.")).toBeInTheDocument();
        const input = screen.getByRole("textbox");
        expect(input).toBeDisabled();
        expect(screen.getByRole("button", { name: /Send/i })).toBeDisabled();
      });
    });

    it("displays slow mode toggle button in header adjacent to pause button for creator, toggles slow mode and syncs state", async () => {
      const updateChannelSettings = vi.fn().mockResolvedValue({ ok: true });
      renderWithAuth(<ChatRail channelSlug="alex_dev" creatorMode={true} />, { updateChannelSettings });
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;

      // Creator sees Slow Mode toggle button adjacent to Pause Chat button
      const slowBtn = screen.getByRole("button", { name: /Enable Slow Mode/i });
      expect(slowBtn).toBeInTheDocument();

      // Click to enable slow mode
      fireEvent.click(slowBtn);

      // Verify chat.slowmode frame sent over WebSocket
      expect(ws.sentData).toContain(
        JSON.stringify({
          type: "chat.slowmode",
          payload: {
            channelId: "alex_dev",
            enabled: true,
            cooldownSeconds: 3,
          },
        }),
      );

      // Verify updateChannelSettings called
      expect(updateChannelSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          slowMode: true,
        }),
      );

      // Button toggles to Slow 3s
      expect(screen.getByRole("button", { name: /Disable Slow Mode/i })).toBeInTheDocument();

      // Creator is exempt from cooldown - input remains enabled
      const input = screen.getByRole("textbox");
      expect(input).not.toBeDisabled();

      // Click again to disable slow mode
      fireEvent.click(screen.getByRole("button", { name: /Disable Slow Mode/i }));

      expect(ws.sentData).toContain(
        JSON.stringify({
          type: "chat.slowmode",
          payload: {
            channelId: "alex_dev",
            enabled: false,
            cooldownSeconds: 3,
          },
        }),
      );
    });

    it("displays slow mode indicator for non-creator viewers and enforces 3-second visual cooldown after message submission", async () => {
      vi.useFakeTimers();
      try {
        renderWithAuth(<ChatRail channelSlug="alex_dev" creatorMode={false} />);
        const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;

        // Non-creator does NOT see slow mode toggle button
        expect(screen.queryByRole("button", { name: /Enable Slow Mode/i })).not.toBeInTheDocument();

        // Ingress chat.slowmode frame
        ws.emitMessage({
          type: "chat.slowmode",
          payload: {
            channelId: "alex_dev",
            enabled: true,
            cooldownSeconds: 3,
          },
        });

        // Viewer sees slow mode indicator in header and composer banner
        expect(screen.getByTestId("slow-mode-indicator")).toHaveTextContent("Slow mode (3s)");
        expect(screen.getByText("Slow mode is enabled (3s between messages)")).toBeInTheDocument();

        // Viewer types and sends a message
        const input = screen.getByRole("textbox");
        fireEvent.change(input, { target: { value: "Hello world" } });
        fireEvent.submit(input.closest("form")!);

        // Visual cooldown active: input disabled, send button shows countdown
        expect(input).toBeDisabled();
        expect(screen.getByRole("button", { name: "3s" })).toBeDisabled();
        expect(screen.getByText(/Slow mode: Cooldown active \(3s\)/i)).toBeInTheDocument();

        // Advance 1 second -> 2s
        act(() => {
          vi.advanceTimersByTime(1000);
        });
        expect(screen.getByRole("button", { name: "2s" })).toBeDisabled();

        // Advance 2 more seconds -> cooldown expires
        act(() => {
          vi.advanceTimersByTime(2000);
        });

        expect(input).not.toBeDisabled();
        expect(screen.getByRole("button", { name: /Send/i })).not.toBeDisabled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("enforces slow mode cooldown when receiving chat.error with code SLOW_MODE", async () => {
      renderWithAuth(<ChatRail channelSlug="alex_dev" creatorMode={false} />);
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;

      // Ingress chat.error frame with SLOW_MODE
      ws.emitMessage({
        type: "chat.error",
        payload: {
          code: "SLOW_MODE",
          message: "Slow mode is enabled. Wait 3s between messages.",
        },
      });

      await waitFor(() => {
        const input = screen.getByRole("textbox");
        expect(input).toBeDisabled();
        expect(screen.getByRole("button", { name: /3s/i })).toBeDisabled();
      });
    });

    it("recognizes creator and enables Slow Mode toggle when channelSlug starts with @", async () => {
      const updateChannelSettings = vi.fn().mockResolvedValue({ ok: true });
      renderWithAuth(<ChatRail channelSlug="@viewer_bob" creatorMode={false} />, {
        user: {
          id: "u-1",
          username: "viewer_bob",
          displayName: "Bob",
          email: "bob@example.com",
          bio: "",
          streamKey: "key_bob",
          channelTitle: "Bob's Channel",
          channelCategory: "Gaming",
          avatarUrl: null,
          role: "user",
          theme: "dark",
          slowMode: false,
          bannedUsers: [],
          bannedFromSlugs: [],
          followedSlugs: [],
          accessToken: "valid_dummy_token",
          sessionKind: "backend",
        },
        updateChannelSettings,
      });

      const slowBtn = await screen.findByRole("button", { name: /Enable Slow Mode/i });
      expect(slowBtn).toBeInTheDocument();
      fireEvent.click(slowBtn);

      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;
      expect(ws.sentData).toContain(
        JSON.stringify({
          type: "chat.slowmode",
          payload: {
            channelId: "viewer_bob",
            enabled: true,
            cooldownSeconds: 3,
          },
        }),
      );
    });

    it("suppresses toast notification on initial connect when initial flag is true", async () => {
      const toastSpy = vi.spyOn(toast, "info");
      renderWithAuth(<ChatRail channelSlug="alex_dev" creatorMode={false} />);
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;

      // Ingress initial chat.slowmode frame sent by Fiber upon connection
      ws.emitMessage({
        type: "chat.slowmode",
        payload: {
          channelId: "alex_dev",
          enabled: true,
          cooldownSeconds: 3,
          initial: true,
        },
      });

      await screen.findByTestId("slow-mode-indicator");
      expect(toastSpy).not.toHaveBeenCalledWith("Slow mode enabled (3s cooldown)");
      toastSpy.mockRestore();
    });

    it("resets slow mode state when switching channels", async () => {
      const { rerender } = renderWithAuth(<ChatRail channelSlug="alex_dev" creatorMode={false} />);
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;

      // Enable slow mode on channel 1
      ws.emitMessage({
        type: "chat.slowmode",
        payload: {
          channelId: "alex_dev",
          enabled: true,
          cooldownSeconds: 3,
        },
      });

      await screen.findByTestId("slow-mode-indicator");

      // Switch to channel 2 (which has no slow mode)
      rerender(<ChatRail channelSlug="sarah_music" creatorMode={false} />);

      await waitFor(() => {
        expect(screen.queryByTestId("slow-mode-indicator")).not.toBeInTheDocument();
        expect(screen.queryByText(/Slow mode is enabled/i)).not.toBeInTheDocument();
      });
    });

    it("lifts channel ban and calls clearChannelBanned when receiving moderation.unbanned frame", async () => {
      const clearChannelBanned = vi.fn();
      renderWithAuth(<ChatRail channelSlug="alex_dev" />, { clearChannelBanned });
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;

      ws.emitMessage({
        type: "moderation.unbanned",
        payload: {
          channelId: "alex_dev",
          channelSlug: "alex_dev",
          userId: "u-1",
          username: "viewer_bob",
        },
      });

      await waitFor(() => {
        expect(clearChannelBanned).toHaveBeenCalledWith("alex_dev");
      });
    });

    it("persists silence countdown across re-renders without channel slug change", async () => {
      const { rerender } = renderWithAuth(<ChatRail channelSlug="alex_dev" isLive={true} />);
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;

      const futureExpiry = new Date(Date.now() + 1800 * 1000).toISOString();
      ws.emitMessage({
        type: "moderation.silenced",
        payload: {
          channelId: "alex_dev",
          userId: "u-1",
          username: "viewer_bob",
          expiresAt: futureExpiry,
        },
      });

      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent(/Silenced:/i);
      });

      // Re-render component (e.g. auth updates or parent re-render without slug change)
      rerender(<ChatRail channelSlug="alex_dev" isLive={false} />);

      // Silence countdown should STILL be present and input disabled
      expect(screen.getByRole("status")).toHaveTextContent(/Silenced:/i);
      expect(screen.getByRole("textbox")).toBeDisabled();
    });

    it("hydrates silence instantly from sessionStorage on fresh mount simulating page refresh", async () => {
      const futureExpiry = new Date(Date.now() + 3600 * 1000).toISOString();
      window.sessionStorage.setItem("vs_silenced_alex_dev", futureExpiry);

      renderWithAuth(<ChatRail channelSlug="alex_dev" isLive={true} />);

      // On initial mount before any WebSocket message arrives, status is already showing silence
      expect(screen.getByRole("status")).toHaveTextContent(/Silenced:/i);
      expect(screen.getByRole("textbox")).toBeDisabled();
      expect(screen.getByRole("button", { name: /Send/i })).toBeDisabled();
    });
  });

  describe("ChatRail - Creator & Moderator Lightning Effects and Role Demotion", () => {
    it("applies flashing lightning effect to creator username and greenish lightning effect to moderator username", async () => {
      renderWithAuth(<ChatRail channelSlug="alex_dev" isLive={true} />);
      const ws = MockWebSocket.instances[0]!;

      // Creator message (username matches channel slug)
      ws.emitMessage({
        type: "chat.message",
        payload: {
          id: "msg-creator-1",
          username: "alex_dev",
          role: "Creator",
          content: "Welcome to my channel!",
          createdAt: new Date().toISOString(),
        },
      });

      // Moderator message
      ws.emitMessage({
        type: "chat.message",
        payload: {
          id: "msg-mod-1",
          username: "mod_sarah",
          role: "Moderator",
          content: "Keep chat friendly please.",
          createdAt: new Date().toISOString(),
        },
      });

      // Regular user message
      ws.emitMessage({
        type: "chat.message",
        payload: {
          id: "msg-user-1",
          username: "charlie_viewer",
          role: "User",
          content: "Hey everyone!",
          createdAt: new Date().toISOString(),
        },
      });

      await waitFor(() => {
        expect(screen.getByText("Welcome to my channel!")).toBeInTheDocument();
        expect(screen.getByText("Keep chat friendly please.")).toBeInTheDocument();
        expect(screen.getByText("Hey everyone!")).toBeInTheDocument();
      });

      // Creator button should have creator lightning effect
      const creatorBtn = screen.getByRole("button", { name: "@alex_dev" });
      expect(creatorBtn).toHaveClass("chat-creator-lightning");
      expect(creatorBtn).not.toHaveClass("chat-moderator-lightning");
      expect(creatorBtn).toHaveAttribute("data-chat-role", "Creator");

      // Moderator button should have greenish moderator lightning effect
      const modBtn = screen.getByRole("button", { name: "@mod_sarah" });
      expect(modBtn).toHaveClass("chat-moderator-lightning");
      expect(modBtn).not.toHaveClass("chat-creator-lightning");
      expect(modBtn).toHaveAttribute("data-chat-role", "Moderator");

      // Regular user should have standard text styling without lightning effects
      const userBtn = screen.getByRole("button", { name: "@charlie_viewer" });
      expect(userBtn).toHaveClass("text-[var(--vs-text)]");
      expect(userBtn).not.toHaveClass("chat-creator-lightning");
      expect(userBtn).not.toHaveClass("chat-moderator-lightning");
      expect(userBtn).toHaveAttribute("data-chat-role", "User");
    });

    it("dynamically turns previous messages to normal user styling when moderator authority is dismissed via moderation.role_updated", async () => {
      renderWithAuth(<ChatRail channelSlug="alex_dev" isLive={true} />);
      const ws = MockWebSocket.instances[0]!;

      // User sends multiple messages while they have moderator authority
      ws.emitMessage({
        type: "chat.message",
        payload: {
          id: "msg-mod-first",
          username: "mod_sarah",
          role: "Moderator",
          content: "First mod message",
          createdAt: new Date().toISOString(),
        },
      });
      ws.emitMessage({
        type: "chat.message",
        payload: {
          id: "msg-mod-second",
          username: "mod_sarah",
          role: "Moderator",
          content: "Second mod message",
          createdAt: new Date().toISOString(),
        },
      });

      await waitFor(() => {
        expect(screen.getByText("First mod message")).toBeInTheDocument();
        expect(screen.getByText("Second mod message")).toBeInTheDocument();
      });

      // Verify both messages initially have the greenish moderator lightning effect
      const modButtonsInitial = screen.getAllByRole("button", { name: "@mod_sarah" });
      expect(modButtonsInitial).toHaveLength(2);
      for (const btn of modButtonsInitial) {
        expect(btn).toHaveClass("chat-moderator-lightning");
        expect(btn).toHaveAttribute("data-chat-role", "Moderator");
      }
      expect(screen.getAllByText("Moderator").length).toBeGreaterThanOrEqual(2);

      // Now dismiss the user's moderator privilege via WebSocket broadcast
      ws.emitMessage({
        type: "moderation.role_updated",
        payload: {
          channelId: "alex_dev",
          username: "mod_sarah",
          newRole: "User",
        },
      });

      // Both previous messages must immediately update to regular user status:
      // normal text color, no greenish lightning, and User role badge
      await waitFor(() => {
        const modButtonsUpdated = screen.getAllByRole("button", { name: "@mod_sarah" });
        expect(modButtonsUpdated).toHaveLength(2);
        for (const btn of modButtonsUpdated) {
          expect(btn).toHaveClass("text-[var(--vs-text)]");
          expect(btn).not.toHaveClass("chat-moderator-lightning");
          expect(btn).toHaveAttribute("data-chat-role", "User");
        }
      });
    });

    it("dynamically turns previous messages to normal user styling when creator dismisses moderator via UserActionModal remove_mod", async () => {
      const mockRemoveModerator = vi.fn(async () => ({
        ok: true,
        message: "Removed moderator privileges for @mod_sarah.",
      }));

      // Render as channel creator (username alex_dev matches channelSlug alex_dev)
      renderWithAuth(
        <ChatRail channelSlug="alex_dev" creatorMode={true} isLive={true} />,
        {
          user: {
            id: "u-creator",
            email: "creator@example.com",
            username: "alex_dev",
            displayName: "Alex",
            channelTitle: "Alex Dev",
            channelCategory: "Gaming",
            bio: "Channel creator",
            streamKey: "key_1",
            avatarUrl: null,
            role: "creator",
            theme: "dark",
            slowMode: false,
            bannedUsers: [],
            bannedFromSlugs: [],
            followedSlugs: [],
            accessToken: "creator_token_123",
            sessionKind: "backend",
          },
          removeModerator: mockRemoveModerator,
        },
      );
      const ws = MockWebSocket.instances[0]!;

      // mod_sarah sends a message as moderator
      ws.emitMessage({
        type: "chat.message",
        payload: {
          id: "msg-mod-action-1",
          username: "mod_sarah",
          role: "Moderator",
          content: "Message from moderator before demotion",
          createdAt: new Date().toISOString(),
        },
      });

      await waitFor(() => {
        expect(screen.getByText("Message from moderator before demotion")).toBeInTheDocument();
      });

      const modBtn = screen.getByRole("button", { name: "@mod_sarah" });
      expect(modBtn).toHaveClass("chat-moderator-lightning");

      // Click the username to open UserActionModal
      fireEvent.click(modBtn);

      // Verify UserActionModal opens with "Dismiss as Moderator" button for channel owner
      const dismissBtn = await screen.findByRole("button", { name: /dismiss as moderator/i });
      expect(dismissBtn).toBeInTheDocument();

      // Click "Dismiss Moderator"
      fireEvent.click(dismissBtn);

      await waitFor(() => {
        expect(mockRemoveModerator).toHaveBeenCalledWith("mod_sarah", "alex_dev");
      });

      // The previous message in the chat rail must turn to normal user text without greenish lightning
      await waitFor(() => {
        const updatedBtn = screen.getByRole("button", { name: "@mod_sarah" });
        expect(updatedBtn).toHaveClass("text-[var(--vs-text)]");
        expect(updatedBtn).not.toHaveClass("chat-moderator-lightning");
        expect(updatedBtn).toHaveAttribute("data-chat-role", "User");
      });
    });

    it("restores greenish lightning effect to previous messages if a dismissed user is re-assigned as moderator", async () => {
      renderWithAuth(<ChatRail channelSlug="alex_dev" isLive={true} />);
      const ws = MockWebSocket.instances[0]!;

      ws.emitMessage({
        type: "chat.message",
        payload: {
          id: "msg-mod-toggle-1",
          username: "mod_sarah",
          role: "Moderator",
          content: "Dynamic role toggle test",
          createdAt: new Date().toISOString(),
        },
      });

      await waitFor(() => {
        expect(screen.getByText("Dynamic role toggle test")).toBeInTheDocument();
      });

      // Demote to User
      ws.emitMessage({
        type: "moderation.role_updated",
        payload: {
          channelId: "alex_dev",
          username: "mod_sarah",
          newRole: "User",
        },
      });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "@mod_sarah" })).toHaveClass("text-[var(--vs-text)]");
        expect(screen.getByRole("button", { name: "@mod_sarah" })).not.toHaveClass("chat-moderator-lightning");
      });

      // Re-assign back to Moderator
      ws.emitMessage({
        type: "moderation.role_updated",
        payload: {
          channelId: "alex_dev",
          username: "mod_sarah",
          newRole: "Moderator",
        },
      });

      await waitFor(() => {
        const reAssignedBtn = screen.getByRole("button", { name: "@mod_sarah" });
        expect(reAssignedBtn).toHaveClass("chat-moderator-lightning");
        expect(reAssignedBtn).toHaveAttribute("data-chat-role", "Moderator");
      });
    });

    it("dynamically turns historical moderator messages to normal user when listModerators updates without that user", async () => {
      let resolveSecondFetch: (res: { ok: boolean; moderators: Array<{ username: string }> }) => void;
      const secondPromise = new Promise<{ ok: boolean; moderators: Array<{ username: string }> }>((resolve) => {
        resolveSecondFetch = resolve;
      });

      const mockListModerators = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, moderators: [{ username: "mod_sarah" }] })
        .mockImplementation(() => secondPromise);

      renderWithAuth(<ChatRail channelSlug="alex_dev" isLive={true} creatorMode={true} />, {
        listModerators: mockListModerators,
      });

      const ws = MockWebSocket.instances[0]!;

      // Chat history loads with a message from mod_sarah (role: Moderator)
      ws.emitMessage({
        type: "chat.history",
        payload: [
          {
            id: "hist-msg-1",
            username: "mod_sarah",
            role: "Moderator",
            content: "Historical message from former mod",
            createdAt: new Date().toISOString(),
          },
        ],
      });

      await waitFor(() => {
        expect(screen.getByText("Historical message from former mod")).toBeInTheDocument();
      });

      // Initially renders as moderator (greenish lightning)
      const initialModBtn = screen.getByRole("button", { name: "@mod_sarah" });
      expect(initialModBtn).toHaveClass("chat-moderator-lightning");
      expect(initialModBtn).toHaveAttribute("data-chat-role", "Moderator");

      // Click mod_sarah to open UserActionModal and dismiss moderator
      fireEvent.click(initialModBtn);
      const dismissBtn = await screen.findByRole("button", { name: /dismiss as moderator/i });
      fireEvent.click(dismissBtn);

      // Now the second listModerators fetch resolves without mod_sarah
      act(() => {
        resolveSecondFetch({ ok: true, moderators: [] });
      });

      // The historical message MUST turn to normal user styling and badge
      await waitFor(() => {
        const updatedBtn = screen.getByRole("button", { name: "@mod_sarah" });
        expect(updatedBtn).toHaveClass("text-[var(--vs-text)]");
        expect(updatedBtn).not.toHaveClass("chat-moderator-lightning");
        expect(updatedBtn).toHaveAttribute("data-chat-role", "User");
      });
    });
  });
});
