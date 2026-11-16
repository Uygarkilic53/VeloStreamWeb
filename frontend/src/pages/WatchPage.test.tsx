import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue, type UserAccount } from "../lib/auth";
import { WatchPage } from "./WatchPage";
import type { StreamDirectoryItem } from "../lib/streams";

const mockChannel: StreamDirectoryItem = {
  id: "ch_alice",
  slug: "alice_stream",
  displayName: "Alice Stream",
  title: "Building WebRTC Engine",
  isLive: true,
  viewerCount: 42,
  category: "Programming",
  subCategory: "Rust",
  tags: ["rust", "webrtc"],
  uptime: "1h 20m",
  quality: "1080p60",
  ingestProtocol: "WebRTC WHIP",
  followersLabel: "100 followers",
  bio: "Rust streamer",
  schedule: ["Mon 8pm"],
  scene: "rust",
  avatarInitials: "AS",
  avatarAccent: "#2563EB",
};

function renderWithAuth(ui: React.ReactElement, user: UserAccount | null = null) {
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
  };

  const renderResult = render(
    <AuthContext.Provider value={authValue}>{ui}</AuthContext.Provider>,
  );
  return {
    ...renderResult,
    rerender: (newUi: React.ReactElement) =>
      renderResult.rerender(<AuthContext.Provider value={authValue}>{newUi}</AuthContext.Provider>),
  };
}

describe("WatchPage - Banned user state", () => {
  it("renders banned view and does not display stage viewport or chat rail when isBanned is true", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();

    renderWithAuth(
      <WatchPage
        channel={mockChannel}
        hlsBaseUrl="http://localhost:8888"
        wsUrl="ws://localhost:3002"
        onNavigate={onNavigate}
        onSelectCategory={vi.fn()}
        isBanned={true}
        banReason="Repeated spam in chat"
      />,
    );

    expect(screen.getByRole("heading", { name: /channel unavailable/i })).toBeInTheDocument();
    expect(screen.getByText(/@alice_stream has banned you from viewing their channel\./i)).toBeInTheDocument();
    expect(screen.getByText(/repeated spam in chat/i)).toBeInTheDocument();

    // Verify video stage and chat rail are NOT rendered
    expect(screen.queryByLabelText(/stream chat/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/building webrtc engine/i)).not.toBeInTheDocument();

    // Clicking "Browse other channels" navigates to home
    const browseBtn = screen.getByRole("button", { name: /browse other channels/i });
    await user.click(browseBtn);
    expect(onNavigate).toHaveBeenCalledWith({ page: "home" });
  });

  it("renders banned view when current user's bannedFromSlugs contains the channel slug", () => {
    const bannedUser: UserAccount = {
      id: "usr_bob",
      username: "bob_viewer",
      displayName: "Bob Viewer",
      email: "bob@velostream.dev",
      bio: "",
      avatarUrl: null,
      role: "USER",
      theme: "light",
      channelTitle: "Bob's channel",
      channelCategory: "Programming",
      streamKey: "key_bob",
      slowMode: false,
      bannedUsers: [],
      bannedFromSlugs: ["alice_stream"],
      followedSlugs: [],
      accessToken: "token_bob",
      sessionKind: "backend",
    };

    renderWithAuth(
      <WatchPage
        channel={mockChannel}
        hlsBaseUrl="http://localhost:8888"
        wsUrl="ws://localhost:3002"
        onNavigate={vi.fn()}
        onSelectCategory={vi.fn()}
      />,
      bannedUser,
    );

    expect(screen.getByRole("heading", { name: /channel unavailable/i })).toBeInTheDocument();
    expect(screen.getByText(/@alice_stream has banned you from viewing their channel\./i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/stream chat/i)).not.toBeInTheDocument();
  });

  it("dynamically transitions from banned view to live stream view when unbanned without page refresh", () => {
    const { rerender } = renderWithAuth(
      <WatchPage
        channel={mockChannel}
        hlsBaseUrl="http://localhost:8888"
        wsUrl="ws://localhost:3002"
        onNavigate={vi.fn()}
        onSelectCategory={vi.fn()}
        isBanned={true}
        banReason="Violated community guidelines"
      />,
    );

    expect(screen.getByRole("heading", { name: /channel unavailable/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/stream chat/i)).not.toBeInTheDocument();

    // Dynamically unbanned (isBanned flips to false)
    rerender(
      <WatchPage
        channel={mockChannel}
        hlsBaseUrl="http://localhost:8888"
        wsUrl="ws://localhost:3002"
        onNavigate={vi.fn()}
        onSelectCategory={vi.fn()}
        isBanned={false}
      />,
    );

    expect(screen.queryByRole("heading", { name: /channel unavailable/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/stream chat/i)).toBeInTheDocument();
  });
});
