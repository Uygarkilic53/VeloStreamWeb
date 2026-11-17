import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProfilePage } from "./ProfilePage";
import { AuthContext, type AuthContextValue } from "../lib/auth";
import { ThemeProvider } from "../lib/theme";

function renderProfilePage(props: {
  user?: AuthContextValue["user"];
  onNavigate?: ReturnType<typeof vi.fn>;
}) {
  const onNavigate = props.onNavigate ?? vi.fn();

  const authValue: AuthContextValue = {
    user: props.user ?? null,
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
      <ThemeProvider>
        <ProfilePage onNavigate={onNavigate} />
      </ThemeProvider>
    </AuthContext.Provider>,
  );

  return { ...renderResult, onNavigate };
}

describe("ProfilePage - Guest View & No Preview Session Feature", () => {
  it("renders sign in prompt for unauthenticated users and completely omits 'Preview signed-in account'", () => {
    renderProfilePage({ user: null });

    // Header and description
    expect(
      screen.getByRole("heading", { name: /sign in to manage your account/i }),
    ).toBeInTheDocument();

    // Standard auth action buttons
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^create account$/i })).toBeInTheDocument();

    // Preview signed-in account button must NOT exist anywhere
    expect(screen.queryByText(/preview signed-in account/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /preview signed-in account/i }),
    ).not.toBeInTheDocument();
  });

  it("navigates to signin and signup from guest prompt", async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderProfilePage({ user: null });

    const signInBtn = screen.getByRole("button", { name: /^sign in$/i });
    await user.click(signInBtn);
    expect(onNavigate).toHaveBeenCalledWith({ page: "signin" });

    const signUpBtn = screen.getByRole("button", { name: /^create account$/i });
    await user.click(signUpBtn);
    expect(onNavigate).toHaveBeenCalledWith({ page: "signup" });
  });
});
