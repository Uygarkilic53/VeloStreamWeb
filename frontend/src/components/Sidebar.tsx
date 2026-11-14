import type { StreamCategory } from "../lib/auth";
import { formatViewerCount, STREAM_CATEGORIES, type StreamDirectoryItem } from "../lib/streams";
import { BroadcastIcon, CategoryIcon } from "./Icons";
import { LoadingSpinner } from "./LoadingSpinner";
import type { AppRoute } from "./Navbar";
import { UserAvatar } from "./UserAvatar";

interface SidebarProps {
  collapsed: boolean;
  streams: readonly StreamDirectoryItem[];
  activeCategory: "All Live" | StreamCategory;
  onSelectCategory: (category: "All Live" | StreamCategory) => void;
  onNavigate: (route: AppRoute) => void;
  isLoading?: boolean;
}

export function Sidebar({
  collapsed,
  streams,
  activeCategory,
  onSelectCategory,
  onNavigate,
  isLoading = false,
}: SidebarProps) {
  const liveChannels = streams.filter((s) => s.isLive);
  const topChannels = liveChannels.slice(0, 5);

  return (
    <aside
      aria-label="Channel and category navigation"
      className={`shrink-0 border-r border-[var(--vs-border)] bg-[var(--vs-surface)] transition-[width] duration-150 ${
        collapsed ? "hidden w-16 md:flex md:flex-col" : "hidden w-60 lg:flex lg:flex-col"
      }`}
    >
      <div className="flex-1 space-y-5 overflow-y-auto p-3">
        <div>
          {!collapsed && (
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="text-xs font-semibold text-[var(--vs-text-muted)]">
                Live channels
              </span>
              <span className="font-mono text-[11px] text-[var(--vs-text-muted)]">
                {isLoading ? "..." : `${liveChannels.length} on air`}
              </span>
            </div>
          )}

          {isLoading ? (
            collapsed ? (
              <div className="flex justify-center py-4">
                <span className="sr-only">Loading channels...</span>
                <div className="relative h-1 w-8 overflow-hidden rounded-full bg-[var(--vs-surface-subtle)]">
                  <div className="animate-flat-line" />
                </div>
              </div>
            ) : (
              <div className="px-2 py-4">
                <LoadingSpinner label="Loading channels..." lineClassName="max-w-[160px]" />
              </div>
            )
          ) : liveChannels.length === 0 ? (
            collapsed ? (
              <button
                type="button"
                onClick={() => onNavigate({ page: "studio" })}
                className="flex w-full flex-col items-center justify-center py-2 text-[var(--vs-text-muted)] transition-colors hover:text-[var(--vs-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)]"
                title="No live channels on air"
                aria-label="No live channels on air. Start streaming."
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] text-[var(--vs-text-muted)] transition-colors hover:border-[var(--vs-accent)] hover:text-[var(--vs-accent)]">
                  <BroadcastIcon className="h-4 w-4" />
                </span>
              </button>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--vs-border)] bg-[var(--vs-surface-subtle)]/40 p-3.5 text-center">
                <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] text-[var(--vs-text-muted)]">
                  <BroadcastIcon className="h-4 w-4" />
                </div>
                <p className="text-xs font-semibold text-[var(--vs-text)]">No live channels</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--vs-text-muted)]">
                  Nobody is broadcasting right now.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate({ page: "studio" })}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-[var(--vs-accent)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--vs-accent)] hover:bg-[var(--vs-accent)]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)]"
                >
                  <span>Start streaming</span>
                </button>
              </div>
            )
          ) : (
            <ul className="space-y-1">
              {topChannels.map((channel) => (
                <li key={channel.id}>
                  <button
                    type="button"
                    onClick={() => onNavigate({ page: "watch", slug: channel.slug })}
                    title={`${channel.displayName} (@${channel.slug}) — ${channel.category}`}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--vs-surface-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)] ${
                      collapsed ? "justify-center" : "justify-between"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {channel.avatarUrl ? (
                        <span className="relative flex h-8 w-8 shrink-0">
                          <UserAvatar
                            size="md"
                            displayName={channel.displayName}
                            username={channel.slug}
                            avatarUrl={channel.avatarUrl}
                            className="!h-8 !w-8 border-transparent"
                          />
                          {channel.isLive && (
                            <span
                              className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--vs-surface)] bg-[var(--vs-live)]"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                      ) : (
                        <span
                          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{ backgroundColor: channel.avatarAccent }}
                        >
                          {channel.avatarInitials}
                          {channel.isLive && (
                            <span
                              className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--vs-surface)] bg-[var(--vs-live)]"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                      )}
                      {!collapsed && (
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-[var(--vs-text)]">
                            @{channel.slug}
                          </div>
                          <div className="truncate text-[11px] text-[var(--vs-text-muted)]">
                            {channel.subCategory}
                          </div>
                        </div>
                      )}
                    </div>
                    {!collapsed && (
                      <span className="shrink-0 text-xs font-medium text-[var(--vs-text-muted)] tabular-nums">
                        {formatViewerCount(channel.viewerCount)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!collapsed && (
          <div className="border-t border-[var(--vs-border)] pt-4">
            <div className="mb-2 px-2 text-xs font-semibold text-[var(--vs-text-muted)]">
              Categories
            </div>
            <ul className="space-y-1">
              {STREAM_CATEGORIES.map((category) => {
                const selected = activeCategory === category;
                return (
                  <li key={category}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectCategory(category);
                        onNavigate({ page: "home" });
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)] ${
                        selected
                          ? "bg-[var(--vs-accent)] text-white"
                          : "text-[var(--vs-text-muted)] hover:bg-[var(--vs-surface-subtle)] hover:text-[var(--vs-text)]"
                      }`}
                    >
                      <CategoryIcon category={category} className="h-3.5 w-3.5 shrink-0" />
                      <span>{category}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}

