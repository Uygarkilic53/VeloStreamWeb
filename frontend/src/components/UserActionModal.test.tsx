import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../lib/auth";
import { UserActionModal, type UserActionTarget } from "./UserActionModal";

function renderWithAuth(
  ui: React.ReactElement,
  authOverrides: Partial<AuthContextValue> = {},
) {
  const defaultAuth: AuthContextValue = {
    user: {
      id: "creator-1",
      email: "creator@example.com",
      username: "alex_dev",
      displayName: "Alex Dev",
      channelTitle: "Alex Live",
      channelCategory: "Programming",
      bio: "Creator bio",
      streamKey: "live_123",
      avatarUrl: null,
      role: "creator",
      theme: "dark",
      slowMode: false,
      bannedUsers: [],
      bannedFromSlugs: [],
      followedSlugs: [],
      accessToken: "token_creator",
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
    banUser: vi.fn(async () => ({ ok: true, message: "User banned" })),
    unbanUser: vi.fn(async () => ({ ok: true })),
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

  return {
    auth: defaultAuth,
    ...render(<AuthContext.Provider value={defaultAuth}>{ui}</AuthContext.Provider>),
  };
}

describe("UserActionModal", () => {
  const sampleTarget: UserActionTarget = {
    userId: "target-user-1",
    username: "viewer_bob",
    displayName: "Bob View",
    role: "User",
  };

  it("renders username, display name, and View Profile button for regular users", () => {
    const onViewProfile = vi.fn();
    const onClose = vi.fn();

    renderWithAuth(
      <UserActionModal
        target={sampleTarget}
        channelSlug="alex_dev"
        creatorMode={false}
        onClose={onClose}
        onViewProfile={onViewProfile}
      />,
      {
        user: {
          id: "viewer-2",
          email: "charlie@example.com",
          username: "charlie",
          displayName: "Charlie",
          channelTitle: "Charlie Live",
          channelCategory: "Programming",
          bio: "",
          streamKey: "key_charlie",
          avatarUrl: null,
          role: "user",
          theme: "dark",
          slowMode: false,
          bannedUsers: [],
          bannedFromSlugs: [],
          followedSlugs: [],
          accessToken: "token_charlie",
          sessionKind: "backend",
        },
      },
    );

    expect(screen.getByText("@viewer_bob")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /View Profile/i })).toBeInTheDocument();
    // Normal viewer should not see moderation buttons
    expect(screen.queryByRole("button", { name: /Assign Moderator/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Silence User/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /View Profile/i }));
    expect(onViewProfile).toHaveBeenCalledWith("viewer_bob");
    expect(onClose).toHaveBeenCalled();
  });

  it("renders moderation options when viewer is channel creator", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onModAction = vi.fn();

    const { auth } = renderWithAuth(
      <UserActionModal
        target={sampleTarget}
        channelSlug="alex_dev"
        creatorMode={true}
        onClose={onClose}
        onModerationAction={onModAction}
      />,
    );

    // Creator should see Assign as Moderator, Silence, Send Warning, and Ban User
    expect(screen.getByRole("button", { name: /Assign as Moderator/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Silence \/ Timeout/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send Warning Modal/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ban User/i })).toBeInTheDocument();

    // Test Assign Moderator
    await user.click(screen.getByRole("button", { name: /Assign as Moderator/i }));
    await waitFor(() => {
      expect(auth.addModerator).toHaveBeenCalledWith("viewer_bob", "alex_dev");
      expect(onModAction).toHaveBeenCalledWith("add_mod", {});
    });
  });

  it("supports dismissing an existing moderator with channelSlug", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onModAction = vi.fn();

    const { auth } = renderWithAuth(
      <UserActionModal
        target={{ ...sampleTarget, role: "Moderator" }}
        channelSlug="@alex_dev"
        creatorMode={true}
        onClose={onClose}
        onModerationAction={onModAction}
      />,
    );

    expect(screen.getByRole("button", { name: /Dismiss as Moderator/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Dismiss as Moderator/i }));
    await waitFor(() => {
      expect(auth.removeModerator).toHaveBeenCalledWith("viewer_bob", "alex_dev");
      expect(onModAction).toHaveBeenCalledWith("remove_mod", {});
    });
  });

  it("supports sending a real-time warning", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onModAction = vi.fn();

    const { auth } = renderWithAuth(
      <UserActionModal
        target={sampleTarget}
        channelSlug="alex_dev"
        creatorMode={true}
        onClose={onClose}
        onModerationAction={onModAction}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Send Warning Modal/i }));
    expect(screen.getByPlaceholderText(/e\.g\. Please avoid spamming/i)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/e\.g\. Please avoid spamming/i), "Stop spamming");
    await user.click(screen.getByRole("button", { name: "Send Warning" }));

    await waitFor(() => {
      expect(auth.sendWarning).toHaveBeenCalledWith("viewer_bob", "Stop spamming", "alex_dev");
      expect(onModAction).toHaveBeenCalledWith("warn", { reason: "Stop spamming" });
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("supports silencing user with selectable durations (1h, 5h, 1d, 1w, 1m)", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onModAction = vi.fn();

    const { auth } = renderWithAuth(
      <UserActionModal
        target={sampleTarget}
        channelSlug="alex_dev"
        creatorMode={true}
        onClose={onClose}
        onModerationAction={onModAction}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Silence \/ Timeout/i }));
    expect(screen.getByRole("button", { name: "1h" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "5h" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1d" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1w" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1m" })).toBeInTheDocument();

    // Select 5h
    await user.click(screen.getByRole("button", { name: "5h" }));
    await user.click(screen.getByRole("button", { name: /Confirm Silence/i }));

    await waitFor(() => {
      expect(auth.silenceUser).toHaveBeenCalledWith(
        "viewer_bob",
        "5h",
        "Silenced by channel moderation",
        "alex_dev",
      );
      expect(onModAction).toHaveBeenCalledWith("silence", { duration: "5h", reason: "" });
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("supports unsilencing a user directly from the modal", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onModAction = vi.fn();

    const { auth } = renderWithAuth(
      <UserActionModal
        target={sampleTarget}
        channelSlug="alex_dev"
        creatorMode={true}
        onClose={onClose}
        onModerationAction={onModAction}
      />,
    );

    const unsilenceBtn = screen.getByRole("button", { name: /Unsilence User/i });
    expect(unsilenceBtn).toBeInTheDocument();
    await user.click(unsilenceBtn);

    await waitFor(() => {
      expect(auth.unsilenceUser).toHaveBeenCalledWith("viewer_bob", "alex_dev");
      expect(onModAction).toHaveBeenCalledWith("unsilence", {});
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("supports unbanning a user directly from the modal", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onModAction = vi.fn();

    const { auth } = renderWithAuth(
      <UserActionModal
        target={sampleTarget}
        channelSlug="alex_dev"
        creatorMode={true}
        onClose={onClose}
        onModerationAction={onModAction}
      />,
    );

    const unbanBtn = screen.getByRole("button", { name: /Unban/i });
    expect(unbanBtn).toBeInTheDocument();
    await user.click(unbanBtn);

    await waitFor(() => {
      expect(auth.unbanUser).toHaveBeenCalledWith("viewer_bob", "alex_dev");
      expect(onModAction).toHaveBeenCalledWith("unban", {});
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("creator cannot moderate themselves", () => {
    const selfTarget: UserActionTarget = {
      userId: "creator-1",
      username: "alex_dev",
      displayName: "Alex Dev",
      role: "Creator",
    };

    renderWithAuth(
      <UserActionModal
        target={selfTarget}
        channelSlug="alex_dev"
        creatorMode={true}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /Silence User/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ban User/i })).not.toBeInTheDocument();
  });

  it("channel moderator can moderate regular users but cannot assign moderators or moderate peer mods/creator", () => {
    const modUserTarget: UserActionTarget = {
      userId: "mod-2",
      username: "peer_mod",
      displayName: "Peer Mod",
      role: "Moderator",
    };

    const regularTarget: UserActionTarget = {
      userId: "viewer-3",
      username: "viewer_dan",
      displayName: "Dan",
      role: "User",
    };

    const modAuthUser = {
      id: "mod-1",
      email: "sarah@example.com",
      username: "sarah_mod",
      displayName: "Sarah Mod",
      channelTitle: "Sarah Live",
      channelCategory: "Programming" as const,
      bio: "",
      streamKey: "key_sarah",
      avatarUrl: null,
      role: "user",
      theme: "dark" as const,
      slowMode: false,
      bannedUsers: [],
      bannedFromSlugs: [],
      followedSlugs: [],
      accessToken: "token_sarah",
      sessionKind: "backend" as const,
    };

    // When moderator clicks regular user:
    const { unmount } = renderWithAuth(
      <UserActionModal
        target={regularTarget}
        channelSlug="alex_dev"
        creatorMode={false}
        currentUserRole="Moderator"
        onClose={vi.fn()}
      />,
      { user: modAuthUser },
    );

    expect(screen.getByRole("button", { name: /Silence \/ Timeout/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send Warning Modal/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ban User/i })).toBeInTheDocument();
    // Cannot assign moderators (creator only)
    expect(screen.queryByRole("button", { name: /Assign as Moderator/i })).not.toBeInTheDocument();

    unmount();

    // When moderator clicks peer moderator:
    renderWithAuth(
      <UserActionModal
        target={modUserTarget}
        channelSlug="alex_dev"
        creatorMode={false}
        currentUserRole="Moderator"
        onClose={vi.fn()}
      />,
      { user: modAuthUser },
    );

    // Cannot moderate peer mod
    expect(screen.queryByRole("button", { name: /Silence \/ Timeout/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Send Warning Modal/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ban User/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Assign as Moderator/i })).not.toBeInTheDocument();
  });

  it("handles View Profile click and dispatches onViewProfile with clean username", async () => {
    const user = userEvent.setup();
    const onViewProfile = vi.fn();
    const onClose = vi.fn();

    renderWithAuth(
      <UserActionModal
        target={{ username: "@some_viewer", displayName: "Some Viewer", role: "User" }}
        channelSlug="alex_dev"
        creatorMode={true}
        onClose={onClose}
        onViewProfile={onViewProfile}
      />,
    );

    const viewProfileBtn = screen.getByRole("button", { name: /View Profile/i });
    expect(viewProfileBtn).toBeInTheDocument();
    await user.click(viewProfileBtn);

    expect(onClose).toHaveBeenCalled();
    expect(onViewProfile).toHaveBeenCalledWith("some_viewer");
  });

  it("never displays Assign as Moderator on channel creator regardless of casing or @ prefix", () => {
    renderWithAuth(
      <UserActionModal
        target={{ username: "@Alex_Dev", displayName: "Alex", role: "Creator" }}
        channelSlug="alex_dev"
        creatorMode={true}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /Assign as Moderator/i })).not.toBeInTheDocument();
  });

  it("renders RoleBadgeIcon and title for Creator, Moderator, and User targets", () => {
    const { unmount: unmountCreator } = renderWithAuth(
      <UserActionModal
        target={{ username: "stream_owner", role: "Creator" }}
        channelSlug="stream_owner"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId("creator-badge-icon")).toBeInTheDocument();
    expect(screen.getByText("Creator")).toBeInTheDocument();
    unmountCreator();

    const { unmount: unmountMod } = renderWithAuth(
      <UserActionModal
        target={{ username: "mod_guard", role: "Moderator" }}
        channelSlug="stream_owner"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId("moderator-badge-icon")).toBeInTheDocument();
    expect(screen.getByText("Moderator")).toBeInTheDocument();
    unmountMod();

    const { unmount: unmountUser } = renderWithAuth(
      <UserActionModal
        target={{ username: "viewer_dan", role: "User" }}
        channelSlug="stream_owner"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId("user-badge-icon")).toBeInTheDocument();
    expect(screen.getByText("User")).toBeInTheDocument();
    unmountUser();
  });
});
