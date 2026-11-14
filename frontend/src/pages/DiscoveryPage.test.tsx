import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue, type UserAccount } from "../lib/auth";
import { saveStreamSnapshot } from "../lib/snapshots";
import { DiscoveryPage } from "./DiscoveryPage";

function renderWithAuth(ui: React.ReactElement, authOverrides: Partial<AuthContextValue> = {}) {
  const defaultAuth: AuthContextValue = {
    user: null,
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
    ...authOverrides,
  };

  return render(
    <AuthContext.Provider value={defaultAuth}>{ui}</AuthContext.Provider>,
  );
}

describe("DiscoveryPage - Live Channels & Dynamic Following", () => {
  it("renders 'No live broadcasts right now' on homepage when streams list is empty", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    renderWithAuth(
      <DiscoveryPage
        streams={[]}
        activeCategory="All Live"
        onSelectCategory={vi.fn()}
        searchQuery=""
        onClearSearch={vi.fn()}
        onlyFollowing={false}
        onNavigate={onNavigate}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /no live broadcasts right now/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/nobody is currently streaming on velostream/i)).toBeInTheDocument();

    const startStreamingBtns = screen.getAllByRole("button", { name: /start streaming/i });
    expect(startStreamingBtns.length).toBeGreaterThan(0);
    await user.click(startStreamingBtns[0]!);
    expect(onNavigate).toHaveBeenCalledWith({ page: "studio" });
  });

  it("renders 'No live broadcasts right now' on homepage when streams list is empty even if specific category is selected", async () => {
    const onNavigate = vi.fn();

    renderWithAuth(
      <DiscoveryPage
        streams={[]}
        activeCategory="Gaming"
        onSelectCategory={vi.fn()}
        searchQuery=""
        onClearSearch={vi.fn()}
        onlyFollowing={false}
        onNavigate={onNavigate}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /no live broadcasts right now/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/nobody is currently streaming on velostream/i)).toBeInTheDocument();
  });

  it("renders prompt to sign in on Following page when not signed in", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    renderWithAuth(
      <DiscoveryPage
        streams={[]}
        activeCategory="All Live"
        onSelectCategory={vi.fn()}
        searchQuery=""
        onClearSearch={vi.fn()}
        onlyFollowing={true}
        onNavigate={onNavigate}
      />,
      { user: null },
    );

    expect(screen.getByRole("heading", { name: /^following$/i })).toBeInTheDocument();
    expect(screen.getByText(/follow your favorite creators/i)).toBeInTheDocument();

    const signInBtn = screen.getAllByRole("button", { name: /^sign in$/i })[0];
    if (signInBtn) {
      await user.click(signInBtn);
      expect(onNavigate).toHaveBeenCalledWith({ page: "signin" });
    }
  });

  it("renders Following page dynamically with followed users and live streams when signed in", async () => {
    const mockUser: UserAccount = {
      id: "usr_10",
      username: "deniz_k",
      displayName: "Deniz Kaya",
      email: "deniz@velostream.dev",
      bio: "Engineer",
      avatarUrl: null,
      role: "CREATOR",
      theme: "light",
      channelTitle: "Deniz Stream",
      channelCategory: "Programming",
      streamKey: "live_deniz_stream_key",
      slowMode: false,
      bannedUsers: [],
      bannedFromSlugs: [],
      followedSlugs: ["mira_codes", "offline_bob"],
      accessToken: "mock-jwt-token",
      sessionKind: "backend",
    };

    const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/v1/users/me/following")) {
        return {
          ok: true,
          json: async () => ({
            following: [
              {
                id: "usr_mira",
                username: "mira_codes",
                displayName: "Mira Codes",
                avatarUrl: null,
                bio: "Rust graphics engine",
                isLive: true,
                channelTitle: "Rust live shaders",
                channelCategory: "Programming",
              },
              {
                id: "usr_bob",
                username: "offline_bob",
                displayName: "Bob Gamer",
                avatarUrl: null,
                bio: "Variety gamer",
                isLive: false,
                channelTitle: "Weekend Gaming",
                channelCategory: "Gaming",
              },
            ],
          }),
        };
      }
      return { ok: false };
    });
    vi.stubGlobal("fetch", fetchSpy);

    const toggleFollow = vi.fn().mockResolvedValue({
      ok: true,
      message: "Unfollowed @offline_bob.",
    });

    renderWithAuth(
      <DiscoveryPage
        streams={[
          {
            id: "ch_mira",
            slug: "mira_codes",
            displayName: "Mira Codes",
            title: "Rust live shaders",
            category: "Programming",
            subCategory: "Vulkan",
            viewerCount: 42,
            uptime: "1h 10m",
            quality: "1080p60",
            tags: ["rust"],
            followersLabel: "1.5k",
            schedule: ["Tue", "Thu"],
            bio: "Rust graphics engine",
            isLive: true,
            scene: "rust",
            avatarInitials: "MC",
            avatarAccent: "#3b82f6",
            avatarUrl: null,
            ingestProtocol: "WHIP",
            featured: true,
          },
        ]}
        activeCategory="All Live"
        onSelectCategory={vi.fn()}
        searchQuery=""
        onClearSearch={vi.fn()}
        onlyFollowing={true}
        onNavigate={vi.fn()}
      />,
      { user: mockUser, toggleFollow },
    );

    // Live Now section should show 1 stream
    expect(screen.getByRole("heading", { name: /live now/i })).toBeInTheDocument();
    expect(screen.getByText("Rust live shaders")).toBeInTheDocument();

    // Wait for followed users directory to load
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /followed channels \(2\)/i })).toBeInTheDocument();
    });
    expect(screen.getByText("@offline_bob")).toBeInTheDocument();
    expect(screen.getByText("Weekend Gaming")).toBeInTheDocument();
    expect(screen.getByText("Offline")).toBeInTheDocument();

    // Clicking Following button toggles follow
    const userEventSetup = userEvent.setup();
    const followingButtons = screen.getAllByRole("button", { name: /following/i });
    expect(followingButtons.length).toBeGreaterThan(0);
    await userEventSetup.click(followingButtons[followingButtons.length - 1]!);
    expect(toggleFollow).toHaveBeenCalledWith("offline_bob");
  });

  it("renders empty state on Following page when signed in but following 0 creators", async () => {
    const mockUser: UserAccount = {
      id: "usr_10",
      username: "deniz_k",
      displayName: "Deniz Kaya",
      email: "deniz@velostream.dev",
      bio: "Engineer",
      avatarUrl: null,
      role: "USER",
      theme: "light",
      channelTitle: "Deniz Stream",
      channelCategory: "Programming",
      streamKey: "live_deniz_stream_key",
      slowMode: false,
      bannedUsers: [],
      bannedFromSlugs: [],
      followedSlugs: [],
      accessToken: "mock-jwt-token",
      sessionKind: "backend",
    };

    const onNavigate = vi.fn();
    const userEventSetup = userEvent.setup();

    renderWithAuth(
      <DiscoveryPage
        streams={[]}
        activeCategory="All Live"
        onSelectCategory={vi.fn()}
        searchQuery=""
        onClearSearch={vi.fn()}
        onlyFollowing={true}
        onNavigate={onNavigate}
      />,
      { user: mockUser },
    );

    expect(
      screen.getByRole("heading", { name: /you are not following any channels yet/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/browse live broadcasts on the home page and follow creators/i),
    ).toBeInTheDocument();

    const discoverBtn = screen.getByRole("button", { name: /discover creators/i });
    await userEventSetup.click(discoverBtn);
    expect(onNavigate).toHaveBeenCalledWith({ page: "home" });
  });

  it("renders LoadingSpinner with flat line loading indicator when isLoading is true on homepage", () => {
    renderWithAuth(
      <DiscoveryPage
        streams={[]}
        activeCategory="All Live"
        onSelectCategory={vi.fn()}
        searchQuery=""
        onClearSearch={vi.fn()}
        onlyFollowing={false}
        onNavigate={vi.fn()}
        isLoading={true}
      />,
    );

    const spinner = screen.getByRole("status");
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAttribute("aria-label", "Loading live broadcasts...");
    expect(screen.getByText("Loading live broadcasts...")).toBeInTheDocument();
    expect(screen.getByTestId("loading-flat-line-runner")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /no live broadcasts right now/i })).not.toBeInTheDocument();
  });

  it("does not render 'WebRTC WHIP' or 'OBS' protocol badge text on stream cards", () => {
    const mockStreams = [
      {
        id: "ch_test_1",
        slug: "test_broadcaster",
        displayName: "Test Broadcaster",
        title: "Testing WebRTC Direct Stream",
        isLive: true,
        viewerCount: 88,
        category: "Programming" as const,
        subCategory: "Rust",
        tags: ["webrtc"],
        uptime: "10m",
        quality: "1080p60",
        ingestProtocol: "WebRTC WHIP",
        followersLabel: "50",
        bio: "Test bio",
        schedule: [],
        scene: "rust" as const,
        avatarInitials: "TB",
        avatarAccent: "#2563EB",
      },
    ];

    renderWithAuth(
      <DiscoveryPage
        streams={mockStreams}
        activeCategory="All Live"
        onSelectCategory={vi.fn()}
        searchQuery=""
        onClearSearch={vi.fn()}
        onlyFollowing={false}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Testing WebRTC Direct Stream").length).toBeGreaterThan(0);
    expect(screen.queryByText("WebRTC WHIP")).not.toBeInTheDocument();
    expect(screen.queryByText("OBS RTMP")).not.toBeInTheDocument();
  });

  it("does not render the monetization noise banner card on the homepage", () => {
    renderWithAuth(
      <DiscoveryPage
        streams={[]}
        activeCategory="All Live"
        onSelectCategory={vi.fn()}
        searchQuery=""
        onClearSearch={vi.fn()}
        onlyFollowing={false}
        onNavigate={vi.fn()}
      />,
    );

    expect(
      screen.queryByText(/plain live streaming, zero monetization noise/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/no donation banners, no cheer bars/i),
    ).not.toBeInTheDocument();
  });

  it("renders live snapshot image on stream cards when broadcaster is live and snapshot is available, without fn raymarch", () => {
    saveStreamSnapshot("live_tester", "data:image/jpeg;base64,mock_live_screen_capture");

    const mockStreams = [
      {
        id: "ch_live_tester",
        slug: "live_tester",
        displayName: "Live Tester",
        title: "Live Game Dev Session",
        isLive: true,
        viewerCount: 120,
        category: "Programming" as const,
        subCategory: "Rust",
        tags: ["rust"],
        uptime: "15m",
        quality: "1080p60",
        ingestProtocol: "WebRTC WHIP",
        followersLabel: "100",
        bio: "Live testing",
        schedule: [],
        scene: "rust" as const,
        avatarInitials: "LT",
        avatarAccent: "#3B82F6",
      },
    ];

    renderWithAuth(
      <DiscoveryPage
        streams={mockStreams}
        activeCategory="All Live"
        onSelectCategory={vi.fn()}
        searchQuery=""
        onClearSearch={vi.fn()}
        onlyFollowing={false}
        onNavigate={vi.fn()}
      />,
    );

    const snapshotImgs = screen.getAllByAltText(/live stream snapshot/i);
    expect(snapshotImgs.length).toBeGreaterThan(0);
    expect(snapshotImgs[0]).toHaveAttribute("src", "data:image/jpeg;base64,mock_live_screen_capture");
    expect(screen.getAllByText("SNAPSHOT").length).toBeGreaterThan(0);
    expect(screen.queryByText(/raymarch/i)).not.toBeInTheDocument();
  });

  it("mounts live stream preview video when user hovers on snapshot card, and restores snapshot when user hovers off", () => {
    saveStreamSnapshot("live_tester", "data:image/jpeg;base64,mock_live_screen_capture");

    const mockStreams = [
      {
        id: "ch_live_tester",
        slug: "live_tester",
        displayName: "Live Tester",
        title: "Live Game Dev Session",
        isLive: true,
        viewerCount: 120,
        category: "Programming" as const,
        subCategory: "Rust",
        tags: ["rust"],
        uptime: "15m",
        quality: "1080p60",
        ingestProtocol: "WebRTC WHIP",
        followersLabel: "100",
        bio: "Live testing",
        schedule: [],
        scene: "rust" as const,
        avatarInitials: "LT",
        avatarAccent: "#3B82F6",
      },
    ];

    renderWithAuth(
      <DiscoveryPage
        streams={mockStreams}
        activeCategory="All Live"
        onSelectCategory={vi.fn()}
        searchQuery=""
        onClearSearch={vi.fn()}
        onlyFollowing={false}
        onNavigate={vi.fn()}
      />,
    );

    const card = screen.getByTestId("stream-card-live_tester");
    expect(card).toBeInTheDocument();

    // Prior to hover: no video player is rendered, snapshot is displayed
    expect(card.querySelector("video")).not.toBeInTheDocument();
    const snapshotImg = within(card).getByAltText(/live stream snapshot/i);
    expect(snapshotImg).toBeInTheDocument();

    // 1. Hover on snapshot card -> stream preview video mounts
    fireEvent.mouseEnter(card);
    const video = card.querySelector("video");
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute("data-testid", "stream-hover-video");
    expect(video).toHaveAttribute("autoplay");
    expect(video?.muted).toBe(true);

    // 2. Hover off snapshot card -> video unmounts, snapshot continues showing
    fireEvent.mouseLeave(card);
    expect(card.querySelector("video")).not.toBeInTheDocument();
    expect(within(card).getByAltText(/live stream snapshot/i)).toBeInTheDocument();
    expect(within(card).getByText("SNAPSHOT")).toBeInTheDocument();
  });

  it("navigates to watch page when clicking snapshot card during live stream hover preview", () => {
    const onNavigate = vi.fn();
    const mockStreams = [
      {
        id: "ch_click_tester",
        slug: "click_tester",
        displayName: "Click Tester",
        title: "Interactive Click Stream",
        isLive: true,
        viewerCount: 99,
        category: "Programming" as const,
        subCategory: "Rust",
        tags: ["rust"],
        uptime: "5m",
        quality: "1080p60",
        ingestProtocol: "WebRTC WHIP",
        followersLabel: "20",
        bio: "Click tester",
        schedule: [],
        scene: "rust" as const,
        avatarInitials: "CT",
        avatarAccent: "#10B981",
      },
    ];

    renderWithAuth(
      <DiscoveryPage
        streams={mockStreams}
        activeCategory="All Live"
        onSelectCategory={vi.fn()}
        searchQuery=""
        onClearSearch={vi.fn()}
        onlyFollowing={false}
        onNavigate={onNavigate}
      />,
    );

    const card = screen.getByTestId("stream-card-click_tester");

    // Hover to trigger stream preview
    fireEvent.mouseEnter(card);
    expect(card.querySelector("video")).toBeInTheDocument();

    // Click on card button
    const cardButton = card.querySelector("button")!;
    fireEvent.click(cardButton);
    expect(onNavigate).toHaveBeenCalledWith({ page: "watch", slug: "click_tester" });
  });

  it("activates live stream preview on featured spotlight stream card on hover and keyboard focus", () => {
    saveStreamSnapshot("spotlight_star", "data:image/jpeg;base64,sample_spotlight_snapshot");

    const mockStreams = [
      {
        id: "ch_spotlight_star",
        slug: "spotlight_star",
        displayName: "Spotlight Star",
        title: "Main Stage Feature Stream",
        isLive: true,
        viewerCount: 5000,
        category: "Programming" as const,
        subCategory: "Rust",
        tags: ["featured", "live"],
        uptime: "1h 15m",
        quality: "1080p60",
        ingestProtocol: "WebRTC WHIP",
        followersLabel: "10k",
        bio: "Featured creator on main stage",
        schedule: [],
        scene: "rust" as const,
        avatarInitials: "SS",
        avatarAccent: "#3B82F6",
      },
    ];

    renderWithAuth(
      <DiscoveryPage
        streams={mockStreams}
        activeCategory="All Live"
        onSelectCategory={vi.fn()}
        searchQuery=""
        onClearSearch={vi.fn()}
        onlyFollowing={false}
        onNavigate={vi.fn()}
      />,
    );

    const featuredButton = screen.getByTestId("featured-stream-thumbnail-button");
    expect(featuredButton).toBeInTheDocument();

    // Before hover: no video in featured thumbnail
    expect(featuredButton.querySelector("video")).not.toBeInTheDocument();

    // 1. Mouse enter -> mounts hover preview video
    fireEvent.mouseEnter(featuredButton);
    expect(featuredButton.querySelector("video")).toBeInTheDocument();

    // 2. Mouse leave -> unmounts video, retains snapshot
    fireEvent.mouseLeave(featuredButton);
    expect(featuredButton.querySelector("video")).not.toBeInTheDocument();
    expect(within(featuredButton).getByAltText(/live stream snapshot/i)).toBeInTheDocument();

    // 3. Keyboard focus -> mounts hover preview video
    fireEvent.focus(featuredButton);
    expect(featuredButton.querySelector("video")).toBeInTheDocument();

    // 4. Keyboard blur -> unmounts video
    fireEvent.blur(featuredButton);
    expect(featuredButton.querySelector("video")).not.toBeInTheDocument();
  });
});
