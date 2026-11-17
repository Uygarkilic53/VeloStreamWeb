import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthPage } from "./AuthPage";
import { AuthContext, type AuthContextValue } from "../lib/auth";

function renderAuthPage(props: {
  mode: "signin" | "signup";
  onSwitchMode?: (mode: "signin" | "signup") => void;
  onNavigate?: ReturnType<typeof vi.fn>;
}) {
  const onNavigate = props.onNavigate ?? vi.fn();
  const onSwitchMode = props.onSwitchMode ?? vi.fn();

  const authValue: AuthContextValue = {
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
    unbanUser: vi.fn(),
    banUser: vi.fn(),
    toggleFollow: vi.fn(),
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
      <AuthPage
        mode={props.mode}
        onSwitchMode={onSwitchMode}
        onNavigate={onNavigate}
      />
    </AuthContext.Provider>,
  );

  return { ...renderResult, onNavigate, onSwitchMode };
}

describe("AuthPage - Mira Codes Card", () => {
  it("renders mira_codes card as a static card without showcase button in signin mode", async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderAuthPage({ mode: "signin" });

    // Confirm the card exists
    const showcase = screen.getByTestId("mira-codes-showcase");
    expect(showcase).toBeInTheDocument();
    expect(showcase.tagName.toLowerCase()).toBe("div");

    // Must not have a button with 'Watch live'
    expect(screen.queryByRole("button", { name: /watch live/i })).not.toBeInTheDocument();

    // Must not have showcase button/badge
    expect(screen.queryByText("Showcase")).not.toBeInTheDocument();
    expect(screen.getByText("@mira_codes · Programming")).toBeInTheDocument();

    // Clicking the card container should NOT trigger navigation
    await user.click(showcase);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("renders mira_codes card as a static card without showcase button in signup mode", async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderAuthPage({ mode: "signup" });

    const showcase = screen.getByTestId("mira-codes-showcase");
    expect(showcase).toBeInTheDocument();
    expect(showcase.tagName.toLowerCase()).toBe("div");

    expect(screen.queryByRole("button", { name: /watch live/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Showcase")).not.toBeInTheDocument();

    await user.click(showcase);
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
