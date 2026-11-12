import { useState } from "react";
import { toast } from "react-toastify";
import {
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  HeartIcon,
  UsersIcon,
} from "../components/Icons";
import type { AppRoute } from "../components/Navbar";
import { StageViewport } from "../components/StageViewport";
import { UserAvatar } from "../components/UserAvatar";
import { ChatRail } from "../components/ChatRail";
import { useAuth } from "../lib/auth";
import { formatViewerCount, type StreamDirectoryItem } from "../lib/streams";

interface WatchPageProps {
  channel: StreamDirectoryItem;
  hlsBaseUrl: string;
  wsUrl: string;
  onNavigate: (route: AppRoute) => void;
  onSelectCategory: (category: StreamDirectoryItem["category"]) => void;
}

export function WatchPage({
  channel,
  hlsBaseUrl,
  wsUrl,
  onNavigate,
  onSelectCategory,
}: WatchPageProps) {
  const { user, toggleFollow } = useAuth();
  const [theaterMode, setTheaterMode] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  const isFollowing = user ? user.followedSlugs.includes(channel.slug) : false;

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/?watch=${encodeURIComponent(channel.slug)}`;
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(shareUrl);
    }
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 1800);
  };

  return (
    <div
      className={`grid gap-5 ${
        theaterMode ? "grid-cols-1" : "xl:grid-cols-[minmax(0,1fr)_360px]"
      }`}
    >
      <div className="min-w-0 space-y-4">
        <StageViewport
          hlsBaseUrl={hlsBaseUrl}
          channel={channel}
          theaterMode={theaterMode}
          onToggleTheater={() => setTheaterMode((prev) => !prev)}
        />

        <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-4">
          <div className="flex min-w-0 items-start gap-3.5">
            <div className="relative shrink-0">
              {channel.avatarUrl ? (
                <UserAvatar
                  size="md"
                  displayName={channel.displayName}
                  username={channel.slug}
                  avatarUrl={channel.avatarUrl}
                  className="!h-12 !w-12 border-transparent ring-2 ring-[var(--vs-accent)] ring-offset-2 ring-offset-[var(--vs-surface)]"
                />
              ) : (
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white ring-2 ring-[var(--vs-accent)] ring-offset-2 ring-offset-[var(--vs-surface)]"
                  style={{ backgroundColor: channel.avatarAccent }}
                  aria-hidden="true"
                >
                  {channel.avatarInitials}
                </span>
              )}
              {channel.isLive && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-[var(--vs-live)] px-1.5 py-0.5 text-[9px] font-bold text-white">
                  LIVE
                </span>
              )}
            </div>

            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-sm font-bold text-[var(--vs-text)]">
                  {channel.displayName}
                </span>
                <span className="text-xs text-[var(--vs-text-muted)]">@{channel.slug}</span>
              </div>
              <h1 className="font-display text-lg font-bold tracking-tight text-[var(--vs-text)]">
                {channel.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onSelectCategory(channel.category);
                    onNavigate({ page: "home" });
                  }}
                  className="rounded-md bg-[var(--vs-accent)]/12 px-2.5 py-0.5 text-xs font-semibold text-[var(--vs-accent)] hover:underline"
                >
                  {channel.category}
                </button>
                <span className="rounded-md border border-[var(--vs-border)] bg-[var(--vs-canvas)] px-2 py-0.5 text-xs text-[var(--vs-text-muted)]">
                  {channel.subCategory}
                </span>
                {channel.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md border border-[var(--vs-border)] bg-[var(--vs-canvas)] px-2 py-0.5 font-mono text-[11px] text-[var(--vs-text-muted)]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="text-right text-xs text-[var(--vs-text-muted)] tabular-nums">
              <div className="inline-flex items-center justify-end gap-1 font-semibold text-[var(--vs-text)]">
                <UsersIcon className="h-3.5 w-3.5 shrink-0 text-[var(--vs-accent)]" />
                <span>{formatViewerCount(channel.viewerCount)} watching</span>
              </div>
              <div className="flex items-center justify-end gap-1">
                <ClockIcon className="h-3 w-3 shrink-0" />
                <span>Uptime {channel.uptime}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!user) {
                  onNavigate({ page: "signin" });
                  return;
                }
                void toggleFollow(channel.slug).then((result) => {
                  if (!result.ok) {
                    toast.error(result.error ?? "Could not update follow status.");
                    return;
                  }
                  toast.success(
                    result.message ??
                      (isFollowing
                        ? `Unfollowed @${channel.slug}.`
                        : `Followed @${channel.slug}.`),
                  );
                });
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)] ${
                isFollowing
                  ? "border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] text-[var(--vs-text)]"
                  : "bg-[var(--vs-accent)] text-white hover:bg-[var(--vs-accent-hover)]"
              }`}
            >
              <HeartIcon className={`h-3.5 w-3.5 ${isFollowing ? "fill-current text-[var(--vs-accent)]" : ""}`} />
              <span>{isFollowing ? "Following" : "Follow"}</span>
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-canvas)] px-3 py-2 text-xs font-medium text-[var(--vs-text)] hover:bg-[var(--vs-surface-subtle)]"
            >
              {copiedShare ? (
                <>
                  <CheckIcon className="h-3.5 w-3.5 text-[var(--vs-ok)]" />
                  Copied
                </>
              ) : (
                <>
                  <CopyIcon className="h-3.5 w-3.5" />
                  Share
                </>
              )}
            </button>
          </div>
        </div>

        <section
          aria-label="Channel bio and schedule"
          className="space-y-3 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold text-[var(--vs-text)]">
              About @{channel.slug}
            </h2>
            <span className="rounded-md border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-2.5 py-0.5 text-xs font-medium text-[var(--vs-text-muted)]">
              {channel.followersLabel}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-[var(--vs-text-muted)]">{channel.bio}</p>
          <div className="grid gap-2 pt-1 sm:grid-cols-3">
            {channel.schedule.map((slot) => (
              <div
                key={slot}
                className="flex items-center gap-2 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-canvas)] px-3 py-2 text-xs text-[var(--vs-text)]"
              >
                <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-[var(--vs-accent)]" />
                <span>{slot}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <ChatRail
        channelSlug={channel.slug}
        wsUrl={wsUrl}
      />
    </div>
  );
}

