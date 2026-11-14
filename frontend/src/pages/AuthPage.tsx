import { useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import {
  EyeIcon,
  EyeOffIcon,
  LogInIcon,
  ShieldIcon,
  UserPlusIcon,
} from "../components/Icons";
import type { AppRoute } from "../components/Navbar";
import { StreamThumbnail } from "../components/StreamThumbnail";
import { VeloStreamLogo } from "../components/VeloStreamLogo";
import { useAuth } from "../lib/auth";
import { RESERVED_USERNAMES, type FieldErrorMap } from "../lib/auth-schemas";

interface AuthPageProps {
  mode: "signin" | "signup";
  onSwitchMode: (mode: "signin" | "signup") => void;
  onNavigate: (route: AppRoute) => void;
}

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,32}$/;

function getPasswordStrength(password: string): { score: number; label: string } {
  if (password.length === 0) {
    return { score: 0, label: "Minimum 8 characters" };
  }
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) || /[^a-zA-Z0-9]/.test(password)) score += 1;

  if (score <= 1) return { score: 1, label: "Weak" };
  if (score === 2) return { score: 2, label: "Fair" };
  if (score === 3) return { score: 3, label: "Good" };
  return { score: 4, label: "Strong" };
}

export function AuthPage({ mode, onSwitchMode, onNavigate }: AuthPageProps) {
  const { signIn, signUp, enterPreviewSession, isSubmitting } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});
  const [backendUnavailable, setBackendUnavailable] = useState(false);

  const isSignUp = mode === "signup";
  const trimmedUsername = username.trim();
  const isReservedUsername =
    trimmedUsername.length > 0 && RESERVED_USERNAMES.has(trimmedUsername.toLowerCase());
  const isUsernameValid =
    trimmedUsername.length > 0 &&
    USERNAME_PATTERN.test(trimmedUsername) &&
    !isReservedUsername;
  const passwordStrength = getPasswordStrength(password);

  function clearFieldError(field: string) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function switchAuthMode(nextMode: "signin" | "signup") {
    setErrorMessage(null);
    setFieldErrors({});
    setBackendUnavailable(false);
    setShowPassword(false);
    setConfirmPassword("");
    onSwitchMode(nextMode);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});
    setBackendUnavailable(false);

    if (isSignUp) {
      const result = await signUp({
        username: trimmedUsername,
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        email: email.trim(),
        password,
        confirmPassword,
        rememberSession,
      });
      if (result.ok) {
        toast.success(result.message ?? "Account created successfully.");
        onNavigate({ page: "home" });
        return;
      }
      const hasFieldErrors = Boolean(result.fieldErrors && Object.keys(result.fieldErrors).length > 0);
      setFieldErrors(result.fieldErrors ?? {});
      const message = hasFieldErrors
        ? "Check the highlighted fields above."
        : (result.error ?? "Unable to create your account.");
      setErrorMessage(message);
      setBackendUnavailable(Boolean(result.backendUnavailable));
      if (!hasFieldErrors || result.fromApi) {
        toast.error(result.error ?? message);
      }
      return;
    }

    const result = await signIn({
      identifier: identifier.trim(),
      password,
      rememberSession,
    });
    if (result.ok) {
      toast.success(result.message ?? "Signed in successfully.");
      onNavigate({ page: "home" });
      return;
    }
    const hasFieldErrors = Boolean(result.fieldErrors && Object.keys(result.fieldErrors).length > 0);
    setFieldErrors(result.fieldErrors ?? {});
    const message = hasFieldErrors
      ? "Check the highlighted fields above."
      : (result.error ?? "Unable to sign in.");
    setErrorMessage(message);
    setBackendUnavailable(Boolean(result.backendUnavailable));
    if (!hasFieldErrors || result.fromApi) {
      toast.error(result.error ?? message);
    }
  }

  function handleEnterPreviewSession() {
    if (isSignUp && isUsernameValid) {
      enterPreviewSession({
        username: trimmedUsername,
        ...(email.trim() ? { email: email.trim() } : {}),
        rememberSession,
      });
    } else if (!isSignUp && identifier.trim()) {
      const raw = identifier.trim();
      if (raw.includes("@") && !raw.startsWith("@")) {
        const prefix = raw.split("@")[0]?.replace(/[^a-zA-Z0-9_]/g, "") ?? "";
        enterPreviewSession({
          email: raw,
          ...(prefix.length >= 3 ? { username: prefix } : {}),
          rememberSession,
        });
      } else {
        const cleanIdentifier = raw.replace(/^@/, "");
        enterPreviewSession(
          USERNAME_PATTERN.test(cleanIdentifier) &&
            !RESERVED_USERNAMES.has(cleanIdentifier.toLowerCase())
            ? { username: cleanIdentifier, rememberSession }
            : { rememberSession },
        );
      }
    } else {
      enterPreviewSession({ rememberSession });
    }
    onNavigate({ page: "home" });
  }

  const usernameError = fieldErrors.username?.[0];
  const displayNameError = fieldErrors.displayName?.[0];
  const emailError = fieldErrors.email?.[0];
  const identifierError = fieldErrors.identifier?.[0];
  const passwordError = fieldErrors.password?.[0];
  const confirmPasswordError = fieldErrors.confirmPassword?.[0];

  return (
    <div className="mx-auto grid min-h-[calc(100vh-56px)] max-w-[1440px] lg:grid-cols-12">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] p-10 lg:col-span-5 lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-45"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 15%, var(--vs-accent-soft) 0%, transparent 55%), linear-gradient(to right, var(--vs-border) 1px, transparent 1px), linear-gradient(to bottom, var(--vs-border) 1px, transparent 1px)",
            backgroundSize: "100% 100%, 40px 40px, 40px 40px",
          }}
        />

        <div className="relative z-10 space-y-6">
          <VeloStreamLogo size={28} badge="PLAIN STREAMING" />

          <div className="space-y-3">
            <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--vs-text)]">
              {isSignUp
                ? "Go live without algorithmic feeds or tip clutter."
                : "Return to live broadcasts and low-latency chat."}
            </h1>
            <p className="text-sm leading-relaxed text-[var(--vs-text-muted)]">
              VeloStream pairs sub-second MediaMTX ingest with a clean, chronological creator stage.
              No donations, virtual currencies, or noisy overlays.
            </p>
          </div>

          <ul className="space-y-2.5 text-sm text-[var(--vs-text)]">
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--vs-accent)]" />
              <span>Browse Gaming, Just Chatting, Programming, Music, and Creative channels.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--vs-accent)]" />
              <span>Stream straight from your browser via WebRTC WHIP or OBS Studio RTMP.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--vs-accent)]" />
              <span>Real-time chat backed by Go Fiber WebSockets and instant moderation controls.</span>
            </li>
          </ul>
        </div>

        <div className="relative z-10 mt-8">
          <button
            type="button"
            onClick={() => onNavigate({ page: "watch", slug: "mira_codes" })}
            className="group block w-full overflow-hidden rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] text-left transition-colors hover:border-[var(--vs-accent)]"
          >
            <StreamThumbnail scene="rust" viewerCount={2418} quality="1080p60" compact />
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--vs-text)] group-hover:text-[var(--vs-accent)]">
                  Building a custom 2D lighting engine in Rust
                </p>
                <p className="mt-0.5 text-xs text-[var(--vs-text-muted)]">
                  @mira_codes · Programming
                </p>
              </div>
              <span className="shrink-0 rounded-md border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-2 py-1 text-xs font-medium text-[var(--vs-text)]">
                Watch live
              </span>
            </div>
          </button>
        </div>
      </aside>

      <main className="flex items-center justify-center px-5 py-10 sm:px-8 lg:col-span-7">
        <div className="w-full max-w-md space-y-6 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-6 sm:p-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="lg:hidden">
                <VeloStreamLogo size={24} />
              </div>
              <button
                type="button"
                onClick={() => onNavigate({ page: "home" })}
                className="ml-auto text-xs font-medium text-[var(--vs-text-muted)] transition-colors hover:text-[var(--vs-text)]"
              >
                Back to directory
              </button>
            </div>

            <div className="grid grid-cols-2 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] p-1">
              <button
                type="button"
                onClick={() => switchAuthMode("signin")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${!isSignUp
                    ? "bg-[var(--vs-surface)] text-[var(--vs-text)] shadow-xs"
                    : "text-[var(--vs-text-muted)] hover:text-[var(--vs-text)]"
                  }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => switchAuthMode("signup")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${isSignUp
                    ? "bg-[var(--vs-surface)] text-[var(--vs-text)] shadow-xs"
                    : "text-[var(--vs-text-muted)] hover:text-[var(--vs-text)]"
                  }`}
              >
                Create account
              </button>
            </div>

            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-[var(--vs-text)]">
                {isSignUp ? "Create your creator account" : "Sign in to VeloStream"}
              </h2>
              <p className="mt-1 text-sm text-[var(--vs-text-muted)]">
                {isSignUp
                  ? "Reserve your unique username, stream key, and live chat profile."
                  : "Access your profile settings, broadcast studio, and followed channels."}
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            aria-label={isSignUp ? "Create account form" : "Sign in form"}
            className="space-y-4"
            noValidate
          >
            {isSignUp ? (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="auth-username"
                      className="text-xs font-semibold text-[var(--vs-text)]"
                    >
                      Username
                    </label>
                    {trimmedUsername.length > 0 && !usernameError && (
                      <span
                        className={`text-[11px] font-medium ${isUsernameValid ? "text-[var(--vs-ok)]" : "text-[var(--vs-live)]"
                          }`}
                      >
                        {isUsernameValid
                          ? "Valid username"
                          : isReservedUsername
                            ? "Reserved username"
                            : "3–32 chars: letters, digits, _"}
                      </span>
                    )}
                  </div>
                  <input
                    id="auth-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    required
                    aria-invalid={Boolean(usernameError)}
                    aria-describedby={usernameError ? "auth-username-error" : undefined}
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      clearFieldError("username");
                    }}
                    placeholder="deniz_k"
                    className={`h-10 w-full rounded-lg border bg-[var(--vs-surface-subtle)] px-3 text-sm text-[var(--vs-text)] placeholder:text-[var(--vs-text-muted)] focus:bg-[var(--vs-surface)] focus:outline-none ${usernameError
                        ? "border-[var(--vs-live)] focus:border-[var(--vs-live)]"
                        : "border-[var(--vs-border)] focus:border-[var(--vs-accent)]"
                      }`}
                  />
                  {usernameError && (
                    <p id="auth-username-error" className="text-[11px] font-medium text-[var(--vs-live)]">
                      {usernameError}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="auth-display-name"
                    className="text-xs font-semibold text-[var(--vs-text)]"
                  >
                    Display name <span className="font-normal text-[var(--vs-text-muted)]">(optional)</span>
                  </label>
                  <input
                    id="auth-display-name"
                    name="displayName"
                    type="text"
                    autoComplete="name"
                    aria-invalid={Boolean(displayNameError)}
                    aria-describedby={displayNameError ? "auth-display-name-error" : undefined}
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      clearFieldError("displayName");
                    }}
                    placeholder="Deniz Kaya"
                    className={`h-10 w-full rounded-lg border bg-[var(--vs-surface-subtle)] px-3 text-sm text-[var(--vs-text)] placeholder:text-[var(--vs-text-muted)] focus:bg-[var(--vs-surface)] focus:outline-none ${displayNameError
                        ? "border-[var(--vs-live)] focus:border-[var(--vs-live)]"
                        : "border-[var(--vs-border)] focus:border-[var(--vs-accent)]"
                      }`}
                  />
                  {displayNameError && (
                    <p id="auth-display-name-error" className="text-[11px] font-medium text-[var(--vs-live)]">
                      {displayNameError}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="auth-email"
                    className="text-xs font-semibold text-[var(--vs-text)]"
                  >
                    Email address
                  </label>
                  <input
                    id="auth-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    aria-invalid={Boolean(emailError)}
                    aria-describedby={emailError ? "auth-email-error" : undefined}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      clearFieldError("email");
                    }}
                    placeholder="you@velostream.dev"
                    className={`h-10 w-full rounded-lg border bg-[var(--vs-surface-subtle)] px-3 text-sm text-[var(--vs-text)] placeholder:text-[var(--vs-text-muted)] focus:bg-[var(--vs-surface)] focus:outline-none ${emailError
                        ? "border-[var(--vs-live)] focus:border-[var(--vs-live)]"
                        : "border-[var(--vs-border)] focus:border-[var(--vs-accent)]"
                      }`}
                  />
                  {emailError && (
                    <p id="auth-email-error" className="text-[11px] font-medium text-[var(--vs-live)]">
                      {emailError}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <label
                  htmlFor="auth-identifier"
                  className="text-xs font-semibold text-[var(--vs-text)]"
                >
                  Username or email
                </label>
                <input
                  id="auth-identifier"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  required
                  aria-invalid={Boolean(identifierError)}
                  aria-describedby={identifierError ? "auth-identifier-error" : undefined}
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    clearFieldError("identifier");
                  }}
                  placeholder="deniz_k or you@velostream.dev"
                  className={`h-10 w-full rounded-lg border bg-[var(--vs-surface-subtle)] px-3 text-sm text-[var(--vs-text)] placeholder:text-[var(--vs-text-muted)] focus:bg-[var(--vs-surface)] focus:outline-none ${identifierError
                      ? "border-[var(--vs-live)] focus:border-[var(--vs-live)]"
                      : "border-[var(--vs-border)] focus:border-[var(--vs-accent)]"
                    }`}
                />
                {identifierError && (
                  <p id="auth-identifier-error" className="text-[11px] font-medium text-[var(--vs-live)]">
                    {identifierError}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="auth-password"
                className="text-xs font-semibold text-[var(--vs-text)]"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="auth-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  required
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={passwordError ? "auth-password-error" : undefined}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearFieldError("password");
                  }}
                  placeholder={isSignUp ? "Create a strong password" : "Enter your password"}
                  className={`h-10 w-full rounded-lg border bg-[var(--vs-surface-subtle)] pl-3 pr-10 text-sm text-[var(--vs-text)] placeholder:text-[var(--vs-text-muted)] focus:bg-[var(--vs-surface)] focus:outline-none ${passwordError
                      ? "border-[var(--vs-live)] focus:border-[var(--vs-live)]"
                      : "border-[var(--vs-border)] focus:border-[var(--vs-accent)]"
                    }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--vs-text-muted)] transition-colors hover:text-[var(--vs-text)]"
                >
                  {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </button>
              </div>
              {passwordError && (
                <p id="auth-password-error" className="text-[11px] font-medium text-[var(--vs-live)]">
                  {passwordError}
                </p>
              )}

              {isSignUp && (
                <div className="space-y-1.5 pt-1">
                  <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
                    {[1, 2, 3, 4].map((segment) => {
                      const active = passwordStrength.score >= segment;
                      const barColor = !active
                        ? "bg-[var(--vs-border)]"
                        : passwordStrength.score <= 1
                          ? "bg-[var(--vs-live)]"
                          : passwordStrength.score === 2
                            ? "bg-amber-500"
                            : "bg-[var(--vs-ok)]";
                      return <span key={segment} className={`h-1.5 rounded-full ${barColor}`} />;
                    })}
                  </div>
                  <p className="text-[11px] text-[var(--vs-text-muted)]">
                    Strength: {passwordStrength.label}
                  </p>
                </div>
              )}
            </div>

            {isSignUp && (
              <div className="space-y-1.5">
                <label
                  htmlFor="auth-confirm-password"
                  className="text-xs font-semibold text-[var(--vs-text)]"
                >
                  Confirm password
                </label>
                <input
                  id="auth-confirm-password"
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  aria-invalid={Boolean(confirmPasswordError)}
                  aria-describedby={confirmPasswordError ? "auth-confirm-password-error" : undefined}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    clearFieldError("confirmPassword");
                  }}
                  placeholder="Re-enter your password"
                  className={`h-10 w-full rounded-lg border bg-[var(--vs-surface-subtle)] px-3 text-sm text-[var(--vs-text)] placeholder:text-[var(--vs-text-muted)] focus:bg-[var(--vs-surface)] focus:outline-none ${confirmPasswordError
                      ? "border-[var(--vs-live)] focus:border-[var(--vs-live)]"
                      : "border-[var(--vs-border)] focus:border-[var(--vs-accent)]"
                    }`}
                />
                {confirmPasswordError && (
                  <p
                    id="auth-confirm-password-error"
                    className="text-[11px] font-medium text-[var(--vs-live)]"
                  >
                    {confirmPasswordError}
                  </p>
                )}
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-[var(--vs-text-muted)] select-none">
              <input
                type="checkbox"
                checked={rememberSession}
                onChange={(e) => setRememberSession(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--vs-border)] accent-[var(--vs-accent)]"
              />
              <span>Keep me signed in on this device</span>
            </label>

            {errorMessage && (
              <div
                role="alert"
                className="rounded-lg border border-[var(--vs-live)]/40 bg-[var(--vs-live)]/10 px-3 py-2.5 text-xs text-[var(--vs-text)]"
              >
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--vs-accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--vs-accent-hover)] disabled:opacity-60"
            >
              {!isSubmitting && (
                isSignUp ? <UserPlusIcon className="h-4 w-4" /> : <LogInIcon className="h-4 w-4" />
              )}
              <span>
                {isSubmitting
                  ? isSignUp
                    ? "Creating account..."
                    : "Signing in..."
                  : isSignUp
                    ? "Create account"
                    : "Sign in"}
              </span>
            </button>
          </form>

          {backendUnavailable && (
            <div className="space-y-2.5 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] p-3.5">
              <div className="flex items-start gap-2">
                <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--vs-accent)]" />
                <p className="text-xs leading-relaxed text-[var(--vs-text-muted)]">
                  Core API authentication routes are unavailable in this local environment. You can
                  explicitly open a local preview session to explore Account Management and the
                  Broadcast Studio.
                </p>
              </div>
              <button
                type="button"
                onClick={handleEnterPreviewSession}
                className="w-full rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] px-3 py-2 text-xs font-semibold text-[var(--vs-text)] transition-colors hover:border-[var(--vs-accent)] hover:text-[var(--vs-accent)]"
              >
                Continue in local preview session
              </button>
            </div>
          )}

          <p className="border-t border-[var(--vs-border)] pt-4 text-center text-xs text-[var(--vs-text-muted)]">
            {isSignUp ? "Already have an account?" : "New to VeloStream?"}{" "}
            <button
              type="button"
              onClick={() => switchAuthMode(isSignUp ? "signin" : "signup")}
              className="font-semibold text-[var(--vs-accent)] hover:underline"
            >
              {isSignUp ? "Sign in" : "Create one"}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
