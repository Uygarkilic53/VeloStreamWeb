import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue, type UserAccount } from "../lib/auth";
import {
  clearPreferenceCookies,
  getStudioPermissionsCookie,
  setStudioPermissionsCookie,
} from "../lib/cookies";
import { StudioPage } from "./StudioPage";
import { publishWhipStream, type WhipSession } from "../lib/whip";

// Mock the WHIP client library
vi.mock("../lib/whip", () => ({
  publishWhipStream: vi.fn(),
  WhipError: class WhipError extends Error {
    constructor(message: string, public readonly statusCode?: number) {
      super(message);
      this.name = "WhipError";
    }
  },
}));

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  emitMessage(payload: unknown) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(payload) });
    }
  }
}

const mockUser: UserAccount = {
  id: "usr_alex",
  username: "alex_dev",
  displayName: "Alex Dev",
  email: "alex@example.com",
  bio: "Systems and low-latency engineer",
  avatarUrl: null,
  role: "streamer",
  theme: "light",
  channelTitle: "Distributed Systems & WebRTC",
  channelCategory: "Programming",
  streamKey: "sk_live_alex_abc123",
  slowMode: false,
  bannedUsers: [],
  bannedFromSlugs: [],
  followedSlugs: [],
  accessToken: "jwt_token_alex",
  sessionKind: "backend",
};

function renderStudioPage(
  props: {
    user?: UserAccount | null;
    isBroadcastLive?: boolean;
    onNavigate?: ReturnType<typeof vi.fn>;
    onSetBroadcastLive?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const {
    user = null,
    isBroadcastLive = false,
    onNavigate = vi.fn(),
    onSetBroadcastLive = vi.fn(),
  } = props;

  const authValue: AuthContextValue = {
    user,
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
    updateChannelSettings: vi.fn().mockResolvedValue({ ok: true, message: "Settings saved" }),
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
  };

  const renderResult = render(
    <AuthContext.Provider value={authValue}>
      <StudioPage
        whipBaseUrl="http://localhost:8889"
        wsUrl="http://localhost:4000"
        onNavigate={onNavigate}
        isBroadcastLive={isBroadcastLive}
        onSetBroadcastLive={onSetBroadcastLive}
      />
    </AuthContext.Provider>,
  );

  return { ...renderResult, authValue, onNavigate, onSetBroadcastLive };
}

describe("StudioPage - Go Live & OBS Sync", () => {
  const originalWebSocket = globalThis.WebSocket;
  let mockTrack: {
    id: string;
    kind: string;
    stop: ReturnType<typeof vi.fn>;
    enabled: boolean;
    addEventListener?: ReturnType<typeof vi.fn>;
    removeEventListener?: ReturnType<typeof vi.fn>;
  };
  let mockMediaStream: {
    getTracks: () => typeof mockTrack[];
    getVideoTracks: () => typeof mockTrack[];
    getAudioTracks: () => typeof mockTrack[];
    addTrack?: ReturnType<typeof vi.fn>;
    removeTrack?: ReturnType<typeof vi.fn>;
  };
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearPreferenceCookies();
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;

    mockTrack = {
      id: "track-1",
      kind: "video",
      stop: vi.fn(),
      enabled: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    mockMediaStream = {
      getTracks: () => [mockTrack],
      getVideoTracks: () => [mockTrack],
      getAudioTracks: () => [mockTrack],
      addTrack: vi.fn(),
      removeTrack: vi.fn(),
    };

    // Mock mediaDevices
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockMediaStream),
        getDisplayMedia: vi.fn().mockResolvedValue(mockMediaStream),
      },
      writable: true,
      configurable: true,
    });

    // Mock clipboard
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: writeTextMock,
      },
      writable: true,
      configurable: true,
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    clearPreferenceCookies();
    globalThis.WebSocket = originalWebSocket;
  });

  it("displays accessible auth modal dialog when unauthenticated user clicks 'Go live'", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    renderStudioPage({ user: null, onNavigate });

    // Confirm modal is not initially present
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Click Go live button
    const goLiveBtn = screen.getByRole("button", { name: /go live/i });
    await user.click(goLiveBtn);

    // Verify modal dialog appears with proper accessibility attributes
    const modal = screen.getByRole("dialog");
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: /sign in to start broadcasting/i })).toBeInTheDocument();

    // Verify Sign In navigation within modal
    const signInBtn = within(modal).getByRole("button", { name: /sign in/i });
    await user.click(signInBtn);
    expect(onNavigate).toHaveBeenCalledWith({ page: "signin" });
  });

  it("navigates to signup when 'Create account' is clicked in auth modal", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    renderStudioPage({ user: null, onNavigate });

    const goLiveBtn = screen.getByRole("button", { name: /go live/i });
    await user.click(goLiveBtn);

    const modal = screen.getByRole("dialog");
    const signUpBtn = within(modal).getByRole("button", { name: /create account/i });
    await user.click(signUpBtn);
    expect(onNavigate).toHaveBeenCalledWith({ page: "signup" });
  });

  it("closes the auth modal when 'Cancel' or the close button is clicked", async () => {
    const user = userEvent.setup();

    renderStudioPage({ user: null });

    const goLiveBtn = screen.getByRole("button", { name: /go live/i });
    await user.click(goLiveBtn);
    const modal = screen.getByRole("dialog");
    expect(modal).toBeInTheDocument();

    const cancelBtn = within(modal).getByRole("button", { name: /cancel/i });
    await user.click(cancelBtn);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the auth modal when Escape key is pressed", async () => {
    const user = userEvent.setup();

    renderStudioPage({ user: null });

    const goLiveBtn = screen.getByRole("button", { name: /go live/i });
    await user.click(goLiveBtn);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("authenticates and publishes WHIP stream when authenticated user clicks 'Go live', then ends broadcast", async () => {
    const user = userEvent.setup();
    const onSetBroadcastLive = vi.fn();

    const mockWhipSession: WhipSession = {
      sessionUrl: "http://localhost:8889/alex_dev/whip/sess_123",
      peerConnection: {} as RTCPeerConnection,
      stop: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(publishWhipStream).mockResolvedValue(mockWhipSession);

    renderStudioPage({
      user: mockUser,
      isBroadcastLive: false,
      onSetBroadcastLive,
    });

    // Check initial idle state
    expect(screen.getByText("Standby")).toBeInTheDocument();
    const goLiveBtn = screen.getByRole("button", { name: /go live/i });
    expect(goLiveBtn).toBeInTheDocument();

    // Click Go live
    await user.click(goLiveBtn);

    // Verify WHIP client called with endpoint, stream key, and captured stream
    await waitFor(() => {
      expect(publishWhipStream).toHaveBeenCalledWith(
        "http://localhost:8889/alex_dev/whip",
        mockUser.streamKey,
        expect.anything(),
      );
    });

    // Verify broadcast live state reported
    expect(onSetBroadcastLive).toHaveBeenCalledWith(true, {
      title: mockUser.channelTitle,
      category: mockUser.channelCategory,
    });

    // Verify End broadcast button appears
    const endBroadcastBtn = await screen.findByRole("button", { name: /end broadcast/i });
    expect(endBroadcastBtn).toBeInTheDocument();

    // Click End broadcast
    await user.click(endBroadcastBtn);

    // Verify whipSession.stop() called
    await waitFor(() => {
      expect(mockWhipSession.stop).toHaveBeenCalled();
    });

    // Verify broadcast ended
    await waitFor(() => {
      expect(onSetBroadcastLive).toHaveBeenCalledWith(false, {
        title: mockUser.channelTitle,
        category: mockUser.channelCategory,
      });
    });

    // Verify UI returned to idle
    expect(await screen.findByRole("button", { name: /go live/i })).toBeInTheDocument();
  });

  it("handles WHIP connection error and returns to idle state", async () => {
    const user = userEvent.setup();
    vi.mocked(publishWhipStream).mockRejectedValue(new Error("WHIP server 401 Unauthorized"));

    renderStudioPage({
      user: mockUser,
      isBroadcastLive: false,
    });

    const goLiveBtn = screen.getByRole("button", { name: /go live/i });
    await user.click(goLiveBtn);

    // Should return to idle Go live button
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /go live/i })).toBeInTheDocument();
    });
  });

  it("enforces single video and audio track publishStream when going live", async () => {
    const user = userEvent.setup();
    const mockWhipSession: WhipSession = {
      sessionUrl: "http://localhost:8889/alex_dev/whip/sess_123",
      peerConnection: {} as RTCPeerConnection,
      stop: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(publishWhipStream).mockResolvedValue(mockWhipSession);

    renderStudioPage({
      user: mockUser,
      isBroadcastLive: false,
    });

    const goLiveBtn = screen.getByRole("button", { name: /go live/i });
    await user.click(goLiveBtn);

    await waitFor(() => {
      expect(publishWhipStream).toHaveBeenCalled();
    });

    const publishedStream = vi.mocked(publishWhipStream).mock.calls[0]![2] as MediaStream;
    expect(publishedStream.getVideoTracks().length).toBeLessThanOrEqual(1);
    expect(publishedStream.getAudioTracks().length).toBeLessThanOrEqual(1);
  });

  it("enforces single video and audio track publishStream when going live with camera active and multi-track media", async () => {
    const user = userEvent.setup();
    const mockWhipSession: WhipSession = {
      sessionUrl: "http://localhost:8889/alex_dev/whip/sess_123",
      peerConnection: {} as RTCPeerConnection,
      stop: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(publishWhipStream).mockResolvedValue(mockWhipSession);

    renderStudioPage({
      user: mockUser,
      isBroadcastLive: false,
    });

    // Toggle Camera on
    const cameraBtn = screen.getByRole("button", { name: /^camera$/i });
    await user.click(cameraBtn);

    // Click Go Live
    const goLiveBtn = screen.getByRole("button", { name: /go live/i });
    await user.click(goLiveBtn);

    await waitFor(() => {
      expect(publishWhipStream).toHaveBeenCalled();
    });

    const publishedStream = vi.mocked(publishWhipStream).mock.calls[0]![2] as MediaStream;
    expect(publishedStream.getVideoTracks().length).toBeLessThanOrEqual(1);
    expect(publishedStream.getAudioTracks().length).toBeLessThanOrEqual(1);
  });

  it("attaches muted audio track when going live while microphone is muted so live unmuting works", async () => {
    const user = userEvent.setup();
    const mockWhipSession: WhipSession = {
      sessionUrl: "http://localhost:8889/alex_dev/whip/sess_123",
      peerConnection: {} as RTCPeerConnection,
      stop: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(publishWhipStream).mockResolvedValue(mockWhipSession);

    renderStudioPage({
      user: mockUser,
      isBroadcastLive: false,
    });

    // Mute microphone
    const micBtn = screen.getByRole("button", { name: /mic active/i });
    await user.click(micBtn);

    // Click Go Live
    const goLiveBtn = screen.getByRole("button", { name: /go live/i });
    await user.click(goLiveBtn);

    await waitFor(() => {
      expect(publishWhipStream).toHaveBeenCalled();
    });

    const publishedStream = vi.mocked(publishWhipStream).mock.calls[0]![2] as MediaStream;
    expect(publishedStream.getVideoTracks().length).toBeLessThanOrEqual(1);
    // Audio track must still be present, but disabled (muted)
    expect(publishedStream.getAudioTracks().length).toBe(1);
    expect(publishedStream.getAudioTracks()[0]?.enabled).toBe(false);
  });

  it("toggleCamera requests video: true, audio: false to prevent duplicate mic track capture", async () => {
    const user = userEvent.setup();

    renderStudioPage({
      user: mockUser,
      isBroadcastLive: false,
    });

    const cameraBtn = screen.getByRole("button", { name: /^camera$/i });
    await user.click(cameraBtn);

    // Verify getUserMedia was called for camera with audio: false
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: true,
      audio: false,
    });
  });

  it("supports OBS Studio RTMP mode and synchronizes with WebSocket stream.status events", async () => {
    const user = userEvent.setup();
    const onSetBroadcastLive = vi.fn();

    renderStudioPage({
      user: mockUser,
      isBroadcastLive: false,
      onSetBroadcastLive,
    });

    // Switch to OBS Studio (RTMP) mode
    const obsTab = screen.getByRole("button", { name: /obs studio \(rtmp\)/i });
    await user.click(obsTab);

    // Verify RTMP Server URL and Stream Key are displayed
    expect(screen.getByLabelText("RTMP Server URL")).toHaveValue("rtmp://localhost:1935/alex_dev");
    expect(screen.getByLabelText("Stream Key")).toHaveValue(mockUser.streamKey);

    // Verify offline waiting state
    expect(screen.getByText("Waiting for OBS")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /waiting for obs stream\.\.\./i })).toBeInTheDocument();

    // Verify WebSocket connected to /ws/live
    expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    const liveSocket = MockWebSocket.instances.find((ws) => ws.url.includes("/ws/live"))!;
    expect(liveSocket).toBeDefined();
    expect(liveSocket.url).toContain("/ws/live");

    // Simulate incoming stream.status: live frame for this channel
    act(() => {
      liveSocket.emitMessage({
        type: "stream.status",
        payload: {
          channelId: "alex_dev",
          status: "live",
          updatedAt: new Date().toISOString(),
        },
      });
    });

    // Verify transition to LIVE
    await waitFor(() => {
      expect(onSetBroadcastLive).toHaveBeenCalledWith(true, expect.anything());
    });
    expect(screen.getByRole("button", { name: /live · 00:00:00/i })).toBeInTheDocument();

    // Simulate incoming stream.status: offline frame
    act(() => {
      liveSocket.emitMessage({
        type: "stream.status",
        payload: {
          channelId: "alex_dev",
          status: "offline",
          updatedAt: new Date().toISOString(),
        },
      });
    });

    // Verify transition back to offline
    await waitFor(() => {
      expect(onSetBroadcastLive).toHaveBeenCalledWith(false, expect.anything());
    });
    expect(screen.getByRole("button", { name: /waiting for obs stream\.\.\./i })).toBeInTheDocument();
  });

  it("copies RTMP Server URL and Stream Key to clipboard in OBS mode", async () => {
    renderStudioPage({
      user: mockUser,
      isBroadcastLive: false,
    });

    // Switch to OBS mode
    const obsTab = screen.getByRole("button", { name: /obs studio \(rtmp\)/i });
    fireEvent.click(obsTab);

    // Copy RTMP Server URL
    const copyBtns = screen.getAllByRole("button", { name: /copy/i });
    await act(async () => {
      fireEvent.click(copyBtns[0]!);
    });
    expect(writeTextMock).toHaveBeenCalledWith("rtmp://localhost:1935/alex_dev");
  });

  it("saves updated title and category metadata", async () => {
    const user = userEvent.setup();
    const { authValue } = renderStudioPage({
      user: mockUser,
    });

    const titleInput = screen.getByLabelText(/stream title/i);
    await user.clear(titleInput);
    await user.type(titleInput, "New High Performance Broadcast");

    const saveBtn = screen.getByRole("button", { name: /save title & category/i });
    await user.click(saveBtn);

    expect(authValue.updateChannelSettings).toHaveBeenCalledWith({
      channelTitle: "New High Performance Broadcast",
      channelCategory: "Programming",
    });
  });

  it("renders high-contrast End broadcast button with green live dot when live, and white dot when not live", () => {
    // 1. Not live
    const { unmount } = renderStudioPage({
      user: mockUser,
      isBroadcastLive: false,
    });

    const goLiveBtn = screen.getByRole("button", { name: /go live/i });
    expect(goLiveBtn).toHaveClass("bg-blue-600");
    const whiteDot = goLiveBtn.querySelector(".bg-white");
    expect(whiteDot).toBeInTheDocument();

    unmount();

    // 2. Live
    renderStudioPage({
      user: mockUser,
      isBroadcastLive: true,
    });

    const endBroadcastBtn = screen.getByRole("button", { name: /end broadcast/i });
    expect(endBroadcastBtn).toHaveClass("bg-red-600");
    expect(endBroadcastBtn).toHaveClass("text-white");
    const greenDot = endBroadcastBtn.querySelector(".bg-emerald-400");
    expect(greenDot).toBeInTheDocument();
  });

  it("removes hardcoded '1080p60 · H.264 / Opus' from studio monitor and renders blank resolution when idle", () => {
    const { container } = renderStudioPage({
      user: mockUser,
      isBroadcastLive: false,
    });

    expect(screen.queryByText(/1080p60 · H\.264 \/ Opus/i)).not.toBeInTheDocument();
    // Studio video monitor uses object-contain to preserve full screen share without cropping
    const video = container.querySelector("video");
    expect(video).toHaveClass("object-contain");
  });

  it("renders voice-reactive avatar banner with glowing pulse halo when camera and screen are off", () => {
    renderStudioPage({
      user: mockUser,
      isBroadcastLive: false,
    });

    // Check banner presence
    const banner = screen.getByTestId("studio-banner");
    expect(banner).toBeInTheDocument();

    // Check display name, username, and stream title
    expect(within(banner).getByText(mockUser.displayName)).toBeInTheDocument();
    expect(within(banner).getAllByText(`@${mockUser.username}`).length).toBeGreaterThan(0);
    expect(within(banner).getByText(mockUser.channelTitle)).toBeInTheDocument();

    // Check 1280x720 canvas used for WHIP video feed
    const canvas = screen.getByTestId("studio-banner-canvas");
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute("width", "1280");
    expect(canvas).toHaveAttribute("height", "720");

    // Check glowing halo around avatar circle
    const halo = screen.getByTestId("broadcaster-avatar-halo");
    expect(halo).toBeInTheDocument();
    expect(halo).toHaveAttribute("data-mic-active", "true");
    expect(halo).toHaveAttribute("data-talking", "false");
  });

  it("dynamically stops the glowing pulse effect when microphone is muted", async () => {
    const user = userEvent.setup();

    renderStudioPage({
      user: mockUser,
      isBroadcastLive: false,
    });

    const halo = screen.getByTestId("broadcaster-avatar-halo");
    expect(halo).toHaveAttribute("data-mic-active", "true");

    // Toggle mic off
    const micBtn = screen.getByRole("button", { name: /mic active/i });
    await user.click(micBtn);

    // Halo should now reflect mic inactive
    expect(halo).toHaveAttribute("data-mic-active", "false");
    expect(screen.getByRole("button", { name: /mic muted/i })).toBeInTheDocument();
  });

  it("updates voice-reactive glowing halo and renders speaking badge when user speaks", async () => {
    // Provide a FakeAudioContext that simulates loud vocal speech
    const fakeAnalyser = {
      fftSize: 256,
      smoothingTimeConstant: 0.5,
      frequencyBinCount: 128,
      getByteFrequencyData: vi.fn((arr: Uint8Array) => arr.fill(190)),
      disconnect: vi.fn(),
    };
    const fakeSource = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    class FakeAudioContext {
      state = "running";
      createMediaStreamSource = vi.fn().mockReturnValue(fakeSource);
      createAnalyser = vi.fn().mockReturnValue(fakeAnalyser);
      close = vi.fn().mockResolvedValue(undefined);
      resume = vi.fn().mockResolvedValue(undefined);
    }

    const origAudioContext = window.AudioContext;
    // @ts-expect-error mock AudioContext
    window.AudioContext = FakeAudioContext;

    renderStudioPage({
      user: mockUser,
      isBroadcastLive: false,
    });

    const halo = screen.getByTestId("broadcaster-avatar-halo");
    expect(halo).toHaveAttribute("data-mic-active", "true");

    // Wait for the animation frame audio polling to update state with voice detection
    await waitFor(
      () => {
        expect(halo).toHaveAttribute("data-talking", "true");
      },
      { timeout: 1500 },
    );

    // Verify speaking badge is displayed
    expect(screen.getByTestId("talking-badge")).toHaveTextContent("Speaking");
    expect(screen.getByText("Mic live (Speaking)")).toBeInTheDocument();

    window.AudioContext = origAudioContext;
  });

  it("seamlessly transitions active WHIP broadcast to banner canvas track when camera is turned off", async () => {
    const user = userEvent.setup();
    const replaceTrackMock = vi.fn().mockResolvedValue(undefined);
    const mockSender = {
      track: { kind: "video" } as MediaStreamTrack,
      replaceTrack: replaceTrackMock,
    };
    const mockPeerConnection = {
      getSenders: vi.fn().mockReturnValue([mockSender]),
    } as unknown as RTCPeerConnection;

    const mockWhipSession: WhipSession = {
      sessionUrl: "http://localhost:8889/alex_dev/whip/sess_456",
      peerConnection: mockPeerConnection,
      stop: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(publishWhipStream).mockResolvedValue(mockWhipSession);

    renderStudioPage({
      user: mockUser,
      isBroadcastLive: false,
    });

    // 1. Turn on camera first
    const camBtn = screen.getByRole("button", { name: /^camera$/i });
    await user.click(camBtn);

    // 2. Start broadcast while camera is on
    const goLiveBtn = screen.getByRole("button", { name: /go live/i });
    await user.click(goLiveBtn);

    // Wait until live
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /end broadcast/i })).toBeInTheDocument();
    });

    // 3. Turn off camera during active broadcast
    const camActiveBtn = screen.getByRole("button", { name: /camera on/i });
    await user.click(camActiveBtn);

    // Verify replaceTrack was invoked with the banner canvas track
    expect(replaceTrackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "video",
      }),
    );

    // Verify banner is now visible in studio preview
    expect(screen.getByTestId("studio-banner")).toBeInTheDocument();
  });

  it("displays broadcaster avatar, name, and offline indicator on studio screen when stream is offline, without any TV icon", () => {
    renderStudioPage({
      user: {
        ...mockUser,
        displayName: "Alex Rivera",
        avatarUrl: "https://res.cloudinary.com/demo/image/upload/v1/VeloStream/avatar/alex.png",
      },
      isBroadcastLive: false,
    });

    const studioBanner = screen.getByTestId("studio-banner");
    expect(studioBanner).toBeInTheDocument();

    // Broadcaster avatar image rendered
    const avatarImg = within(studioBanner).getByAltText(/Alex Rivera profile avatar/i);
    expect(avatarImg).toBeInTheDocument();
    expect(avatarImg).toHaveAttribute("src", "https://res.cloudinary.com/demo/image/upload/v1/VeloStream/avatar/alex.png");

    // Broadcaster name & handle rendered
    expect(within(studioBanner).getByRole("heading", { name: "Alex Rivera" })).toBeInTheDocument();
    expect(within(studioBanner).getAllByText("@alex_dev").length).toBeGreaterThan(0);

    // Offline indicator rendered with "User is currently offline"
    const offlineIndicator = within(studioBanner).getByTestId("studio-offline-indicator");
    expect(offlineIndicator).toHaveTextContent("User is currently offline");
    expect(offlineIndicator).toHaveAttribute("aria-label", "Broadcaster is offline");

    // No TV icon rendered on the screen
    expect(studioBanner.querySelector("svg")).not.toBeInTheDocument();
  });

  it("gracefully falls back to initials in studio preview when broadcaster avatar image fails to load", () => {
    renderStudioPage({
      user: {
        ...mockUser,
        displayName: "Ada Lovelace",
        avatarUrl: "https://example.com/broken-avatar.png",
      },
      isBroadcastLive: false,
    });

    const studioBanner = screen.getByTestId("studio-banner");
    expect(studioBanner).toBeInTheDocument();

    const avatarImg = within(studioBanner).getByAltText(/Ada Lovelace profile avatar/i);
    expect(avatarImg).toBeInTheDocument();

    // Trigger image error
    fireEvent.error(avatarImg);

    // Falls back to initials AL extracted from Ada Lovelace
    const avatar = within(studioBanner).getByTestId("studio-broadcaster-avatar");
    expect(avatar).toHaveTextContent("AL");
    expect(within(studioBanner).queryByAltText(/Ada Lovelace profile avatar/i)).not.toBeInTheDocument();
  });

  it("restores camera access automatically on mount when remembered in cookie across reboot", async () => {
    // Simulate user previously granted camera before reboot
    setStudioPermissionsCookie({ camera: true, cameraGranted: true, mic: true }, mockUser.username);

    renderStudioPage({ user: mockUser });

    // Camera button should immediately reflect active state
    expect(screen.getByRole("button", { name: /camera on/i })).toBeInTheDocument();

    // Verify getUserMedia was automatically invoked for video preview without user re-clicking button
    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        video: true,
        audio: false,
      });
    });
  });

  it("restores muted microphone state on mount without calling getUserMedia when mic was remembered as muted", async () => {
    // Simulate user had muted microphone before reboot
    setStudioPermissionsCookie({ mic: false, camera: false }, mockUser.username);

    renderStudioPage({ user: mockUser });

    // Microphone button should show muted state
    expect(screen.getByRole("button", { name: /mic muted/i })).toBeInTheDocument();

    // Verify audio getUserMedia was not triggered for preview
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalledWith({
      audio: true,
      video: false,
    });
  });

  it("persists camera granting to cookie when camera is toggled on and off", async () => {
    const user = userEvent.setup();
    renderStudioPage({ user: mockUser });

    // Initial state: camera is off, no cookie
    const cameraBtn = screen.getByRole("button", { name: /^camera$/i });
    await user.click(cameraBtn);

    // Camera is turned on -> cookie saved with camera: true, cameraGranted: true
    const cookieAfterOn = getStudioPermissionsCookie(mockUser.username);
    expect(cookieAfterOn?.camera).toBe(true);
    expect(cookieAfterOn?.cameraGranted).toBe(true);

    // Toggle camera off -> cookie updated with camera: false, cameraGranted: true
    const cameraOnBtn = screen.getByRole("button", { name: /camera on/i });
    await user.click(cameraOnBtn);

    const cookieAfterOff = getStudioPermissionsCookie(mockUser.username);
    expect(cookieAfterOff?.camera).toBe(false);
    expect(cookieAfterOff?.cameraGranted).toBe(true);
  });

  it("persists microphone toggle changes to cookie", async () => {
    const user = userEvent.setup();
    renderStudioPage({ user: mockUser });

    // Initial state: mic is active by default -> cookie is saved with mic: true
    await waitFor(() => {
      expect(getStudioPermissionsCookie(mockUser.username)?.mic).toBe(true);
    });

    // Mute mic
    const micBtn = screen.getByRole("button", { name: /mic active/i });
    await user.click(micBtn);

    expect(getStudioPermissionsCookie(mockUser.username)?.mic).toBe(false);

    // Unmute mic
    const micMutedBtn = screen.getByRole("button", { name: /mic muted/i });
    await user.click(micMutedBtn);

    expect(getStudioPermissionsCookie(mockUser.username)?.mic).toBe(true);
  });

  it("remembers user-specific media grantings when logging into studio", async () => {
    const userBob: UserAccount = {
      ...mockUser,
      id: "usr_bob",
      username: "streamer_bob",
      displayName: "Streamer Bob",
    };

    // Pre-set specific grantings for streamer_bob (camera: true, mic: false)
    setStudioPermissionsCookie(
      { camera: true, cameraGranted: true, mic: false, micGranted: true },
      userBob.username,
    );

    renderStudioPage({ user: userBob });

    // Streamer Bob should have camera on and mic muted
    expect(screen.getByRole("button", { name: /camera on/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mic muted/i })).toBeInTheDocument();
  });

  it("acquires and enables audio track when unmuting from a remembered muted state", async () => {
    const user = userEvent.setup();
    setStudioPermissionsCookie({ mic: false, camera: false }, mockUser.username);

    renderStudioPage({ user: mockUser });

    const micMutedBtn = screen.getByRole("button", { name: /mic muted/i });
    await user.click(micMutedBtn);

    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: true,
        video: false,
      });
    });

    const activeMicBtn = await screen.findByRole("button", { name: /mic active/i });
    expect(activeMicBtn).toBeInTheDocument();
    expect(mockTrack.enabled).toBe(true);
    expect(getStudioPermissionsCookie(mockUser.username)?.mic).toBe(true);
  });

  it("updates cookie with declined granting when camera permission is rejected", async () => {
    const user = userEvent.setup();
    renderStudioPage({ user: mockUser });

    // Simulate camera permission rejection on click
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
      new Error("NotAllowedError: Permission denied"),
    );

    const cameraBtn = screen.getByRole("button", { name: /^camera$/i });
    await user.click(cameraBtn);

    await waitFor(() => {
      expect(screen.getByText(/Camera permission was declined/i)).toBeInTheDocument();
    });

    const cookie = getStudioPermissionsCookie(mockUser.username);
    expect(cookie?.camera).toBe(false);
    expect(cookie?.cameraGranted).toBe(false);
  });

  it("stops camera stream tracks immediately if component unmounts while camera getUserMedia is pending", async () => {
    let resolveGetUserMedia!: (stream: MediaStream) => void;
    const pendingPromise = new Promise<MediaStream>((resolve) => {
      resolveGetUserMedia = resolve;
    });

    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation((constraints) => {
      if (constraints && typeof constraints === "object" && "video" in constraints && constraints.video) {
        return pendingPromise;
      }
      return Promise.resolve(mockMediaStream as unknown as MediaStream);
    });

    const unmountTrackStopMock = vi.fn();
    const delayedTrack = {
      id: "delayed-camera-track",
      kind: "video",
      stop: unmountTrackStopMock,
      enabled: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const delayedStream = {
      getTracks: () => [delayedTrack],
      getVideoTracks: () => [delayedTrack],
      getAudioTracks: () => [],
    } as unknown as MediaStream;

    const { unmount } = renderStudioPage({ user: mockUser });

    // User clicks camera while preview is loading
    const cameraBtn = screen.getByRole("button", { name: /^camera$/i });
    fireEvent.click(cameraBtn);

    // Component unmounts while getUserMedia is still awaiting hardware/permission response
    unmount();

    // Now getUserMedia finally resolves
    await act(async () => {
      resolveGetUserMedia(delayedStream);
      await Promise.resolve();
    });

    // Verify track was immediately stopped to prevent webcam hardware indicator remaining on
    expect(unmountTrackStopMock).toHaveBeenCalled();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(mockMediaStream as unknown as MediaStream);
  });

  it("stops audio stream tracks immediately if component unmounts while audio getUserMedia is pending", async () => {
    let resolveAudioGetUserMedia!: (stream: MediaStream) => void;
    const pendingPromise = new Promise<MediaStream>((resolve) => {
      resolveAudioGetUserMedia = resolve;
    });

    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation((constraints) => {
      if (constraints && typeof constraints === "object" && "audio" in constraints && constraints.audio) {
        return pendingPromise;
      }
      return Promise.resolve(mockMediaStream as unknown as MediaStream);
    });

    const audioTrackStopMock = vi.fn();
    const delayedAudioTrack = {
      id: "delayed-audio-track",
      kind: "audio",
      stop: audioTrackStopMock,
      enabled: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const delayedAudioStream = {
      getTracks: () => [delayedAudioTrack],
      getVideoTracks: () => [],
      getAudioTracks: () => [delayedAudioTrack],
    } as unknown as MediaStream;

    const { unmount } = renderStudioPage({ user: mockUser });

    // Component unmounts while audio getUserMedia is in flight
    unmount();

    // Audio stream resolves after unmount
    await act(async () => {
      resolveAudioGetUserMedia(delayedAudioStream);
      await Promise.resolve();
    });

    // Verify track was immediately stopped
    expect(audioTrackStopMock).toHaveBeenCalled();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(mockMediaStream as unknown as MediaStream);
  });

  it("does not reset user-toggled camera state when profile details update for the same user", async () => {
    const user = userEvent.setup();
    // User had camera: false in cookie
    setStudioPermissionsCookie({ camera: false, mic: true }, mockUser.username);

    const { rerender, authValue } = renderStudioPage({ user: mockUser });

    // User explicitly turns camera ON
    const cameraBtn = screen.getByRole("button", { name: /^camera$/i });
    await user.click(cameraBtn);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /camera on/i })).toBeInTheDocument();
    });

    // Now user saves title / category: parent rerenders with new user object with same username
    const updatedUser: UserAccount = {
      ...mockUser,
      channelTitle: "New Updated Title",
    };

    rerender(
      <AuthContext.Provider value={{ ...authValue, user: updatedUser }}>
        <StudioPage
          whipBaseUrl="http://localhost:8889"
          wsUrl="http://localhost:4000"
          onNavigate={vi.fn()}
          isBroadcastLive={false}
          onSetBroadcastLive={vi.fn()}
        />
      </AuthContext.Provider>,
    );

    // Camera must still remain active
    expect(screen.getByRole("button", { name: /camera on/i })).toBeInTheDocument();
  });
});
