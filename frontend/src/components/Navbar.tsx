import { useEffect, useRef, useState } from "react";
import { FiLogOut, FiX } from "react-icons/fi";
import { useAuth } from "../lib/auth";
import { formatViewerCount } from "../lib/streams";
import type { DirectorySearchResult, DirectoryUserMatch } from "../lib/users";
import {
  BroadcastIcon,
  CompassIcon,
  HeartIcon,
  SearchIcon,
  SidebarToggleIcon,
} from "./Icons";
import { UserAvatar } from "./UserAvatar";
import { VeloStreamLogo } from "./VeloStreamLogo";

export type AppRoute =
  | { page: "home" }
  | { page: "following" }
  | { page: "watch"; slug: string }
  | { page: "signin" }
  | { page: "signup" }
  | { page: "profile" }
  | { page: "studio" };

interface NavbarProps {
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchResults?: DirectorySearchResult;
  onSelectUser?: (user: DirectoryUserMatch) => void;
  onToggleSidebar?: () => void;
}

const EMPTY_SEARCH_RESULTS: DirectorySearchResult = {
  matchedUsers: [],
  relatedLiveUsers: [],
  isSearching: false,
};

export function Navbar({
  route,
  onNavigate,
  searchQuery,
  onSearchChange,
  searchResults = EMPTY_SEARCH_RESULTS,
  onSelectUser,
  onToggleSidebar,
}: NavbarProps) {
  const { user, signOut } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);

  const isAuthPage = route.page === "signin" || route.page === "signup";
  const hasQuery = searchQuery.trim().length > 0;
  const showDropdown = !isAuthPage && searchOpen && hasQuery;

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  function handleSelectMatchedUser(match: DirectoryUserMatch) {
    setSearchOpen(false);
    if (onSelectUser) {
      onSelectUser(match);
    } else {
      onNavigate({ page: "watch", slug: match.username });
    }
  }

  function handleSelectLiveStream(slug: string) {
    setSearchOpen(false);
    onNavigate({ page: "watch", slug });
  }

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-[var(--vs-border)] bg-[var(--vs-surface)]">
      <div className="flex h-full items-center justify-between gap-2 px-3 sm:gap-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-5">
          {!isAuthPage && onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label="Toggle channel sidebar"
              className="hidden h-8 w-8 items-center justify-center rounded-lg border border-[var(--vs-border)] bg-[var(--vs-canvas)] text-[var(--vs-text-muted)] hover:text-[var(--vs-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)] md:inline-flex"
            >
              <SidebarToggleIcon className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => onNavigate({ page: "home" })}
            aria-label="VeloStream home"
            className="shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)]"
          >
            <VeloStreamLogo size={24} wordmarkClassName="hidden min-[460px]:inline" />
          </button>

          {!isAuthPage && (
            <nav aria-label="Primary navigation" className="hidden items-center gap-1 sm:flex">
              <button
                type="button"
                onClick={() => onNavigate({ page: "home" })}
                aria-current={route.page === "home" ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)] ${
                  route.page === "home"
                    ? "bg-[var(--vs-surface-subtle)] text-[var(--vs-text)]"
                    : "text-[var(--vs-text-muted)] hover:text-[var(--vs-text)]"
                }`}
              >
                <CompassIcon className="h-3.5 w-3.5 shrink-0" />
                <span>Browse</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate({ page: "following" })}
                aria-current={route.page === "following" ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)] ${
                  route.page === "following"
                    ? "bg-[var(--vs-surface-subtle)] text-[var(--vs-text)]"
                    : "text-[var(--vs-text-muted)] hover:text-[var(--vs-text)]"
                }`}
              >
                <HeartIcon className="h-3.5 w-3.5 shrink-0" />
                <span>Following</span>
              </button>
            </nav>
          )}
        </div>

        {!isAuthPage && (
          <div ref={searchContainerRef} className="relative hidden max-w-md flex-1 md:block">
            <label htmlFor="velostream-search" className="sr-only">
              Search users, streams, or categories
            </label>
            <div className="relative flex items-center">
              <SearchIcon className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--vs-text-muted)]" />
              <input
                id="velostream-search"
                type="search"
                value={searchQuery}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearchOpen(false);
                  }
                }}
                onChange={(e) => {
                  onSearchChange(e.target.value);
                  setSearchOpen(true);
                  if (route.page !== "home" && route.page !== "following") {
                    onNavigate({ page: "home" });
                  }
                }}
                placeholder="Search users by name or @username..."
                className={`h-9 w-full rounded-lg border border-[var(--vs-border)] bg-[var(--vs-canvas)] pl-9 text-sm text-[var(--vs-text)] placeholder:text-[var(--vs-text-muted)] focus:border-[var(--vs-accent)] focus:outline-none ${
                  hasQuery ? "pr-8" : "pr-3"
                }`}
              />
              {hasQuery && (
                <button
                  type="button"
                  onClick={() => {
                    onSearchChange("");
                    setSearchOpen(false);
                  }}
                  aria-label="Clear search"
                  className="absolute right-2 flex h-5 w-5 items-center justify-center rounded text-[var(--vs-text-muted)] hover:bg-[var(--vs-surface-subtle)] hover:text-[var(--vs-text)]"
                >
                  <FiX className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            {showDropdown && (
              <div
                role="region"
                aria-label="Search results"
                className="absolute top-full right-0 left-0 z-50 mt-1.5 max-h-[440px] overflow-y-auto rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] shadow-xl"
              >
                <div className="p-2.5">
                  <div className="mb-1.5 flex items-center justify-between px-2">
                    <span className="text-xs font-semibold text-[var(--vs-text-muted)]">
                      Users
                    </span>
                    {searchResults.isSearching && (
                      <span className="text-[11px] text-[var(--vs-text-muted)]">
                        Searching...
                      </span>
                    )}
                  </div>

                  {searchResults.matchedUsers.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-[var(--vs-text-muted)]">
                      No users matching &ldquo;{searchQuery.trim()}&rdquo;
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {searchResults.matchedUsers.slice(0, 6).map((match) => (
                        <li key={match.username}>
                          <button
                            type="button"
                            onClick={() => handleSelectMatchedUser(match)}
                            className="flex w-full items-center justify-between gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--vs-surface-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)]"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <UserAvatar
                                size="sm"
                                displayName={match.displayName}
                                username={match.username}
                                avatarUrl={match.avatarUrl}
                                className="border-transparent"
                              />
                              <div className="min-w-0">
                                <div className="truncate text-xs font-semibold text-[var(--vs-text)]">
                                  {match.displayName}
                                </div>
                                <div className="truncate font-mono text-[11px] text-[var(--vs-text-muted)]">
                                  @{match.username}
                                </div>
                              </div>
                            </div>
                            <span
                              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${
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
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="border-t border-[var(--vs-border)] bg-[var(--vs-canvas)]/55 p-2.5">
                  <div className="mb-1.5 px-2 text-xs font-semibold text-[var(--vs-text-muted)]">
                    Related live users
                  </div>
                  {searchResults.relatedLiveUsers.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-[var(--vs-text-muted)]">
                      No related live users right now.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {searchResults.relatedLiveUsers.slice(0, 5).map((live) => (
                        <li key={live.id}>
                          <button
                            type="button"
                            onClick={() => handleSelectLiveStream(live.slug)}
                            className="flex w-full items-center justify-between gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--vs-surface-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)]"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span className="relative flex shrink-0">
                                <UserAvatar
                                  size="sm"
                                  displayName={live.displayName}
                                  username={live.slug}
                                  avatarUrl={live.avatarUrl ?? null}
                                  className="border-transparent"
                                />
                                <span
                                  className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full border-2 border-[var(--vs-surface)] bg-[var(--vs-live)]"
                                  aria-hidden="true"
                                />
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-xs font-semibold text-[var(--vs-text)]">
                                    {live.displayName}
                                  </span>
                                  <span className="truncate font-mono text-[11px] text-[var(--vs-text-muted)]">
                                    @{live.slug}
                                  </span>
                                </div>
                                <div className="truncate text-[11px] text-[var(--vs-text-muted)]">
                                  {live.title}
                                </div>
                              </div>
                            </div>
                            <span className="shrink-0 text-[11px] font-medium text-[var(--vs-text-muted)] tabular-nums">
                              {formatViewerCount(live.viewerCount)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {!isAuthPage && (
            <button
              type="button"
              onClick={() => onNavigate({ page: "studio" })}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)] sm:px-3 ${
                route.page === "studio"
                  ? "border-[var(--vs-accent)] bg-[var(--vs-accent)] text-white"
                  : "border-[var(--vs-border)] bg-[var(--vs-canvas)] text-[var(--vs-text)] hover:border-[var(--vs-accent)]"
              }`}
            >
              <BroadcastIcon className="h-3.5 w-3.5 shrink-0" />
              <span>Go live</span>
            </button>
          )}

          {user ? (
            <div
              role="group"
              aria-label="Account profile section"
              className="flex items-center gap-1.5 sm:gap-2"
            >
              <button
                type="button"
                onClick={() => onNavigate({ page: "profile" })}
                aria-current={route.page === "profile" ? "page" : undefined}
                title={`Open @${user.username} profile`}
                className={`group relative inline-flex h-9 max-w-[160px] shrink-0 items-center gap-2 rounded-full border py-1 pr-2.5 pl-1 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)] sm:max-w-none ${
                  route.page === "profile"
                    ? "border-[var(--vs-accent)] bg-[var(--vs-accent-soft)] text-[var(--vs-text)]"
                    : "border-[var(--vs-border)] bg-[var(--vs-canvas)] text-[var(--vs-text)] hover:border-[var(--vs-accent)]/70 hover:bg-[var(--vs-surface-subtle)]"
                }`}
              >
                <svg
                  className="profile-tour-track"
                  aria-hidden="true"
                  data-testid="profile-frame-tour"
                >
                  <rect
                    x="1"
                    y="1"
                    width="calc(100% - 2px)"
                    height="calc(100% - 2px)"
                    rx="18"
                    ry="18"
                    pathLength={100}
                    className="profile-tour-tail"
                  />
                  <rect
                    x="1"
                    y="1"
                    width="calc(100% - 2px)"
                    height="calc(100% - 2px)"
                    rx="18"
                    ry="18"
                    pathLength={100}
                    className="profile-tour-head"
                  />
                </svg>
                <UserAvatar
                  size="sm"
                  displayName={user.displayName}
                  username={user.username}
                  avatarUrl={user.avatarUrl}
                  className="border-transparent"
                />
                <span className="truncate">@{user.username}</span>
              </button>
              <button
                type="button"
                aria-label="Sign out"
                onClick={() => {
                  void signOut();
                  onNavigate({ page: "home" });
                }}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--vs-live)]/30 bg-[var(--vs-live)]/10 px-2.5 text-xs font-medium whitespace-nowrap text-[var(--vs-live)] transition-colors hover:border-[var(--vs-live)]/50 hover:bg-[var(--vs-live)]/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)]"
              >
                <FiLogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onNavigate({ page: "signin" })}
                className="inline-flex h-9 shrink-0 items-center rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] px-2.5 text-xs font-semibold whitespace-nowrap text-[var(--vs-text)] hover:bg-[var(--vs-surface-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)] sm:px-3"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => onNavigate({ page: "signup" })}
                className="inline-flex h-9 shrink-0 items-center rounded-lg bg-[var(--vs-accent)] px-2.5 text-xs font-semibold whitespace-nowrap text-white hover:bg-[var(--vs-accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)] sm:px-3"
              >
                Sign up
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

