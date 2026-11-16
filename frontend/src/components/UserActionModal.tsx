import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import {
  AlertTriangleIcon,
  BanIcon,
  CloseIcon,
  RoleBadgeIcon,
  ShieldIcon,
  UserCheckIcon,
  UserIcon,
  UserMinusIcon,
  Volume2Icon,
  VolumeXIcon,
} from "./Icons";
import { UserAvatar } from "./UserAvatar";
import { useAuth } from "../lib/auth";
import { normalizeChatRole } from "../lib/chat";

export interface UserActionTarget {
  userId?: string | undefined;
  username: string;
  displayName?: string | undefined;
  avatarUrl?: string | null | undefined;
  role?: "Creator" | "Moderator" | "User" | "Mod" | string | undefined;
}

interface UserActionModalProps {
  target: UserActionTarget;
  channelSlug: string;
  creatorMode?: boolean | undefined;
  currentUserRole?: "Creator" | "Moderator" | "User" | string | undefined;
  onClose: () => void;
  onViewProfile?: ((username: string) => void) | undefined;
  onModerationAction?: ((action: string, payload: { duration?: string | undefined; reason?: string | undefined }) => void) | undefined;
}

export function UserActionModal({
  target,
  channelSlug,
  creatorMode = false,
  currentUserRole,
  onClose,
  onViewProfile,
  onModerationAction,
}: UserActionModalProps) {
  const { user, addModerator, removeModerator, silenceUser, unsilenceUser, sendWarning, banUser, unbanUser } =
    useAuth();
  const [showSilenceOptions, setShowSilenceOptions] = useState(false);
  const [showWarningInput, setShowWarningInput] = useState(false);
  const [warningReason, setWarningReason] = useState("");
  const [silenceDuration, setSilenceDuration] = useState<"1h" | "5h" | "1d" | "1w" | "1m">("1h");
  const [silenceReason, setSilenceReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Determine roles
  const cleanUsername = target.username.replace(/^@/, "").trim();
  const cleanSlug = channelSlug.replace(/^@/, "").trim().toLowerCase();
  const cleanTarget = cleanUsername.toLowerCase();
  const cleanSelf = (user?.username ?? "").replace(/^@/, "").trim().toLowerCase();
  const isSelf = Boolean(cleanSelf && cleanSelf === cleanTarget);
  const isChannelOwner =
    creatorMode ||
    (Boolean(cleanSelf) && cleanSelf === cleanSlug) ||
    currentUserRole === "Creator";
  const normalizedTargetRole = normalizeChatRole(
    cleanTarget === cleanSlug ? "Creator" : target.role,
  );
  const targetIsCreator = normalizedTargetRole === "Creator";
  const targetIsMod = normalizedTargetRole === "Moderator";

  // Check if current user has moderator or creator privileges
  const hasModerationPrivileges =
    isChannelOwner ||
    currentUserRole === "Moderator" ||
    user?.role?.toUpperCase() === "MODERATOR" ||
    user?.role?.toUpperCase() === "ADMIN";

  // Moderator hierarchy:
  // - Channel Owner (Creator) can moderate anyone except themselves.
  // - Moderators can only moderate standard Users (not Creator, not peer Mods).
  const canModerateTarget =
    !isSelf &&
    (isChannelOwner
      ? true
      : hasModerationPrivileges && !targetIsCreator && !targetIsMod);

  // Creator exclusivity: Only channel creator can assign or dismiss moderators
  const canManageModerators = isChannelOwner && !isSelf && !targetIsCreator;

  // Listen for Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleToggleModerator = async () => {
    setIsSubmitting(true);
    try {
      if (targetIsMod) {
        const res = await removeModerator(cleanUsername, cleanSlug);
        if (res.ok) {
          toast.success(res.message ?? `Removed @${cleanUsername} from channel moderators.`);
          onModerationAction?.("remove_mod", {});
          onClose();
        } else {
          toast.error(res.error ?? "Failed to remove moderator.");
        }
      } else {
        const res = await addModerator(cleanUsername, cleanSlug);
        if (res.ok) {
          toast.success(res.message ?? `@${cleanUsername} assigned as channel moderator.`);
          onModerationAction?.("add_mod", {});
          onClose();
        } else {
          toast.error(res.error ?? "Failed to assign moderator.");
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSilence = async () => {
    setIsSubmitting(true);
    try {
      const res = await silenceUser(
        cleanUsername,
        silenceDuration,
        silenceReason || "Silenced by channel moderation",
        cleanSlug,
      );
      if (res.ok) {
        toast.success(res.message ?? `@${cleanUsername} silenced for ${silenceDuration}.`);
        onModerationAction?.("silence", { duration: silenceDuration, reason: silenceReason });
        onClose();
      } else {
        toast.error(res.error ?? "Failed to silence user.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnsilence = async () => {
    setIsSubmitting(true);
    try {
      const res = await unsilenceUser(cleanUsername, cleanSlug);
      if (res.ok) {
        toast.success(res.message ?? `Unsilenced @${cleanUsername}.`);
        onModerationAction?.("unsilence", {});
        onClose();
      } else {
        toast.error(res.error ?? "Failed to unsilence user.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendWarning = async () => {
    const trimmed = warningReason.trim();
    if (!trimmed) {
      toast.warning("Please provide a warning reason.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await sendWarning(cleanUsername, trimmed, cleanSlug);
      if (res.ok) {
        toast.success(`Warning sent to @${cleanUsername}.`);
        onModerationAction?.("warn", { reason: trimmed });
        onClose();
      } else {
        toast.error(res.error ?? "Failed to send warning.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBan = async () => {
    const confirmed = window.confirm(`Are you sure you want to ban @${cleanUsername} from this channel?`);
    if (!confirmed) return;
    setIsSubmitting(true);
    try {
      const res = await banUser(
        cleanUsername,
        `Banned by moderation in #${cleanSlug}`,
        cleanSlug,
      );
      if (res.ok) {
        toast.success(`Banned @${cleanUsername} from channel.`);
        onModerationAction?.("ban", { reason: `Banned in #${cleanSlug}` });
        onClose();
      } else {
        toast.error(res.error ?? "Failed to ban user.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnban = async () => {
    setIsSubmitting(true);
    try {
      const res = await unbanUser(cleanUsername, cleanSlug);
      if (res.ok) {
        toast.success(res.message ?? `Unbanned @${cleanUsername} from channel.`);
        onModerationAction?.("unban", {});
        onClose();
      } else {
        toast.error(res.error ?? "Failed to unban user.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const roleLabel = targetIsCreator ? "Creator" : targetIsMod ? "Moderator" : "User";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-action-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div
        ref={modalRef}
        className="w-full max-w-sm rounded-2xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header with Avatar and User Info */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <UserAvatar
              username={cleanUsername}
              displayName={target.displayName || cleanUsername}
              avatarUrl={target.avatarUrl}
              size="lg"
            />
            <div className="min-w-0">
              <h3 id="user-action-title" className="truncate text-base font-bold text-[var(--vs-text)]">
                @{cleanUsername}
              </h3>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    roleLabel === "Creator"
                      ? "bg-[var(--vs-accent)]/15 text-[var(--vs-accent)] border border-[var(--vs-accent)]/30"
                      : roleLabel === "Moderator"
                        ? "bg-[var(--vs-ok)]/15 text-[var(--vs-ok)] border border-[var(--vs-ok)]/30"
                        : "bg-[var(--vs-surface-subtle)] text-[var(--vs-text-muted)] border border-[var(--vs-border)]/50"
                  }`}
                >
                  <RoleBadgeIcon role={roleLabel} className="h-3 w-3 shrink-0" />
                  <span>{roleLabel}</span>
                </span>
                <span className="text-[11px] text-[var(--vs-text-muted)]">#{channelSlug}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-[var(--vs-text-muted)] hover:bg-[var(--vs-surface-subtle)] hover:text-[var(--vs-text)]"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Action List */}
        <div className="mt-5 space-y-2 border-t border-[var(--vs-border)] pt-4">
          {/* View Profile */}
          <button
            type="button"
            onClick={() => {
              onClose();
              if (onViewProfile) {
                onViewProfile(cleanUsername);
              } else {
                const isTargetSelf = Boolean(
                  user?.username &&
                    user.username.replace(/^@/, "").toLowerCase() === cleanTarget,
                );
                const targetUrl = isTargetSelf
                  ? "/?page=profile"
                  : `/?page=watch&channel=${encodeURIComponent(cleanUsername)}`;
                if (typeof window !== "undefined") {
                  window.history.pushState(null, "", targetUrl);
                  window.dispatchEvent(new PopStateEvent("popstate"));
                }
              }
            }}
            className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3.5 py-2.5 text-xs font-semibold text-[var(--vs-text)] transition-colors hover:border-[var(--vs-accent)] hover:text-[var(--vs-accent)]"
          >
            <UserIcon className="h-4 w-4" />
            <span>View Profile</span>
          </button>

          {/* Moderation Controls (Owner & Mods) */}
          {canModerateTarget && (
            <>
              {/* Send Warning */}
              {showWarningInput ? (
                <div className="space-y-2 rounded-xl border border-[var(--vs-live)]/30 bg-[var(--vs-surface-subtle)] p-3">
                  <label htmlFor="warning-reason-input" className="block text-[11px] font-semibold text-[var(--vs-text)]">
                    Warning Reason:
                  </label>
                  <input
                    id="warning-reason-input"
                    type="text"
                    value={warningReason}
                    onChange={(e) => setWarningReason(e.target.value)}
                    placeholder="e.g. Please avoid spamming..."
                    className="w-full rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] px-2.5 py-1.5 text-xs text-[var(--vs-text)] focus:border-[var(--vs-accent)] focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setShowWarningInput(false)}
                      className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-[var(--vs-text-muted)] hover:text-[var(--vs-text)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleSendWarning}
                      className="inline-flex items-center gap-1 rounded-lg bg-[var(--vs-live)] px-3 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      <AlertTriangleIcon className="h-3 w-3" />
                      <span>Send Warning</span>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowWarningInput(true)}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3.5 py-2.5 text-xs font-semibold text-[var(--vs-text)] transition-colors hover:border-[var(--vs-live)]/50 hover:text-[var(--vs-live)]"
                >
                  <AlertTriangleIcon className="h-4 w-4 text-[var(--vs-live)]" />
                  <span>Send Warning Modal</span>
                </button>
              )}

              {/* Silence / Mute Options */}
              {showSilenceOptions ? (
                <div className="space-y-2.5 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-[var(--vs-text)]">Silence duration:</span>
                    <button
                      type="button"
                      onClick={handleUnsilence}
                      disabled={isSubmitting}
                      className="text-[11px] font-semibold text-[var(--vs-ok)] hover:underline"
                    >
                      Unsilence
                    </button>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {(["1h", "5h", "1d", "1w", "1m"] as const).map((dur) => (
                      <button
                        key={dur}
                        type="button"
                        onClick={() => setSilenceDuration(dur)}
                        className={`rounded-lg border py-1 text-[11px] font-semibold transition-colors ${
                          silenceDuration === dur
                            ? "border-[var(--vs-accent)] bg-[var(--vs-accent)] text-white"
                            : "border-[var(--vs-border)] bg-[var(--vs-surface)] text-[var(--vs-text)] hover:border-[var(--vs-accent)]"
                        }`}
                      >
                        {dur}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={silenceReason}
                    onChange={(e) => setSilenceReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="w-full rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] px-2.5 py-1.5 text-xs text-[var(--vs-text)] focus:border-[var(--vs-accent)] focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setShowSilenceOptions(false)}
                      className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-[var(--vs-text-muted)] hover:text-[var(--vs-text)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleSilence}
                      className="inline-flex items-center gap-1 rounded-lg bg-[var(--vs-accent)] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[var(--vs-accent-hover)] disabled:opacity-60"
                    >
                      <VolumeXIcon className="h-3 w-3" />
                      <span>Confirm Silence</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSilenceOptions(true)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3 py-2.5 text-xs font-semibold text-[var(--vs-text)] transition-colors hover:border-[var(--vs-accent)] hover:text-[var(--vs-accent)]"
                  >
                    <VolumeXIcon className="h-4 w-4 shrink-0" />
                    <span className="truncate">Silence / Timeout</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleUnsilence}
                    className="flex items-center justify-center gap-2 rounded-xl border border-[var(--vs-ok)]/40 bg-[var(--vs-surface-subtle)] px-3 py-2.5 text-xs font-semibold text-[var(--vs-ok)] transition-colors hover:bg-[var(--vs-ok)]/10 disabled:opacity-60"
                  >
                    <Volume2Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">Unsilence User</span>
                  </button>
                </div>
              )}

              {/* Ban & Unban User */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleBan}
                  className="flex items-center justify-center gap-2 rounded-xl border border-[var(--vs-live)]/30 bg-[var(--vs-live)]/5 px-3 py-2.5 text-xs font-semibold text-[var(--vs-live)] transition-colors hover:bg-[var(--vs-live)]/10 disabled:opacity-60"
                >
                  <BanIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">Ban User</span>
                </button>
                <button
                  type="button"
                  aria-label="Unban"
                  disabled={isSubmitting}
                  onClick={handleUnban}
                  className="flex items-center justify-center gap-2 rounded-xl border border-[var(--vs-ok)]/40 bg-[var(--vs-surface-subtle)] px-3 py-2.5 text-xs font-semibold text-[var(--vs-ok)] transition-colors hover:bg-[var(--vs-ok)]/10 disabled:opacity-60"
                >
                  <ShieldIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">Unban User</span>
                </button>
              </div>
            </>
          )}

          {/* Creator Only: Assign / Dismiss Moderator */}
          {canManageModerators && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleToggleModerator}
              className={`flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                targetIsMod
                  ? "border-[var(--vs-live)]/40 bg-[var(--vs-surface-subtle)] text-[var(--vs-live)] hover:bg-[var(--vs-live)]/10"
                  : "border-[var(--vs-ok)]/40 bg-[var(--vs-surface-subtle)] text-[var(--vs-ok)] hover:bg-[var(--vs-ok)]/10"
              }`}
            >
              {targetIsMod ? (
                <>
                  <UserMinusIcon className="h-4 w-4" />
                  <span>Dismiss as Moderator</span>
                </>
              ) : (
                <>
                  <UserCheckIcon className="h-4 w-4" />
                  <span>Assign as Moderator</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
