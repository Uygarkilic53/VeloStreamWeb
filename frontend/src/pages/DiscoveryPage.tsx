import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  BroadcastIcon,
  CategoryIcon,
  CompassIcon,
  HeartIcon,
  PlayIcon,
  SearchXIcon,
  UsersIcon,
} from "../components/Icons";
import type { AppRoute } from "../components/Navbar";
import { StreamThumbnail } from "../components/StreamThumbnail";
import { UserAvatar } from "../components/UserAvatar";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuth, type StreamCategory } from "../lib/auth";
import { useStreamSnapshot } from "../lib/snapshots";
import {
  formatViewerCount,
  STREAM_CATEGORIES,
  type StreamDirectoryItem,
} from "../lib/streams";
import {
  fetchFollowedUsersApi,
  type DirectorySearchResult,
  type DirectoryUserMatch,
  type PublicUserSummary,
} from "../lib/users";

interface DiscoveryPageProps {
  streams: readonly StreamDirectoryItem[];
  activeCategory: "All Live" | StreamCategory;
  onSelectCategory: (category: "All Live" | StreamCategory) => void;
  searchQuery: string;
  onSearchChange?: ((value: string) => void) | undefined;
  onClearSearch: () => void;
  searchResults?: DirectorySearchResult | undefined;
  onSelectUser?: ((user: DirectoryUserMatch) => void) | undefined;
  onlyFollowing: boolean;
  onNavigate: (route: AppRoute) => void;
  isLoading?: boolean | undefined;
  hlsBaseUrl?: string | undefined;
  whepBaseUrl?: string | undefined;
}

type SortOption = "viewers" | "title";

const GROUPED_CATEGORY_ORDER: readonly StreamCategory[] = [
  "Gaming",
  "Just Chatting",
  "Programming",
  "Music & Audio",
  "Creative",
];

function StreamCard({
  stream,
  onWatch,
  hlsBaseUrl = "http://localhost:8888",
  whepBaseUrl,
}: {
  stream: StreamDirectoryItem;
  onWatch: (slug: string) => void;
  hlsBaseUrl?: string | undefined;
  whepBaseUrl?: string | undefined;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const snapshotUrl = useStreamSnapshot(stream.slug, hlsBaseUrl, stream.isLive, whepBaseUrl);

  return (
    <article
      data-testid={`stream-card-${stream.slug}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group flex flex-col overflow-hidden rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] transition-colors hover:border-[var(--vs-accent)]"
    >
      <button
        type="button"
        onClick={() => onWatch(stream.slug)}
        onFocus={() => setIsHovered(true)}
        onBlur={() => setIsHovered(false)}
        className="text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)]"
      >
        <div className="p-3 pb-0">
          <StreamThumbnail
            scene={stream.scene}
            viewerCount={stream.viewerCount}
            quality={stream.quality}
            isLive={stream.isLive}
            snapshotUrl={snapshotUrl}
            slug={stream.slug}
            hlsBaseUrl={hlsBaseUrl}
            whepBaseUrl={whepBaseUrl}
            isHovered={isHovered}
          />
        </div>
        <div className="flex items-start gap-3.5 p-4">
          {stream.avatarUrl ? (
            <UserAvatar
              size="md"
              displayName={stream.displayName}
              username={stream.slug}
              avatarUrl={stream.avatarUrl}
              className="border-transparent"
            />
          ) : (
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: stream.avatarAccent }}
              aria-hidden="true"
            >
              {stream.avatarInitials}
            </span>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="truncate font-display text-sm font-semibold text-[var(--vs-text)] group-hover:text-[var(--vs-accent)]">
              {stream.title}
            </h3>
            <p className="truncate text-xs text-[var(--vs-text-muted)]">
              @{stream.slug} · {stream.subCategory}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="rounded-md border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--vs-text-muted)]">
                {stream.category}
              </span>
            </div>
          </div>
        </div>
      </button>
    </article>
  );
}

export function DiscoveryPage({
  streams,
  activeCategory,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  onClearSearch,
  searchResults,
  onSelectUser,
  onlyFollowing,
  onNavigate,
  isLoading = false,
  hlsBaseUrl = "http://localhost:8888",
  whepBaseUrl,
}: DiscoveryPageProps) {
  const { user, toggleFollow } = useAuth();
  const [sortBy, setSortBy] = useState<SortOption>("viewers");
  const [followedUsers, setFollowedUsers] = useState<PublicUserSummary[]>([]);
  const [isLoadingFollowed, setIsLoadingFollowed] = useState(false);
  const [isFeaturedHovered, setIsFeaturedHovered] = useState(false);
  const isSearchActive = searchQuery.trim().length > 0;

  useEffect(() => {
    if (!onlyFollowing || !user) {
      setFollowedUsers([]);
      return;
    }

    if (user.followedSlugs.length === 0) {
      setFollowedUsers([]);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    if (user.accessToken) {
      setIsLoadingFollowed(true);
      void fetchFollowedUsersApi(user.accessToken, controller.signal)
        .then((data) => {
          if (isMounted) {
            setFollowedUsers(data);
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsLoadingFollowed(false);
          }
        });
    } else {
      const previewFollowed: PublicUserSummary[] = user.followedSlugs.map((slug) => {
        const liveMatch = streams.find((s) => s.slug.toLowerCase() === slug.toLowerCase());
        return {
          id: `usr_${slug}`,
          username: slug,
          displayName: liveMatch?.displayName ?? slug,
          avatarUrl: liveMatch?.avatarUrl ?? null,
          bio: liveMatch?.bio ?? "",
          isLive: Boolean(liveMatch),
          channelTitle: liveMatch?.title ?? `${slug}'s channel`,
          channelCategory: liveMatch?.category ?? "Programming",
        };
      });
      setFollowedUsers(previewFollowed);
    }

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [onlyFollowing, streams, user]);

  const handleToggleFollow = async (slug: string) => {
    const isCurrentlyFollowing =
      user?.followedSlugs.some((s) => s.toLowerCase() === slug.toLowerCase()) ?? false;
    const result = await toggleFollow(slug);
    if (!result.ok) {
      toast.error(result.error ?? "Could not update follow status.");
      return;
    }
    toast.success(
      result.message ??
        (isCurrentlyFollowing ? `Unfollowed @${slug}.` : `Followed @${slug}.`),
    );
  };

  const featuredStream = useMemo(
    () => streams.find((s) => s.featured) ?? streams[0],
    [streams],
  );

  const filteredStreams = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const followedSet = new Set((user?.followedSlugs ?? []).map((s) => s.toLowerCase()));

    const matches = streams.filter((stream) => {
      if (onlyFollowing && !followedSet.has(stream.slug.toLowerCase())) {
        return false;
      }
      if (activeCategory !== "All Live" && stream.category !== activeCategory) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = `${stream.title} ${stream.slug} ${stream.displayName} ${stream.category} ${stream.subCategory} ${stream.tags.join(" ")}`.toLowerCase();
      return haystack.includes(query);
    });

    return [...matches].sort((a, b) =>
      sortBy === "viewers" ? b.viewerCount - a.viewerCount : a.title.localeCompare(b.title),
    );
  }, [streams, user, onlyFollowing, activeCategory, searchQuery, sortBy]);

  const groupedSections = useMemo(() => {
    return GROUPED_CATEGORY_ORDER.map((category) => ({
      category,
      items: filteredStreams.filter((item) => item.category === category),
    })).filter((group) => group.items.length > 0);
  }, [filteredStreams]);

  const showSpotlight =
    !isLoading && !onlyFollowing && activeCategory === "All Live" && !isSearchActive && featuredStream;
  const showGrouped = !isLoading && !onlyFollowing && activeCategory === "All Live" && !isSearchActive;
  const featuredSnapshotUrl = useStreamSnapshot(
    featuredStream?.slug ?? "",
    hlsBaseUrl,
    featuredStream?.isLive ?? false,
  );
  const isFollowingFeatured =
    featuredStream && user
      ? user.followedSlugs.some(
          (slug) => slug.toLowerCase() === featuredStream.slug.toLowerCase(),
        )
      : false;

  const matchedUsers = searchResults?.matchedUsers ?? [];
  const relatedLiveStreams = useMemo(() => {
    const base = searchResults ? searchResults.relatedLiveUsers : filteredStreams;
    const categoryFiltered =
      activeCategory === "All Live"
        ? base
        : base.filter((stream) => stream.category === activeCategory);
    return [...categoryFiltered].sort((a, b) =>
      sortBy === "viewers" ? b.viewerCount - a.viewerCount : a.title.localeCompare(b.title),
    );
  }, [activeCategory, filteredStreams, searchResults, sortBy]);

  return (
    <main className="mx-auto max-w-[1600px] space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      {onSearchChange && (
        <div className="md:hidden">
          <label htmlFor="velostream-mobile-search" className="sr-only">
            Search users by name or username
          </label>
          <input
            id="velostream-mobile-search"
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search users by name or @username..."
            className="h-10 w-full rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] px-3 text-sm text-[var(--vs-text)] placeholder:text-[var(--vs-text-muted)] focus:border-[var(--vs-accent)] focus:outline-none"
          />
        </div>
      )}
      {onlyFollowing && (
        <section className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight text-[var(--vs-text)]">
                Following
              </h1>
              <p className="mt-1 text-sm text-[var(--vs-text-muted)]">
                {user
                  ? `Showing live streams from channels @${user.username} follows.`
                  : "Sign in to curate your live channel list, or browse all channels."}
              </p>
            </div>
            {!user && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate({ page: "signin" })}
                  className="rounded-lg bg-[var(--vs-accent)] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[var(--vs-accent-hover)]"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate({ page: "home" })}
                  className="rounded-lg border border-[var(--vs-border)] bg-[var(--vs-canvas)] px-3.5 py-2 text-xs font-semibold text-[var(--vs-text)] hover:bg-[var(--vs-surface-subtle)]"
                >
                  Browse all live
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {showSpotlight && featuredStream && (
        <section
          aria-label="Featured live broadcast"
          className="grid gap-6 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:p-6"
        >
          <button
            type="button"
            data-testid="featured-stream-thumbnail-button"
            onClick={() => onNavigate({ page: "watch", slug: featuredStream.slug })}
            onMouseEnter={() => setIsFeaturedHovered(true)}
            onMouseLeave={() => setIsFeaturedHovered(false)}
            onFocus={() => setIsFeaturedHovered(true)}
            onBlur={() => setIsFeaturedHovered(false)}
            className="text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)]"
          >
            <StreamThumbnail
              scene={featuredStream.scene}
              viewerCount={featuredStream.viewerCount}
              quality={featuredStream.quality}
              isLive={featuredStream.isLive}
              snapshotUrl={featuredSnapshotUrl}
              slug={featuredStream.slug}
              hlsBaseUrl={hlsBaseUrl}
              whepBaseUrl={whepBaseUrl}
              isHovered={isFeaturedHovered}
            />
          </button>

          <div className="flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: featuredStream.avatarAccent }}
                    aria-hidden="true"
                  >
                    {featuredStream.avatarInitials}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-[var(--vs-text)]">
                      @{featuredStream.slug}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[var(--vs-text-muted)] tabular-nums">
                      <UsersIcon className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {formatViewerCount(featuredStream.viewerCount)} watching · {featuredStream.uptime}
                      </span>
                    </div>
                  </div>
                </div>
                <span className="rounded-full border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--vs-text)]">
                  {featuredStream.category}
                </span>
              </div>

              <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--vs-text)]">
                {featuredStream.title}
              </h1>

              <p className="text-sm leading-relaxed text-[var(--vs-text-muted)]">
                {featuredStream.bio}
              </p>

              <div className="flex flex-wrap gap-1.5">
                {featuredStream.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md border border-[var(--vs-border)] bg-[var(--vs-canvas)] px-2 py-0.5 font-mono text-[11px] text-[var(--vs-text-muted)]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => onNavigate({ page: "watch", slug: featuredStream.slug })}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--vs-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--vs-accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)]"
              >
                <PlayIcon className="h-3.5 w-3.5" />
                Watch stream
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    onNavigate({ page: "signin" });
                    return;
                  }
                  void toggleFollow(featuredStream.slug).then((result) => {
                    if (!result.ok) {
                      toast.error(result.error ?? "Could not update follow status.");
                      return;
                    }
                    toast.success(
                      result.message ??
                        (isFollowingFeatured
                          ? `Unfollowed @${featuredStream.slug}.`
                          : `Followed @${featuredStream.slug}.`),
                    );
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-canvas)] px-4 py-2 text-sm font-medium text-[var(--vs-text)] hover:bg-[var(--vs-surface-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)]"
              >
                <HeartIcon
                  className={`h-3.5 w-3.5 ${
                    isFollowingFeatured ? "fill-current text-[var(--vs-accent)]" : ""
                  }`}
                />
                <span>{isFollowingFeatured ? "Following" : "Follow"}</span>
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--vs-border)] pb-3">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="tablist"
          aria-label="Stream categories"
        >
          {STREAM_CATEGORIES.map((category) => {
            const streamPool = onlyFollowing
              ? streams.filter((s) =>
                  (user?.followedSlugs ?? []).some(
                    (slug) => slug.toLowerCase() === s.slug.toLowerCase(),
                  ),
                )
              : streams;
            const count =
              category === "All Live"
                ? streamPool.length
                : streamPool.filter((s) => s.category === category).length;
            const active = activeCategory === category;
            return (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelectCategory(category)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)] ${
                  active
                    ? "bg-[var(--vs-accent)] text-white"
                    : "border border-[var(--vs-border)] bg-[var(--vs-surface)] text-[var(--vs-text-muted)] hover:text-[var(--vs-text)]"
                }`}
              >
                <CategoryIcon category={category} className="h-3.5 w-3.5 shrink-0" />
                <span>{category}</span>
                <span
                  className={`tabular-nums ${
                    active ? "text-white/85" : "text-[var(--vs-text-muted)]"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <label className="flex items-center gap-2 text-xs text-[var(--vs-text-muted)]">
          <span>Sort</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--vs-text)] focus:border-[var(--vs-accent)] focus:outline-none"
          >
            <option value="viewers">Most viewers</option>
            <option value="title">Stream title (A–Z)</option>
          </select>
        </label>
      </div>

      {isSearchActive && !onlyFollowing ? (
        <div className="space-y-8">
          <section aria-label="Matching users" className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <UsersIcon className="h-4 w-4 text-[var(--vs-accent)]" />
                <h2 className="font-display text-lg font-bold tracking-tight text-[var(--vs-text)]">
                  Users
                </h2>
                <span className="rounded-md border border-[var(--vs-border)] bg-[var(--vs-surface)] px-2 py-0.5 text-xs font-medium text-[var(--vs-text-muted)] tabular-nums">
                  {matchedUsers.length}
                </span>
              </div>
              <button
                type="button"
                onClick={onClearSearch}
                className="text-xs font-semibold text-[var(--vs-accent)] hover:underline"
              >
                Clear search
              </button>
            </div>

            {matchedUsers.length === 0 ? (
              <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] px-5 py-6 text-sm text-[var(--vs-text-muted)]">
                No users found matching &ldquo;{searchQuery.trim()}&rdquo;.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {matchedUsers.map((match) => (
                  <button
                    key={match.username}
                    type="button"
                    onClick={() =>
                      onSelectUser
                        ? onSelectUser(match)
                        : onNavigate({ page: "watch", slug: match.username })
                    }
                    className="group flex items-center justify-between gap-3 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-3.5 text-left transition-colors hover:border-[var(--vs-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar
                        size="md"
                        displayName={match.displayName}
                        username={match.username}
                        avatarUrl={match.avatarUrl}
                        className="border-transparent"
                      />
                      <div className="min-w-0">
                        <div className="truncate font-display text-sm font-semibold text-[var(--vs-text)] group-hover:text-[var(--vs-accent)]">
                          {match.displayName}
                        </div>
                        <div className="truncate font-mono text-xs text-[var(--vs-text-muted)]">
                          @{match.username}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${
                        match.isLive
                          ? "border-[var(--vs-live)]/30 bg-[var(--vs-live)]/10 text-[var(--vs-live)]"
                          : "border-[var(--vs-border)] bg-[var(--vs-canvas)] text-[var(--vs-text-muted)]"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          match.isLive
                            ? "bg-[var(--vs-live)]"
                            : "bg-[var(--vs-text-muted)]/60"
                        }`}
                        aria-hidden="true"
                      />
                      {match.isLive ? "Live" : "Offline"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section aria-label="Related live users" className="space-y-4">
            <div className="flex items-center gap-2.5">
              <h2 className="font-display text-lg font-bold tracking-tight text-[var(--vs-text)]">
                Related live users
              </h2>
              <span className="rounded-md border border-[var(--vs-border)] bg-[var(--vs-surface)] px-2 py-0.5 text-xs font-medium text-[var(--vs-text-muted)] tabular-nums">
                {relatedLiveStreams.length} live
              </span>
            </div>

            {relatedLiveStreams.length === 0 ? (
              <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-6 text-center text-sm text-[var(--vs-text-muted)]">
                No related live users are streaming right now.
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:gap-6 xl:grid-cols-3">
                {relatedLiveStreams.map((stream) => (
                  <StreamCard
                    key={stream.id}
                    stream={stream}
                    hlsBaseUrl={hlsBaseUrl}
                    whepBaseUrl={whepBaseUrl}
                    onWatch={(slug) => onNavigate({ page: "watch", slug })}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      ) : onlyFollowing ? (
        !user ? (
          <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-8 text-center sm:p-12">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] text-[var(--vs-accent)]">
              <HeartIcon className="h-6 w-6" />
            </div>
            <h2 className="font-display text-lg font-bold text-[var(--vs-text)]">
              Follow your favorite creators
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-[var(--vs-text-muted)]">
              Sign in to follow channels and catch every broadcast as soon as they go live.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate({ page: "signin" })}
                className="rounded-lg bg-[var(--vs-accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--vs-accent-hover)]"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => onNavigate({ page: "home" })}
                className="rounded-lg border border-[var(--vs-border)] bg-[var(--vs-canvas)] px-4 py-2 text-xs font-semibold text-[var(--vs-text)] hover:bg-[var(--vs-surface-subtle)]"
              >
                Browse live channels
              </button>
            </div>
          </div>
        ) : user.followedSlugs.length === 0 && followedUsers.length === 0 ? (
          <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-8 text-center sm:p-12">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] text-[var(--vs-accent)]">
              <UsersIcon className="h-6 w-6" />
            </div>
            <h2 className="font-display text-lg font-bold text-[var(--vs-text)]">
              You are not following any channels yet
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-[var(--vs-text-muted)]">
              Browse live broadcasts on the home page and follow creators to see them here.
            </p>
            <button
              type="button"
              onClick={() => onNavigate({ page: "home" })}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--vs-accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--vs-accent-hover)]"
            >
              <CompassIcon className="h-4 w-4" />
              <span>Discover creators</span>
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            <section aria-label="Followed live streams" className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-[var(--vs-live)] animate-pulse" />
                  <h2 className="font-display text-lg font-bold tracking-tight text-[var(--vs-text)]">
                    Live now
                  </h2>
                  <span className="rounded-md border border-[var(--vs-border)] bg-[var(--vs-surface)] px-2 py-0.5 text-xs font-medium text-[var(--vs-text-muted)] tabular-nums">
                    {filteredStreams.length}
                  </span>
                </div>
              </div>

              {filteredStreams.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--vs-border)] bg-[var(--vs-surface-subtle)]/30 p-5 text-center text-xs text-[var(--vs-text-muted)]">
                  None of your followed creators are streaming right now.
                </div>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:gap-6 xl:grid-cols-3">
                  {filteredStreams.map((stream) => (
                    <StreamCard
                      key={stream.id}
                      stream={stream}
                      hlsBaseUrl={hlsBaseUrl}
                      whepBaseUrl={whepBaseUrl}
                      onWatch={(slug) => onNavigate({ page: "watch", slug })}
                    />
                  ))}
                </div>
              )}
            </section>

            <section aria-label="Followed creators directory" className="space-y-4 pt-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <UsersIcon className="h-4 w-4 text-[var(--vs-accent)]" />
                  <h2 className="font-display text-lg font-bold tracking-tight text-[var(--vs-text)]">
                    Followed channels ({followedUsers.length || user.followedSlugs.length})
                  </h2>
                </div>
              </div>

              {isLoadingFollowed ? (
                <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-8 text-center">
                  <LoadingSpinner label="Loading followed creators..." />
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {followedUsers.map((creator) => {
                    const isLive =
                      streams.some(
                        (s) => s.slug.toLowerCase() === creator.username.toLowerCase(),
                      ) || creator.isLive;
                    const isFollowingCreator =
                      user?.followedSlugs.some(
                        (s) => s.toLowerCase() === creator.username.toLowerCase(),
                      ) ?? false;
                    return (
                      <article
                        key={creator.id || creator.username}
                        className="flex flex-col justify-between rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-4 transition-colors hover:border-[var(--vs-accent)]"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <UserAvatar
                                size="md"
                                displayName={creator.displayName}
                                username={creator.username}
                                avatarUrl={creator.avatarUrl}
                              />
                              <div className="min-w-0">
                                <h3 className="truncate font-display text-sm font-semibold text-[var(--vs-text)]">
                                  {creator.displayName}
                                </h3>
                                <p className="truncate text-xs text-[var(--vs-text-muted)]">
                                  @{creator.username}
                                </p>
                              </div>
                            </div>
                            <span
                              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                isLive
                                  ? "bg-[var(--vs-live)]/15 text-[var(--vs-live)]"
                                  : "bg-[var(--vs-surface-subtle)] text-[var(--vs-text-muted)]"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  isLive
                                    ? "bg-[var(--vs-live)] animate-pulse"
                                    : "bg-[var(--vs-text-muted)]/50"
                                }`}
                                aria-hidden="true"
                              />
                              <span>{isLive ? "Live" : "Offline"}</span>
                            </span>
                          </div>

                          {creator.channelTitle && (
                            <p className="line-clamp-2 text-xs text-[var(--vs-text)]">
                              {creator.channelTitle}
                            </p>
                          )}

                          {creator.channelCategory && (
                            <span className="inline-block rounded-md border border-[var(--vs-border)] bg-[var(--vs-canvas)] px-2 py-0.5 text-[11px] font-medium text-[var(--vs-text-muted)]">
                              {creator.channelCategory}
                            </span>
                          )}
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--vs-border)] pt-3">
                          <button
                            type="button"
                            onClick={() => onNavigate({ page: "watch", slug: creator.username })}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-canvas)] px-3 py-1.5 text-xs font-semibold text-[var(--vs-text)] hover:bg-[var(--vs-surface-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)]"
                          >
                            <PlayIcon className="h-3 w-3" />
                            <span>{isLive ? "Watch stream" : "View channel"}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleFollow(creator.username)}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)] ${
                              isFollowingCreator
                                ? "border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] text-[var(--vs-text)] hover:bg-[var(--vs-surface)]"
                                : "border-transparent bg-[var(--vs-accent)] text-white hover:bg-[var(--vs-accent-hover)]"
                            }`}
                          >
                            <HeartIcon
                              className={`h-3 w-3 ${isFollowingCreator ? "fill-current text-[var(--vs-accent)]" : ""}`}
                            />
                            <span>{isFollowingCreator ? "Following" : "Follow"}</span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )
      ) : isLoading && !onlyFollowing ? (
        <section
          aria-label="Loading live broadcasts"
          className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-12 text-center"
        >
          <LoadingSpinner label="Loading live broadcasts..." />
        </section>
      ) : !onlyFollowing && streams.length === 0 && !isSearchActive ? (
        <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] text-[var(--vs-accent)] shadow-sm">
            <BroadcastIcon className="h-7 w-7" />
          </div>
          <h2 className="font-display text-xl font-bold tracking-tight text-[var(--vs-text)]">
            No live broadcasts right now
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--vs-text-muted)]">
            Nobody is currently streaming on VeloStream. Be the first to go live and start your broadcast!
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate({ page: "studio" })}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--vs-accent)] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--vs-accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)]"
            >
              <BroadcastIcon className="h-4 w-4" />
              <span>Start streaming</span>
            </button>
          </div>
        </div>
      ) : filteredStreams.length === 0 ? (
        <div className="rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] text-[var(--vs-text-muted)]">
            <SearchXIcon className="h-5 w-5" />
          </div>
          <h2 className="font-display text-lg font-semibold text-[var(--vs-text)]">
            No live streams match your filters
          </h2>
          <p className="mt-1 text-sm text-[var(--vs-text-muted)]">
            Clear your search or switch back to all live categories to discover active broadcasts.
          </p>
          <button
            type="button"
            onClick={() => {
              onSelectCategory("All Live");
              onClearSearch();
            }}
            className="mt-4 rounded-lg bg-[var(--vs-accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--vs-accent-hover)]"
          >
            Reset filters
          </button>
        </div>
      ) : showGrouped ? (
        <div className="space-y-10">
          {groupedSections.map((group) => (
            <section key={group.category} aria-labelledby={`cat-${group.category}`} className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <CategoryIcon category={group.category} className="h-4 w-4 text-[var(--vs-accent)]" />
                  <h2
                    id={`cat-${group.category}`}
                    className="font-display text-lg font-bold tracking-tight text-[var(--vs-text)]"
                  >
                    {group.category}
                  </h2>
                  <span className="rounded-md border border-[var(--vs-border)] bg-[var(--vs-surface)] px-2 py-0.5 text-xs font-medium text-[var(--vs-text-muted)] tabular-nums">
                    {group.items.length} live
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectCategory(group.category)}
                  className="text-xs font-semibold text-[var(--vs-accent)] hover:underline"
                >
                  View category
                </button>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:gap-6 xl:grid-cols-3">
                {group.items.map((stream) => (
                  <StreamCard
                    key={stream.id}
                    stream={stream}
                    hlsBaseUrl={hlsBaseUrl}
                    whepBaseUrl={whepBaseUrl}
                    onWatch={(slug) => onNavigate({ page: "watch", slug })}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section
          aria-label="Filtered live streams"
          className="grid gap-5 sm:grid-cols-2 lg:gap-6 xl:grid-cols-3"
        >
          {filteredStreams.map((stream) => (
            <StreamCard
              key={stream.id}
              stream={stream}
              hlsBaseUrl={hlsBaseUrl}
              whepBaseUrl={whepBaseUrl}
              onWatch={(slug) => onNavigate({ page: "watch", slug })}
            />
          ))}
        </section>
      )}
    </main>
  );
}

