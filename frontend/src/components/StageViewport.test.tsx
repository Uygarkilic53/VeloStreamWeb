import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StageViewport } from "./StageViewport";
import type { StreamDirectoryItem } from "../lib/streams";
import { saveStreamSnapshot } from "../lib/snapshots";

const mockLiveChannel: StreamDirectoryItem = {
  id: "ch_mira",
  slug: "mira_codes",
  displayName: "Mira Vance",
  title: "Building Rust Graphics Engine",
  isLive: true,
  viewerCount: 1500,
  category: "Programming",
  subCategory: "Rust",
  tags: ["rust", "graphics"],
  uptime: "01:23:45",
  quality: "1080p60",
  ingestProtocol: "WebRTC WHIP",
  followersLabel: "10k",
  bio: "Rust graphics engineer",
  schedule: [],
  scene: "rust",
  avatarInitials: "MV",
  avatarAccent: "#2563EB",
};

const mockOfflineChannel: StreamDirectoryItem = {
  ...mockLiveChannel,
  isLive: false,
};

describe("StageViewport component", () => {
  it("automatically renders live video with autoPlay and object-contain by default when channel is live", () => {
    const { container } = render(
      <StageViewport
        hlsBaseUrl="http://localhost:8888"
        channel={mockLiveChannel}
        theaterMode={false}
        onToggleTheater={vi.fn()}
      />,
    );

    const video = container.querySelector("video");
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("playsinline");
    expect(video).toHaveClass("object-contain");
    // Does not render offline screen
    expect(screen.queryByText(/user is currently offline/i)).not.toBeInTheDocument();
  });

  it("renders offline screen with broadcaster avatar and name on top of offline indicator instead of TvIcon", () => {
    saveStreamSnapshot("mira_codes", "data:image/jpeg;base64,previous_mira_snapshot");

    const { container } = render(
      <StageViewport
        hlsBaseUrl="http://localhost:8888"
        channel={mockOfflineChannel}
        theaterMode={false}
        onToggleTheater={vi.fn()}
      />,
    );

    // 1. Offline screen container is rendered
    const offlineScreen = screen.getByTestId("stage-offline-screen");
    expect(offlineScreen).toBeInTheDocument();

    // 2. Broadcaster avatar with initials fallback is rendered on top
    const avatar = screen.getByTestId("stage-offline-avatar");
    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveTextContent("MV");

    // 3. Broadcaster display name and handle are rendered above the offline indicator
    expect(screen.getByRole("heading", { name: "Mira Vance" })).toBeInTheDocument();
    expect(screen.getByText("@mira_codes")).toBeInTheDocument();

    // 4. "User is currently offline" indicator is rendered below avatar and name
    expect(screen.getByText(/user is currently offline/i)).toBeInTheDocument();

    // 5. TvIcon is NOT rendered in the offline screen
    expect(offlineScreen.querySelector("svg")).not.toBeInTheDocument();

    // 6. Previous stream snapshot image is preserved
    const snapshotImg = screen.getByAltText(/previous stream snapshot/i);
    expect(snapshotImg).toBeInTheDocument();
    expect(snapshotImg).toHaveAttribute("src", "data:image/jpeg;base64,previous_mira_snapshot");

    // 7. Video tag is not rendered
    expect(container.querySelector("video")).not.toBeInTheDocument();
  });

  it("renders offline screen displaying image avatar when avatarUrl is provided", () => {
    const channelWithAvatar: StreamDirectoryItem = {
      ...mockOfflineChannel,
      avatarUrl: "https://res.cloudinary.com/demo/image/upload/v1/VeloStream/avatar/mira.png",
    };

    render(
      <StageViewport
        hlsBaseUrl="http://localhost:8888"
        channel={channelWithAvatar}
        theaterMode={false}
        onToggleTheater={vi.fn()}
      />,
    );

    const offlineScreen = screen.getByTestId("stage-offline-screen");
    expect(offlineScreen).toBeInTheDocument();

    // Image avatar is rendered with correct alt and src
    const avatarImg = screen.getByAltText("Mira Vance avatar");
    expect(avatarImg).toBeInTheDocument();
    expect(avatarImg).toHaveAttribute("src", channelWithAvatar.avatarUrl);

    // Broadcaster name is rendered on top of offline indicator
    expect(screen.getByRole("heading", { name: "Mira Vance" })).toBeInTheDocument();
    expect(screen.getByText(/user is currently offline/i)).toBeInTheDocument();

    // TvIcon is NOT rendered in the offline screen
    expect(offlineScreen.querySelector("svg")).not.toBeInTheDocument();
  });

  it("gracefully falls back to initials when avatar image fails to load via onError", () => {
    const channelWithFailingAvatar: StreamDirectoryItem = {
      ...mockOfflineChannel,
      avatarInitials: "",
      displayName: "Sarah Connor",
      avatarUrl: "https://example.com/broken-avatar.png",
      avatarAccent: "#10B981",
    };

    render(
      <StageViewport
        hlsBaseUrl="http://localhost:8888"
        channel={channelWithFailingAvatar}
        theaterMode={false}
        onToggleTheater={vi.fn()}
      />,
    );

    const offlineScreen = screen.getByTestId("stage-offline-screen");
    expect(offlineScreen).toBeInTheDocument();

    const avatarImg = screen.getByAltText("Sarah Connor avatar");
    expect(avatarImg).toBeInTheDocument();

    // Trigger image loading failure
    fireEvent.error(avatarImg);

    // Image is replaced by initials fallback extracted from multi-word displayName
    const avatar = screen.getByTestId("stage-offline-avatar");
    expect(avatar).toHaveTextContent("SC");
    expect(avatar.querySelector("div")).toHaveStyle({ backgroundColor: "#10B981" });
    expect(screen.queryByAltText("Sarah Connor avatar")).not.toBeInTheDocument();
  });

  it("extracts clean initials from multi-word display name when avatarInitials is not set", () => {
    const channelWithoutInitials: StreamDirectoryItem = {
      ...mockOfflineChannel,
      avatarInitials: "",
      displayName: "Ada Lovelace",
      avatarUrl: null,
    };

    render(
      <StageViewport
        hlsBaseUrl="http://localhost:8888"
        channel={channelWithoutInitials}
        theaterMode={false}
        onToggleTheater={vi.fn()}
      />,
    );

    const avatar = screen.getByTestId("stage-offline-avatar");
    expect(avatar).toHaveTextContent("AL");
    expect(screen.getByRole("heading", { name: "Ada Lovelace" })).toBeInTheDocument();
  });

  it("allows user to toggle between live stream and preview thumbnail via stage control button", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <StageViewport
        hlsBaseUrl="http://localhost:8888"
        channel={mockLiveChannel}
        theaterMode={false}
        onToggleTheater={vi.fn()}
      />,
    );

    // Initial state: video is rendered, button shows "Show preview"
    expect(container.querySelector("video")).toBeInTheDocument();
    const toggleBtn = screen.getByRole("button", { name: /show preview/i });
    expect(toggleBtn).toBeInTheDocument();

    // Click "Show preview" -> video is unmounted, thumbnail is displayed
    await user.click(toggleBtn);
    expect(container.querySelector("video")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /attach live hls/i })).toBeInTheDocument();

    // Click "Attach live HLS" -> video is restored
    await user.click(screen.getByRole("button", { name: /attach live hls/i }));
    expect(container.querySelector("video")).toBeInTheDocument();
  });

  it("attempts WHEP playback as primary real-time player when channel is live", async () => {
    const originalRTCPeerConnection = globalThis.RTCPeerConnection;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.RTCPeerConnection = vi.fn() as any;

    const whepModule = await import("../lib/whep");
    const mockStop = vi.fn().mockResolvedValue(undefined);
    const whepSpy = vi.spyOn(whepModule, "playWhepStream").mockResolvedValue({
      sessionUrl: "http://localhost:8889/mira_codes/whep/sess123",
      peerConnection: {} as RTCPeerConnection,
      stream: {} as MediaStream,
      stop: mockStop,
    });

    const { container, unmount } = render(
      <StageViewport
        hlsBaseUrl="http://localhost:8888"
        whepBaseUrl="http://localhost:8889"
        channel={mockLiveChannel}
        theaterMode={false}
        onToggleTheater={vi.fn()}
      />,
    );

    expect(container.querySelector("video")).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(whepSpy).toHaveBeenCalledWith(
        "http://localhost:8889/mira_codes/whep",
        expect.any(Function),
      );
    });

    // Wait a tick for whepSession assignment
    await new Promise((r) => setTimeout(r, 10));

    unmount();
    expect(mockStop).toHaveBeenCalled();
    whepSpy.mockRestore();
    globalThis.RTCPeerConnection = originalRTCPeerConnection;
  });

  it("displays real mirrored resolution in top-right corner badge and updates when real video dimensions are decoded", () => {
    const { container } = render(
      <StageViewport
        hlsBaseUrl="http://localhost:8888"
        channel={mockLiveChannel}
        theaterMode={false}
        onToggleTheater={vi.fn()}
      />,
    );

    // Initial badge renders fallback channel quality
    const badge = screen.getByTestId("stage-resolution-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("1080p60");

    // Simulate video element decoding 1280x720 frames (e.g. Banner feed or 720p stream)
    const video = container.querySelector("video")!;
    Object.defineProperty(video, "videoWidth", { value: 1280, configurable: true });
    Object.defineProperty(video, "videoHeight", { value: 720, configurable: true });

    fireEvent.loadedMetadata(video);

    // Badge updates to real mirrored resolution 1280x720 instead of hardcoded 1080p
    expect(badge).toHaveTextContent("1280x720");
  });

  it("renders resolution settings button with Auto selected by default and toggles menu on click", async () => {
    const user = userEvent.setup();
    render(
      <StageViewport
        hlsBaseUrl="http://localhost:8888"
        channel={mockLiveChannel}
        theaterMode={false}
        onToggleTheater={vi.fn()}
      />,
    );

    const resBtn = screen.getByTestId("stage-resolution-button");
    expect(resBtn).toBeInTheDocument();
    expect(resBtn).toHaveTextContent(/Auto/i);
    expect(resBtn).toHaveAttribute("aria-expanded", "false");

    // Menu initially hidden
    expect(screen.queryByTestId("stage-resolution-menu")).not.toBeInTheDocument();

    // Click button -> menu opens
    await user.click(resBtn);
    expect(resBtn).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByTestId("stage-resolution-menu");
    expect(menu).toBeInTheDocument();

    // Contains Quality heading and Auto option
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /Auto/i })).toBeInTheDocument();

    // Contains options ladder: 1080p (Source), 720p, 480p, 360p
    expect(screen.getByRole("menuitemradio", { name: /1080p \(Source\)/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /720p/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /480p/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /360p/i })).toBeInTheDocument();
  });

  it("filters resolution options starting from 720p Source down to 360p when channel stream is 720p", async () => {
    const user = userEvent.setup();
    const channel720p: StreamDirectoryItem = {
      ...mockLiveChannel,
      quality: "1280x720 · Banner Feed",
    };

    render(
      <StageViewport
        hlsBaseUrl="http://localhost:8888"
        channel={channel720p}
        theaterMode={false}
        onToggleTheater={vi.fn()}
      />,
    );

    const resBtn = screen.getByTestId("stage-resolution-button");
    await user.click(resBtn);

    // 1080p must be excluded because source stream is 720p
    expect(screen.queryByRole("menuitemradio", { name: /1080p/i })).not.toBeInTheDocument();

    // 720p must be labeled as Source
    expect(screen.getByRole("menuitemradio", { name: /720p \(Source\)/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /480p/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /360p/i })).toBeInTheDocument();
  });

  it("allows viewer to select a lower resolution tier (e.g. 720p), updates button and mirrored resolution badge", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <StageViewport
        hlsBaseUrl="http://localhost:8888"
        channel={mockLiveChannel}
        theaterMode={false}
        onToggleTheater={vi.fn()}
      />,
    );

    // Simulate 1080p stream
    const video = container.querySelector("video")!;
    Object.defineProperty(video, "videoWidth", { value: 1920, configurable: true });
    Object.defineProperty(video, "videoHeight", { value: 1080, configurable: true });
    fireEvent.loadedMetadata(video);

    const badge = screen.getByTestId("stage-resolution-badge");
    expect(badge).toHaveTextContent("1920x1080");

    // Open resolution menu and pick 720p
    const resBtn = screen.getByTestId("stage-resolution-button");
    await user.click(resBtn);

    const opt720p = screen.getByRole("menuitemradio", { name: /720p/i });
    await user.click(opt720p);

    // Menu closes after selection
    expect(screen.queryByTestId("stage-resolution-menu")).not.toBeInTheDocument();

    // Button updates to 720p
    expect(resBtn).toHaveTextContent("720p");

    // Badge mirrors the user-selected resolution (1280x720)
    expect(badge).toHaveTextContent("1280x720");
  });

  it("closes resolution settings menu when Escape key is pressed", async () => {
    const user = userEvent.setup();
    render(
      <StageViewport
        hlsBaseUrl="http://localhost:8888"
        channel={mockLiveChannel}
        theaterMode={false}
        onToggleTheater={vi.fn()}
      />,
    );

    const resBtn = screen.getByTestId("stage-resolution-button");
    await user.click(resBtn);
    expect(screen.getByTestId("stage-resolution-menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("stage-resolution-menu")).not.toBeInTheDocument();
  });

  it("closes resolution settings menu when clicking outside the menu", async () => {
    const user = userEvent.setup();
    render(
      <StageViewport
        hlsBaseUrl="http://localhost:8888"
        channel={mockLiveChannel}
        theaterMode={false}
        onToggleTheater={vi.fn()}
      />,
    );

    const resBtn = screen.getByTestId("stage-resolution-button");
    await user.click(resBtn);
    expect(screen.getByTestId("stage-resolution-menu")).toBeInTheDocument();

    // Click outside
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId("stage-resolution-menu")).not.toBeInTheDocument();
  });

  it("reconciles selected resolution back to auto if stream source resolution drops below selection", async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(
      <StageViewport
        hlsBaseUrl="http://localhost:8888"
        channel={mockLiveChannel}
        theaterMode={false}
        onToggleTheater={vi.fn()}
      />,
    );

    // Initial 1080p stream
    const video = container.querySelector("video")!;
    Object.defineProperty(video, "videoWidth", { value: 1920, configurable: true });
    Object.defineProperty(video, "videoHeight", { value: 1080, configurable: true });
    fireEvent.loadedMetadata(video);

    // User selects 1080p
    const resBtn = screen.getByTestId("stage-resolution-button");
    await user.click(resBtn);
    const opt1080p = screen.getByRole("menuitemradio", { name: /^1080p/i });
    await user.click(opt1080p);
    expect(resBtn).toHaveTextContent("1080p");

    // Stream drops or switches to 720p channel where 1080p is unavailable
    const channel720p: StreamDirectoryItem = {
      ...mockLiveChannel,
      slug: "stream_720p",
      quality: "1280x720 · Banner Feed",
    };

    rerender(
      <StageViewport
        hlsBaseUrl="http://localhost:8888"
        channel={channel720p}
        theaterMode={false}
        onToggleTheater={vi.fn()}
      />,
    );

    // Selected resolution must automatically reset to auto rather than staying stuck on 1080p
    expect(resBtn).toHaveTextContent(/Auto/i);
  });

  it("mirrors real stream frame rate in top-right resolution badge when fps is present", () => {
    const channelWithFps: StreamDirectoryItem = {
      ...mockLiveChannel,
      quality: "1080p60",
    };

    const { container } = render(
      <StageViewport
        hlsBaseUrl="http://localhost:8888"
        channel={channelWithFps}
        theaterMode={false}
        onToggleTheater={vi.fn()}
      />,
    );

    const video = container.querySelector("video")!;
    Object.defineProperty(video, "videoWidth", { value: 1280, configurable: true });
    Object.defineProperty(video, "videoHeight", { value: 720, configurable: true });
    fireEvent.loadedMetadata(video);

    const badge = screen.getByTestId("stage-resolution-badge");
    // Displays decoded dimensions with nominal/measured 60fps
    expect(badge).toHaveTextContent("1280x720 @ 60fps");
  });
});
