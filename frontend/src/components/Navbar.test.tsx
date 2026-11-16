import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue, type UserAccount } from "../lib/auth";
import { ThemeProvider } from "../lib/theme";
import { Navbar, type AppRoute } from "./Navbar";

function renderNavbar(
  route: AppRoute = { page: "home" },
  authOverrides: Partial<AuthContextValue> = {},
  onNavigate = vi.fn(),
) {
  const defaultAuth: AuthContextValue = {
    user: null,
    isSubmitting: false,
    isHydrating: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    enterPreviewSession: vi.fn(),
    signOut: vi.fn(),
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
    updateTheme: vi.fn(),
    ...authOverrides,
  };

  return {
    onNavigate,
    ...render(
      <ThemeProvider>
        <AuthContext.Provider value={defaultAuth}>
          <Navbar
            route={route}
            onNavigate={onNavigate}
            searchQuery=""
            onSearchChange={vi.fn()}
          />
        </AuthContext.Provider>
      </ThemeProvider>,
    ),
  };
}

describe("Navbar - Profile button subtle frame tour effect", () => {
  it("renders subtle blue touring frame effect on profile button when user is logged in", async () => {
    const mockUser: UserAccount = {
      id: "usr_tour_1",
      username: "stellar_streamer",
      displayName: "Stellar Streamer",
      email: "stellar@velostream.dev",
      bio: "Broadcasting games & code",
      avatarUrl: null,
      role: "CREATOR",
      theme: "light",
      channelTitle: "Stellar Galaxy",
      channelCategory: "Gaming",
      streamKey: "sk_live_123",
      slowMode: false,
      bannedUsers: [],
      bannedFromSlugs: [],
      followedSlugs: [],
      accessToken: "token_123",
      sessionKind: "backend",
    };

    const user = userEvent.setup();
    const { onNavigate } = renderNavbar({ page: "home" }, { user: mockUser });

    // Profile button is present with accessible title
    const profileBtn = screen.getByRole("button", { name: /@stellar_streamer/i });
    expect(profileBtn).toBeInTheDocument();
    expect(profileBtn).toHaveAttribute("title", "Open @stellar_streamer profile");

    // Decorative frame tour SVG is present with aria-hidden
    const tourSvg = screen.getByTestId("profile-frame-tour");
    expect(tourSvg).toBeInTheDocument();
    expect(tourSvg).toHaveAttribute("aria-hidden", "true");
    expect(tourSvg).toHaveClass("profile-tour-track");

    // Head and tail elements are inside the SVG with pathLength 100 for continuous uniform travel
    const tailRect = tourSvg.querySelector(".profile-tour-tail");
    const headRect = tourSvg.querySelector(".profile-tour-head");
    expect(tailRect).toBeInTheDocument();
    expect(headRect).toBeInTheDocument();
    expect(tailRect).toHaveAttribute("pathLength", "100");
    expect(headRect).toHaveAttribute("pathLength", "100");

    // Clicking navigates to profile
    await user.click(profileBtn);
    expect(onNavigate).toHaveBeenCalledWith({ page: "profile" });
  });

  it("does not render profile button or tour frame when user is not signed in", () => {
    renderNavbar({ page: "home" }, { user: null });

    expect(screen.queryByTestId("profile-frame-tour")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sign up$/i })).toBeInTheDocument();
  });

  it("highlights profile button when current page is profile", () => {
    const mockUser: UserAccount = {
      id: "usr_tour_2",
      username: "cosmic_coder",
      displayName: "Cosmic Coder",
      email: "cosmic@velostream.dev",
      bio: "Code live",
      avatarUrl: null,
      role: "CREATOR",
      theme: "light",
      channelTitle: "Cosmic Code",
      channelCategory: "Programming",
      streamKey: "sk_live_456",
      slowMode: false,
      bannedUsers: [],
      bannedFromSlugs: [],
      followedSlugs: [],
      accessToken: "token_456",
      sessionKind: "backend",
    };

    renderNavbar({ page: "profile" }, { user: mockUser });

    const profileBtn = screen.getByRole("button", { name: /@cosmic_coder/i });
    expect(profileBtn).toHaveAttribute("aria-current", "page");
    expect(profileBtn).toHaveClass("border-[var(--vs-accent)]");
    expect(screen.getByTestId("profile-frame-tour")).toBeInTheDocument();
  });
});
