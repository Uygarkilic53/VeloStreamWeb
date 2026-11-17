import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "react-toastify";
import {
  BanIcon,
  BroadcastIcon,
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MoonIcon,
  RefreshIcon,
  ShieldAlertIcon,
  ShieldIcon,
  SunIcon,
  TrashIcon,
  UploadIcon,
  UserCheckIcon,
  UserIcon,
  VolumeXIcon,
} from "../components/Icons";
import type { AppRoute } from "../components/Navbar";
import { UserAvatar } from "../components/UserAvatar";
import {
  useAuth,
  type ChannelModeratorView,
  type ChannelMuteView,
  type StreamCategory,
} from "../lib/auth";
import {
  RESERVED_USERNAMES,
  STREAM_CATEGORIES,
  USERNAME_REGEX,
  type FieldErrorMap,
} from "../lib/auth-schemas";
import { getFrontendEnv } from "../lib/env";
import { useTheme } from "../lib/theme";

interface ProfilePageProps {
  onNavigate: (route: AppRoute) => void;
}

type SettingsTab = "profile" | "channel" | "security" | "moderation";

export function ProfilePage({ onNavigate }: ProfilePageProps) {
  const {
    user,
    updateProfile,
    uploadAvatar,
    removeAvatar,
    updateChannelSettings,
    rotateStreamKey,
    changePassword,
    banUser,
    unbanUser,
    listModerators,
    addModerator,
    removeModerator,
    listSilences,
    silenceUser,
    unsilenceUser,
  } = useAuth();
  const { theme, setTheme, cookiesAccepted, openCookieSettings } = useTheme();
  const { whipBaseUrl } = getFrontendEnv();

  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");

  const [channelTitle, setChannelTitle] = useState(user?.channelTitle ?? "");
  const [channelCategory, setChannelCategory] = useState<StreamCategory>(
    user?.channelCategory ?? "Programming",
  );

  const [revealStreamKey, setRevealStreamKey] = useState(false);
  const [copiedField, setCopiedField] = useState<"key" | "rtmp" | "whip" | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [banInput, setBanInput] = useState("");
  const [banReasonInput, setBanReasonInput] = useState("");

  const [moderators, setModerators] = useState<ChannelModeratorView[]>([]);
  const [silences, setSilences] = useState<ChannelMuteView[]>([]);
  const [modInput, setModInput] = useState("");
  const [silenceInput, setSilenceInput] = useState("");
  const [silenceDurationInput, setSilenceDurationInput] = useState<
    "1h" | "5h" | "1d" | "1w" | "1m"
  >("1h");
  const [silenceReasonInput, setSilenceReasonInput] = useState("");

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSavingChannel, setIsSavingChannel] = useState(false);
  const [isRotatingKey, setIsRotatingKey] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isModerating, setIsModerating] = useState(false);

  const [profileErrors, setProfileErrors] = useState<FieldErrorMap>({});
  const [passwordErrors, setPasswordErrors] = useState<FieldErrorMap>({});

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName);
    setUsername(user.username);
    setEmail(user.email);
    setBio(user.bio);
    setChannelTitle(user.channelTitle);
    setChannelCategory(user.channelCategory);
    // Intentionally exclude avatarUrl / object identity so uploading or removing
    // an avatar does not discard unsaved text edits in the profile/channel forms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user?.id,
    user?.displayName,
    user?.username,
    user?.email,
    user?.bio,
    user?.channelTitle,
    user?.channelCategory,
  ]);

  useEffect(() => {
    if (activeTab === "moderation" && user) {
      void listModerators().then((res) => {
        if (res.ok && res.moderators) {
          setModerators(res.moderators);
        }
      });
      void listSilences().then((res) => {
        if (res.ok && res.silences) {
          setSilences(res.silences);
        }
      });
    }
  }, [activeTab, user, listModerators, listSilences]);

  async function copyValue(value: string, field: "key" | "rtmp" | "whip") {
    try {
      await navigator.clipboard?.writeText(value);
      setCopiedField(field);
      toast.success("Copied to clipboard.");
      window.setTimeout(() => {
        setCopiedField((prev) => (prev === field ? null : prev));
      }, 1800);
    } catch {
      toast.error("Clipboard access is unavailable in this browser.");
    }
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <section className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] text-[var(--vs-accent)]">
            <UserIcon className="h-5 w-5" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-[var(--vs-text)]">
            Sign in to manage your account
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--vs-text-muted)]">
            Configure your public profile, copy or rotate stream keys, manage channel bans, and
            launch broadcasts from your creator dashboard.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate({ page: "signin" })}
              className="rounded-lg bg-[var(--vs-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--vs-accent-hover)]"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => onNavigate({ page: "signup" })}
              className="rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] px-4 py-2 text-sm font-semibold text-[var(--vs-text)] transition-colors hover:bg-[var(--vs-surface-subtle)]"
            >
              Create account
            </button>
          </div>
        </section>
      </main>
    );
  }

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileErrors({});
    setIsSavingProfile(true);
    try {
      const result = await updateProfile({
        displayName: displayName.trim(),
        username: username.trim(),
        email: email.trim(),
        bio: bio.trim(),
      });
      if (!result.ok) {
        setProfileErrors(result.fieldErrors ?? {});
        toast.error(result.error ?? "Failed to update profile.");
        return;
      }
      toast.success(result.message ?? "Public profile updated.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleAvatarFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const result = await uploadAvatar(file);
      if (!result.ok) {
        toast.error(result.error ?? "Failed to upload avatar.");
        return;
      }
      toast.success(result.message ?? "Profile photo updated.");
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  async function handleRemoveAvatar() {
    setIsUploadingAvatar(true);
    try {
      const result = await removeAvatar();
      if (!result.ok) {
        toast.error(result.error ?? "Failed to remove avatar.");
        return;
      }
      toast.success(result.message ?? "Profile photo removed.");
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  async function handleSaveChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingChannel(true);
    try {
      const result = await updateChannelSettings({
        channelTitle: channelTitle.trim(),
        channelCategory,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Failed to save channel settings.");
        return;
      }
      toast.success(result.message ?? "Default broadcast title and category saved.");
    } finally {
      setIsSavingChannel(false);
    }
  }

  async function handleRotateKey() {
    setIsRotatingKey(true);
    try {
      const result = await rotateStreamKey();
      if (!result.ok) {
        toast.error(result.error ?? "Could not rotate stream key.");
        return;
      }
      toast.success(
        result.message ??
        "Rotated stream key. Update your encoder before starting a new stream.",
      );
    } finally {
      setIsRotatingKey(false);
    }
  }

  async function handlePasswordUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordErrors({});
    setIsSavingPassword(true);
    try {
      const result = await changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      if (!result.ok) {
        setPasswordErrors(result.fieldErrors ?? {});
        toast.error(result.error ?? "Failed to update password.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(
        user?.sessionKind === "preview"
          ? "Password validation passed (local preview session does not store credentials)."
          : (result.message ?? "Password updated."),
      );
    } finally {
      setIsSavingPassword(false);
    }
  }

  async function handleBanSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const handle = banInput.trim().replace(/^@/, "");
    if (!handle) {
      toast.error("Enter a username to ban.");
      return;
    }
    setIsModerating(true);
    try {
      const result = await banUser(handle, banReasonInput.trim() || "Channel moderation action");
      if (!result.ok) {
        toast.error(result.error ?? "Unable to ban user.");
        return;
      }
      setBanInput("");
      setBanReasonInput("");
      toast.success(result.message ?? `@${handle} added to channel ban list.`);
    } finally {
      setIsModerating(false);
    }
  }

  async function handleUnban(targetUsername: string) {
    setIsModerating(true);
    try {
      const result = await unbanUser(targetUsername);
      if (!result.ok) {
        toast.error(result.error ?? "Unable to unban user.");
        return;
      }
      toast.success(result.message ?? `Unbanned @${targetUsername}.`);
    } finally {
      setIsModerating(false);
    }
  }

  async function handleAddModeratorSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const handle = modInput.trim().replace(/^@/, "");
    if (!handle) {
      toast.error("Enter a username to assign as moderator.");
      return;
    }
    setIsModerating(true);
    try {
      const result = await addModerator(handle);
      if (!result.ok) {
        toast.error(result.error ?? "Unable to assign moderator.");
        return;
      }
      setModInput("");
      toast.success(result.message ?? `@${handle} assigned as moderator.`);
      const updated = await listModerators();
      if (updated.ok && updated.moderators) setModerators(updated.moderators);
    } finally {
      setIsModerating(false);
    }
  }

  async function handleRemoveModerator(targetUsername: string) {
    setIsModerating(true);
    try {
      const result = await removeModerator(targetUsername);
      if (!result.ok) {
        toast.error(result.error ?? "Unable to remove moderator.");
        return;
      }
      toast.success(result.message ?? `Removed @${targetUsername} from moderators.`);
      const updated = await listModerators();
      if (updated.ok && updated.moderators) setModerators(updated.moderators);
    } finally {
      setIsModerating(false);
    }
  }

  async function handleSilenceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const handle = silenceInput.trim().replace(/^@/, "");
    if (!handle) {
      toast.error("Enter a username to silence.");
      return;
    }
    setIsModerating(true);
    try {
      const result = await silenceUser(
        handle,
        silenceDurationInput,
        silenceReasonInput || "Silenced from channel settings",
      );
      if (!result.ok) {
        toast.error(result.error ?? "Unable to silence user.");
        return;
      }
      setSilenceInput("");
      setSilenceReasonInput("");
      toast.success(result.message ?? `@${handle} silenced for ${silenceDurationInput}.`);
      const updated = await listSilences();
      if (updated.ok && updated.silences) setSilences(updated.silences);
    } finally {
      setIsModerating(false);
    }
  }

  async function handleUnsilence(targetUsername: string) {
    setIsModerating(true);
    try {
      const result = await unsilenceUser(targetUsername);
      if (!result.ok) {
        toast.error(result.error ?? "Unable to unsilence user.");
        return;
      }
      toast.success(result.message ?? `Unsilenced @${targetUsername}.`);
      const updated = await listSilences();
      if (updated.ok && updated.silences) setSilences(updated.silences);
    } finally {
      setIsModerating(false);
    }
  }

  function clearProfileFieldError(field: string) {
    setProfileErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  const trimmedUsername = username.trim();
  const isReservedUsername =
    trimmedUsername.length > 0 && RESERVED_USERNAMES.has(trimmedUsername.toLowerCase());
  const isUsernameValid =
    trimmedUsername.length >= 3 &&
    trimmedUsername.length <= 32 &&
    USERNAME_REGEX.test(trimmedUsername) &&
    !isReservedUsername;

  const rtmpUrl = "rtmp://localhost:1935/live";

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <UserAvatar
            size="lg"
            displayName={user.displayName}
            username={user.username}
            avatarUrl={user.avatarUrl}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-xl font-bold tracking-tight text-[var(--vs-text)]">
                {user.displayName}
              </h1>
              <span className="rounded border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-2 py-0.5 font-mono text-xs text-[var(--vs-text-muted)]">
                @{user.username}
              </span>
              <span className="rounded bg-[var(--vs-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--vs-accent)]">
                {user.sessionKind === "backend" ? "Authenticated" : "Local preview session"}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-[var(--vs-text-muted)]">
              {user.channelCategory} · Default stream: {user.channelTitle}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate({ page: "studio" })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--vs-accent)] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--vs-accent-hover)]"
          >
            <BroadcastIcon className="h-3.5 w-3.5" />
            <span>Open broadcast studio</span>
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-12">
        <aside className="space-y-4 lg:col-span-3">
          <nav
            role="tablist"
            aria-label="Account sections"
            className="flex flex-row gap-1 overflow-x-auto rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-1.5 lg:flex-col"
          >
            {(
              [
                { id: "profile", label: "Public Profile", Icon: UserIcon },
                { id: "channel", label: "Channel & Stream Key", Icon: BroadcastIcon },
                { id: "security", label: "Password & Security", Icon: LockIcon },
                { id: "moderation", label: "Moderation & Bans", Icon: ShieldAlertIcon },
              ] as const
            ).map(({ id, label, Icon }) => {
              const selected = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => {
                    setActiveTab(id);
                  }}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors ${selected
                    ? "bg-[var(--vs-accent-soft)] text-[var(--vs-accent)]"
                    : "text-[var(--vs-text-muted)] hover:bg-[var(--vs-surface-subtle)] hover:text-[var(--vs-text)]"
                    }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>

          <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-4">
            <p className="text-xs font-semibold text-[var(--vs-text)]">Cookie settings</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--vs-text-muted)]">
              {cookiesAccepted
                ? "Essential first-party cookies are accepted."
                : "Essential cookies are not yet accepted."}
            </p>
            <button
              type="button"
              onClick={openCookieSettings}
              className="mt-3 text-xs font-semibold text-[var(--vs-accent)] hover:underline"
            >
              Manage cookie preferences
            </button>
          </div>
        </aside>

        <section className="space-y-6 lg:col-span-9">
          {activeTab === "profile" && (
            <>
              <form
                onSubmit={handleSaveProfile}
                noValidate
                className="space-y-5 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-5 sm:p-6"
              >
                <div>
                  <h2 className="font-display text-base font-bold text-[var(--vs-text)]">
                    Public profile
                  </h2>
                  <p className="mt-0.5 text-xs text-[var(--vs-text-muted)]">
                    Visible on your channel page, directory cards, and chat replies.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] p-4">
                  <UserAvatar
                    size="xl"
                    displayName={user.displayName}
                    username={user.username}
                    avatarUrl={user.avatarUrl}
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <p className="text-xs font-semibold text-[var(--vs-text)]">
                        Circular profile avatar
                      </p>
                      <p className="text-xs text-[var(--vs-text-muted)]">
                        PNG, JPEG, WebP, or GIF up to 5 MB. Stored in Cloudinary.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label
                        htmlFor="profile-avatar-upload"
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--vs-text)] transition-colors hover:border-[var(--vs-accent)] hover:text-[var(--vs-accent)] ${isUploadingAvatar ? "pointer-events-none opacity-60" : ""
                          }`}
                      >
                        <UploadIcon className="h-3.5 w-3.5" />
                        <span>
                          {isUploadingAvatar
                            ? "Uploading..."
                            : user.avatarUrl
                              ? "Change photo"
                              : "Upload photo"}
                        </span>
                      </label>
                      <input
                        id="profile-avatar-upload"
                        aria-label="Upload profile avatar"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
                        disabled={isUploadingAvatar}
                        onChange={(e) => void handleAvatarFileChange(e)}
                        className="sr-only"
                      />
                      {user.avatarUrl && (
                        <button
                          type="button"
                          disabled={isUploadingAvatar}
                          onClick={() => void handleRemoveAvatar()}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] px-3 py-1.5 text-xs font-medium text-[var(--vs-text-muted)] transition-colors hover:text-[var(--vs-live)] disabled:opacity-60"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                          <span>Remove photo</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="profile-display-name"
                      className="text-xs font-semibold text-[var(--vs-text)]"
                    >
                      Display name
                    </label>
                    <input
                      id="profile-display-name"
                      type="text"
                      aria-invalid={Boolean(profileErrors.displayName?.[0])}
                      aria-describedby={
                        profileErrors.displayName?.[0] ? "profile-display-name-error" : undefined
                      }
                      value={displayName}
                      onChange={(e) => {
                        setDisplayName(e.target.value);
                        clearProfileFieldError("displayName");
                      }}
                      className="h-9 w-full rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3 text-sm text-[var(--vs-text)] focus:border-[var(--vs-accent)] focus:bg-[var(--vs-surface)] focus:outline-none"
                    />
                    {profileErrors.displayName?.[0] && (
                      <p
                        id="profile-display-name-error"
                        className="text-[11px] font-medium text-[var(--vs-live)]"
                      >
                        {profileErrors.displayName[0]}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="profile-username"
                        className="text-xs font-semibold text-[var(--vs-text)]"
                      >
                        Username
                      </label>
                      {trimmedUsername.length > 0 &&
                        trimmedUsername !== user.username &&
                        !profileErrors.username?.[0] && (
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
                      id="profile-username"
                      type="text"
                      aria-invalid={Boolean(profileErrors.username?.[0])}
                      aria-describedby={
                        profileErrors.username?.[0] ? "profile-username-error" : undefined
                      }
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        clearProfileFieldError("username");
                      }}
                      className="h-9 w-full rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3 text-sm text-[var(--vs-text)] focus:border-[var(--vs-accent)] focus:bg-[var(--vs-surface)] focus:outline-none"
                    />
                    {profileErrors.username?.[0] && (
                      <p
                        id="profile-username-error"
                        className="text-[11px] font-medium text-[var(--vs-live)]"
                      >
                        {profileErrors.username[0]}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="profile-email"
                    className="text-xs font-semibold text-[var(--vs-text)]"
                  >
                    Account email
                  </label>
                  <input
                    id="profile-email"
                    type="email"
                    aria-invalid={Boolean(profileErrors.email?.[0])}
                    aria-describedby={profileErrors.email?.[0] ? "profile-email-error" : undefined}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      clearProfileFieldError("email");
                    }}
                    className="h-9 w-full rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3 text-sm text-[var(--vs-text)] focus:border-[var(--vs-accent)] focus:bg-[var(--vs-surface)] focus:outline-none"
                  />
                  {profileErrors.email?.[0] && (
                    <p
                      id="profile-email-error"
                      className="text-[11px] font-medium text-[var(--vs-live)]"
                    >
                      {profileErrors.email[0]}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="profile-bio"
                    className="text-xs font-semibold text-[var(--vs-text)]"
                  >
                    Channel bio
                  </label>
                  <textarea
                    id="profile-bio"
                    rows={3}
                    aria-invalid={Boolean(profileErrors.bio?.[0])}
                    aria-describedby={profileErrors.bio?.[0] ? "profile-bio-error" : undefined}
                    value={bio}
                    onChange={(e) => {
                      setBio(e.target.value);
                      clearProfileFieldError("bio");
                    }}
                    className="w-full rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] p-3 text-sm text-[var(--vs-text)] focus:border-[var(--vs-accent)] focus:bg-[var(--vs-surface)] focus:outline-none"
                  />
                  {profileErrors.bio?.[0] && (
                    <p
                      id="profile-bio-error"
                      className="text-[11px] font-medium text-[var(--vs-live)]"
                    >
                      {profileErrors.bio[0]}
                    </p>
                  )}
                </div>

                <div className="flex justify-end border-t border-[var(--vs-border)] pt-4">
                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="rounded-lg bg-[var(--vs-accent)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--vs-accent-hover)] disabled:opacity-60"
                  >
                    {isSavingProfile ? "Saving..." : "Save profile"}
                  </button>
                </div>
              </form>

              <section className="space-y-4 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-5 sm:p-6">
                <div>
                  <h2 className="font-display text-base font-bold text-[var(--vs-text)]">
                    Appearance
                  </h2>
                  <p className="mt-0.5 text-xs text-[var(--vs-text-muted)]">
                    Light Mode is VeloStream&apos;s default. Choose your preferred theme; your selection is saved to your account.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTheme("light");
                      toast.info("Switched appearance to Light Mode.");
                    }}
                    className={`flex items-start justify-between rounded-xl border p-4 text-left transition-colors ${theme === "light"
                      ? "border-[var(--vs-accent)] bg-[var(--vs-accent-soft)]"
                      : "border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] hover:border-[var(--vs-accent)]/60"
                      }`}
                  >
                    <div className="space-y-1">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--vs-text)]">
                        <SunIcon className="h-4 w-4" />
                        <span>Light Mode</span>
                      </span>
                      <p className="text-xs text-[var(--vs-text-muted)]">
                        Daylight crisp surface (#F6F8FA / #FFFFFF)
                      </p>
                    </div>
                    {theme === "light" && (
                      <span className="rounded bg-[var(--vs-accent)] px-2 py-0.5 text-[10px] font-semibold text-white">
                        Active
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTheme("dark");
                      toast.info("Switched appearance to Dark Mode.");
                    }}
                    className={`flex items-start justify-between rounded-xl border p-4 text-left transition-colors ${theme === "dark"
                      ? "border-[var(--vs-accent)] bg-[var(--vs-accent-soft)]"
                      : "border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] hover:border-[var(--vs-accent)]/60"
                      }`}
                  >
                    <div className="space-y-1">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--vs-text)]">
                        <MoonIcon className="h-4 w-4" />
                        <span>Dark Mode</span>
                      </span>
                      <p className="text-xs text-[var(--vs-text-muted)]">
                        Low-glare studio slate (#0E1116 / #151A22)
                      </p>
                    </div>
                    {theme === "dark" && (
                      <span className="rounded bg-[var(--vs-accent)] px-2 py-0.5 text-[10px] font-semibold text-white">
                        Active
                      </span>
                    )}
                  </button>
                </div>
              </section>
            </>
          )}

          {activeTab === "channel" && (
            <div className="space-y-6">
              <form
                onSubmit={handleSaveChannel}
                noValidate
                className="space-y-4 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-5 sm:p-6"
              >
                <div>
                  <h2 className="font-display text-base font-bold text-[var(--vs-text)]">
                    Default broadcast metadata
                  </h2>
                  <p className="mt-0.5 text-xs text-[var(--vs-text-muted)]">
                    Pre-filled whenever you open OBS or Browser WebRTC Studio.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="channel-title"
                    className="text-xs font-semibold text-[var(--vs-text)]"
                  >
                    Stream title
                  </label>
                  <input
                    id="channel-title"
                    type="text"
                    value={channelTitle}
                    onChange={(e) => setChannelTitle(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3 text-sm text-[var(--vs-text)] focus:border-[var(--vs-accent)] focus:bg-[var(--vs-surface)] focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="channel-category"
                    className="text-xs mr-2 font-semibold text-[var(--vs-text)]"
                  >
                    Category
                  </label>
                  <select
                    id="channel-category"
                    value={channelCategory}
                    onChange={(e) => setChannelCategory(e.target.value as StreamCategory)}
                    className="h-9 w-full rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3 text-sm text-[var(--vs-text)] focus:border-[var(--vs-accent)] focus:outline-none sm:max-w-xs"
                  >
                    {STREAM_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end border-t border-[var(--vs-border)] pt-4">
                  <button
                    type="submit"
                    disabled={isSavingChannel}
                    className="rounded-lg bg-[var(--vs-accent)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--vs-accent-hover)] disabled:opacity-60"
                  >
                    {isSavingChannel ? "Saving..." : "Save stream defaults"}
                  </button>
                </div>
              </form>

              <section className="space-y-4 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-5 sm:p-6">
                <div>
                  <h2 className="font-display text-base font-bold text-[var(--vs-text)]">
                    Stream key & ingest endpoints
                  </h2>
                  <p className="mt-0.5 text-xs text-[var(--vs-text-muted)]">
                    Keep your stream key secret. MediaMTX authenticates publishing via Go webhook.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="stream-key-input"
                    className="text-xs font-semibold text-[var(--vs-text)]"
                  >
                    Primary stream key
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      id="stream-key-input"
                      type="text"
                      readOnly
                      value={revealStreamKey ? user.streamKey : "••••••••••••••••••••••"}
                      aria-label="Primary stream key"
                      className="h-9 min-w-[220px] flex-1 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3 font-mono text-xs text-[var(--vs-text)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setRevealStreamKey((prev) => !prev)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] px-3 text-xs font-medium text-[var(--vs-text)] hover:bg-[var(--vs-surface-subtle)]"
                    >
                      {revealStreamKey ? (
                        <>
                          <EyeOffIcon className="h-3.5 w-3.5" />
                          <span>Hide</span>
                        </>
                      ) : (
                        <>
                          <EyeIcon className="h-3.5 w-3.5" />
                          <span>Reveal</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyValue(user.streamKey, "key")}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] px-3 text-xs font-medium text-[var(--vs-text)] hover:bg-[var(--vs-surface-subtle)]"
                    >
                      {copiedField === "key" ? (
                        <CheckIcon className="h-3.5 w-3.5 text-[var(--vs-ok)]" />
                      ) : (
                        <CopyIcon className="h-3.5 w-3.5" />
                      )}
                      <span>{copiedField === "key" ? "Copied" : "Copy"}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isRotatingKey}
                      onClick={() => void handleRotateKey()}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--vs-live)]/50 bg-[var(--vs-surface)] px-3 text-xs font-semibold text-[var(--vs-live)] transition-colors hover:bg-[var(--vs-live)]/10 disabled:opacity-60"
                    >
                      <RefreshIcon className={`h-3.5 w-3.5 ${isRotatingKey ? "animate-spin" : ""}`} />
                      <span>{isRotatingKey ? "Rotating..." : "Rotate key"}</span>
                    </button>
                  </div>
                </div>

                <dl className="grid gap-3 pt-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] p-3">
                    <dt className="text-[11px] font-medium text-[var(--vs-text-muted)]">
                      OBS / RTMP server URL
                    </dt>
                    <dd className="mt-1 flex items-center justify-between gap-2">
                      <code className="truncate font-mono text-xs text-[var(--vs-text)]">
                        {rtmpUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => void copyValue(rtmpUrl, "rtmp")}
                        className="shrink-0 text-xs font-medium text-[var(--vs-accent)] hover:underline"
                      >
                        {copiedField === "rtmp" ? "Copied" : "Copy"}
                      </button>
                    </dd>
                  </div>

                  <div className="rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] p-3">
                    <dt className="text-[11px] font-medium text-[var(--vs-text-muted)]">
                      Browser WebRTC WHIP URL
                    </dt>
                    <dd className="mt-1 flex items-center justify-between gap-2">
                      <code className="truncate font-mono text-xs text-[var(--vs-text)]">
                        {whipBaseUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => void copyValue(whipBaseUrl, "whip")}
                        className="shrink-0 text-xs font-medium text-[var(--vs-accent)] hover:underline"
                      >
                        {copiedField === "whip" ? "Copied" : "Copy"}
                      </button>
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-6">
              <form
                onSubmit={handlePasswordUpdate}
                noValidate
                className="space-y-4 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-5 sm:p-6"
              >
                <div>
                  <h2 className="font-display text-base font-bold text-[var(--vs-text)]">
                    Password & security
                  </h2>
                  <p className="mt-0.5 text-xs text-[var(--vs-text-muted)]">
                    Update your login password and verify active authentication metadata.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="current-password"
                    className="text-xs mr-2 font-semibold text-[var(--vs-text)]"
                  >
                    Current password
                  </label>
                  <input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3 text-sm text-[var(--vs-text)] focus:border-[var(--vs-accent)] focus:bg-[var(--vs-surface)] focus:outline-none sm:max-w-sm"
                  />
                  {passwordErrors.currentPassword?.[0] && (
                    <p className="text-[11px] font-medium text-[var(--vs-live)]">
                      {passwordErrors.currentPassword[0]}
                    </p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="new-password"
                      className="text-xs font-semibold text-[var(--vs-text)]"
                    >
                      New password
                    </label>
                    <input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="h-9 w-full rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3 text-sm text-[var(--vs-text)] focus:border-[var(--vs-accent)] focus:bg-[var(--vs-surface)] focus:outline-none"
                    />
                    {passwordErrors.newPassword?.[0] && (
                      <p className="text-[11px] font-medium text-[var(--vs-live)]">
                        {passwordErrors.newPassword[0]}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="confirm-password"
                      className="text-xs font-semibold text-[var(--vs-text)]"
                    >
                      Confirm new password
                    </label>
                    <input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="h-9 w-full rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3 text-sm text-[var(--vs-text)] focus:border-[var(--vs-accent)] focus:bg-[var(--vs-surface)] focus:outline-none"
                    />
                    {passwordErrors.confirmPassword?.[0] && (
                      <p className="text-[11px] font-medium text-[var(--vs-live)]">
                        {passwordErrors.confirmPassword[0]}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end border-t border-[var(--vs-border)] pt-4">
                  <button
                    type="submit"
                    disabled={isSavingPassword}
                    className="rounded-lg bg-[var(--vs-accent)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--vs-accent-hover)] disabled:opacity-60"
                  >
                    {isSavingPassword ? "Updating..." : "Update password"}
                  </button>
                </div>
              </form>

              <section className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <ShieldIcon className="mt-0.5 h-5 w-5 text-[var(--vs-accent)]" />
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--vs-text)]">
                      Active session overview
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--vs-text-muted)]">
                      Signed in as <span className="font-mono">@{user.username}</span> (
                      {user.sessionKind === "backend" ? "Asymmetric EdDSA JWT" : "Local preview"}
                      ). VeloStream never shares browsing history or chat metadata with third-party
                      trackers.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === "moderation" && (
            <div className="space-y-6">
              {/* Channel Moderators */}
              <section className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--vs-text)]">
                      Channel Moderators ({moderators.length})
                    </h3>
                    <p className="mt-0.5 text-xs text-[var(--vs-text-muted)]">
                      Moderators can timeout users, issue warnings, delete messages, and ban viewers.
                    </p>
                  </div>
                </div>

                <form
                  onSubmit={handleAddModeratorSubmit}
                  className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--vs-border)] pt-4"
                >
                  <input
                    type="text"
                    value={modInput}
                    onChange={(e) => setModInput(e.target.value)}
                    placeholder="Username to assign as moderator"
                    aria-label="Username to assign as moderator"
                    className="h-9 min-w-[200px] flex-1 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3 text-xs text-[var(--vs-text)] focus:border-[var(--vs-accent)] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isModerating}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--vs-accent)] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--vs-accent-hover)] disabled:opacity-60"
                  >
                    <UserCheckIcon className="h-3.5 w-3.5" />
                    <span>Assign Moderator</span>
                  </button>
                </form>

                {moderators.length === 0 ? (
                  <p className="mt-4 rounded-lg border border-dashed border-[var(--vs-border)] p-4 text-center text-xs text-[var(--vs-text-muted)]">
                    No active moderators assigned yet.
                  </p>
                ) : (
                  <ul className="mt-4 divide-y divide-[var(--vs-border)]">
                    {moderators.map((mod) => (
                      <li
                        key={mod.username}
                        className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <UserAvatar
                            username={mod.username}
                            displayName={mod.displayName}
                            avatarUrl={mod.avatarUrl}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="font-mono text-xs font-semibold text-[var(--vs-text)]">
                              @{mod.username}
                            </p>
                            <p className="text-[11px] text-[var(--vs-text-muted)]">
                              {mod.displayName} · Added{" "}
                              {new Date(mod.assignedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isModerating}
                          onClick={() => void handleRemoveModerator(mod.username)}
                          className="rounded-md border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--vs-live)] transition-colors hover:bg-[var(--vs-live)]/10 disabled:opacity-60"
                        >
                          Dismiss
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Silenced / Timeout Users */}
              <section className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--vs-text)]">
                      Silenced Users ({silences.length})
                    </h3>
                    <p className="mt-0.5 text-xs text-[var(--vs-text-muted)]">
                      Users temporarily muted from participating in your channel&apos;s live chat.
                    </p>
                  </div>
                </div>

                <form
                  onSubmit={handleSilenceSubmit}
                  className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--vs-border)] pt-4"
                >
                  <input
                    type="text"
                    value={silenceInput}
                    onChange={(e) => setSilenceInput(e.target.value)}
                    placeholder="Username to silence"
                    aria-label="Username to silence"
                    className="h-9 min-w-[140px] flex-1 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3 text-xs text-[var(--vs-text)] focus:border-[var(--vs-accent)] focus:outline-none"
                  />
                  <select
                    value={silenceDurationInput}
                    onChange={(e) =>
                      setSilenceDurationInput(
                        e.target.value as "1h" | "5h" | "1d" | "1w" | "1m",
                      )
                    }
                    aria-label="Silence duration"
                    className="h-9 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-2.5 text-xs font-semibold text-[var(--vs-text)] focus:border-[var(--vs-accent)] focus:outline-none"
                  >
                    <option value="1h">1 hour</option>
                    <option value="5h">5 hours</option>
                    <option value="1d">1 day</option>
                    <option value="1w">1 week</option>
                    <option value="1m">1 month</option>
                  </select>
                  <input
                    type="text"
                    value={silenceReasonInput}
                    onChange={(e) => setSilenceReasonInput(e.target.value)}
                    placeholder="Reason (optional)"
                    aria-label="Silence reason"
                    className="h-9 min-w-[160px] flex-1 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3 text-xs text-[var(--vs-text)] focus:border-[var(--vs-accent)] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isModerating}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--vs-accent)] px-3.5 text-xs font-semibold text-[var(--vs-accent)] transition-colors hover:bg-[var(--vs-accent)]/10 disabled:opacity-60"
                  >
                    <VolumeXIcon className="h-3.5 w-3.5" />
                    <span>Silence User</span>
                  </button>
                </form>

                {silences.length === 0 ? (
                  <p className="mt-4 rounded-lg border border-dashed border-[var(--vs-border)] p-4 text-center text-xs text-[var(--vs-text-muted)]">
                    No users are currently silenced on your channel.
                  </p>
                ) : (
                  <ul className="mt-4 divide-y divide-[var(--vs-border)]">
                    {silences.map((silence) => (
                      <li
                        key={silence.username}
                        className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-semibold text-[var(--vs-text)]">
                            @{silence.username}
                          </p>
                          <p className="text-[11px] text-[var(--vs-text-muted)]">
                            {silence.reason || "Silenced by moderation"} ·{" "}
                            {silence.expiresAt
                              ? `Expires at ${new Date(silence.expiresAt).toLocaleTimeString()}`
                              : "Permanent"}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={isModerating}
                          onClick={() => void handleUnsilence(silence.username)}
                          className="rounded-md border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--vs-ok)] transition-colors hover:bg-[var(--vs-ok)]/10 disabled:opacity-60"
                        >
                          Unsilence
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Banned Users */}
              <section className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--vs-text)]">
                      Banned users ({user.bannedUsers.length})
                    </h3>
                    <p className="mt-0.5 text-xs text-[var(--vs-text-muted)]">
                      Permanently banned users who cannot view or participate in your stream.
                    </p>
                  </div>
                </div>

                <form
                  onSubmit={handleBanSubmit}
                  className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--vs-border)] pt-4"
                >
                  <input
                    type="text"
                    value={banInput}
                    onChange={(e) => setBanInput(e.target.value)}
                    placeholder="Username to ban"
                    aria-label="Username to ban"
                    className="h-9 min-w-[160px] flex-1 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3 text-xs text-[var(--vs-text)] focus:border-[var(--vs-accent)] focus:outline-none"
                  />
                  <input
                    type="text"
                    value={banReasonInput}
                    onChange={(e) => setBanReasonInput(e.target.value)}
                    placeholder="Reason (optional)"
                    aria-label="Ban reason"
                    className="h-9 min-w-[180px] flex-1 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3 text-xs text-[var(--vs-text)] focus:border-[var(--vs-accent)] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isModerating}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--vs-live)]/50 px-3.5 text-xs font-semibold text-[var(--vs-live)] transition-colors hover:bg-[var(--vs-live)]/10 disabled:opacity-60"
                  >
                    <BanIcon className="h-3.5 w-3.5" />
                    <span>{isModerating ? "Applying..." : "Ban user"}</span>
                  </button>
                </form>

                {user.bannedUsers.length === 0 ? (
                  <p className="mt-4 rounded-lg border border-dashed border-[var(--vs-border)] p-4 text-center text-xs text-[var(--vs-text-muted)]">
                    No active bans on your channel.
                  </p>
                ) : (
                  <ul className="mt-4 divide-y divide-[var(--vs-border)]">
                    {user.bannedUsers.map((entry) => (
                      <li
                        key={entry.username}
                        className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-semibold text-[var(--vs-text)]">
                            @{entry.username}
                          </p>
                          <p className="text-[11px] text-[var(--vs-text-muted)]">
                            {entry.reason} · {entry.bannedAtLabel}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={isModerating}
                          onClick={() => void handleUnban(entry.username)}
                          className="rounded-md border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--vs-text)] transition-colors hover:border-[var(--vs-accent)] hover:text-[var(--vs-accent)] disabled:opacity-60"
                        >
                          Unban
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
