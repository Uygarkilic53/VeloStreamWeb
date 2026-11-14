import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CookieConsentGate } from "../components/CookieConsentGate";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { Navbar, type AppRoute } from "../components/Navbar";
import { Sidebar } from "../components/Sidebar";
import { AuthPage } from "../pages/AuthPage";
import { DiscoveryPage } from "../pages/DiscoveryPage";
import { ProfilePage } from "../pages/ProfilePage";
import { StudioPage } from "../pages/StudioPage";
import { WatchPage } from "../pages/WatchPage";
import { AuthProvider, useAuth, type StreamCategory } from "../lib/auth";
import { getFrontendEnv } from "../lib/env";
import { INITIAL_LIVE_STREAMS, type StreamDirectoryItem } from "../lib/streams";
import { saveStreamSnapshot } from "../lib/snapshots";
import { ThemeProvider, useTheme } from "../lib/theme";
import {
  fetchLiveChannelsApi,
  fetchPublicUserApi,
  publicUserToStreamItem,
  useDirectorySearch,
  type DirectoryUserMatch,
  type PublicUserSummary,
} from "../lib/users";

const CATEGORY_SET = new Set<string>([
  "Gaming",
  "Just Chatting",
  "Programming",
  "Music & Audio",
  "Creative",
]);

function parseRouteFromLocation(): AppRoute {
  if (typeof window === "undefined") {
    return { page: "home" };
  }
  const url = new URL(window.location.href);
  const pageParam = url.searchParams.get("page");
  const channelParam = url.searchParams.get("channel");

  if (pageParam === "watch" && channelParam) {
    return { page: "watch", slug: channelParam };
  }
  if (pageParam === "following") return { page: "following" };
  if (pageParam === "signin") return { page: "signin" };
  if (pageParam === "signup") return { page: "signup" };
  if (pageParam === "profile") return { page: "profile" };
  if (pageParam === "studio") return { page: "studio" };

  const path = url.pathname.replace(/\/+$/, "");
  if (path === "/following") return { page: "following" };
  if (path === "/signin") return { page: "signin" };
  if (path === "/signup") return { page: "signup" };
  if (path === "/profile") return { page: "profile" };
  if (path === "/studio") return { page: "studio" };
  if (path.startsWith("/watch/")) {
    const slug = decodeURIComponent(path.slice("/watch/".length));
    if (slug) return { page: "watch", slug };
  }
  return { page: "home" };
}

function serializeRouteUrl(route: AppRoute): string {
  switch (route.page) {
    case "home":
      return "/";
    case "following":
      return "/?page=following";
    case "signin":
      return "/?page=signin";
    case "signup":
      return "/?page=signup";
    case "profile":
      return "/?page=profile";
    case "studio":
      return "/?page=studio";
    case "watch":
      return `/?page=watch&channel=${encodeURIComponent(route.slug)}`;
  }
}

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "V";
  const second = parts[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase();
}

export function AppShell() {
  const env = useMemo(() => getFrontendEnv(), []);
  const { user, markChannelBanned } = useAuth();
  const { theme, openCookieSettings } = useTheme();

  const [route, setRoute] = useState<AppRoute>(() => parseRouteFromLocation());
  const [activeCategory, setActiveCategory] = useState<"All Live" | StreamCategory>("All Live");
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [isBroadcastLive, setIsBroadcastLive] = useState(false);
  const [broadcastMeta, setBroadcastMeta] = useState<{
    title: string;
    category: StreamCategory;
  } | null>(null);
  const [rawLiveStreams, setRawLiveStreams] = useState<PublicUserSummary[]>([]);
  const [isLiveLoading, setIsLiveLoading] = useState(true);
  const [isOfflineFallback, setIsOfflineFallback] = useState(false);
  const [resolvedChannels, setResolvedChannels] = useState<Record<string, StreamDirectoryItem>>({});
  const [bannedChannels, setBannedChannels] = useState<
    Record<string, { isBanned: boolean; reason: string | null }>
  >({});
  const wsOverridesRef = useRef<
    Map<string, { status: "live" | "offline"; user?: PublicUserSummary }>
  >(new Map());

  const applySnapshot = useCallback((channels: PublicUserSummary[]) => {
    // 1. Exclude any channels that went offline via WS
    const merged = channels.filter((ch) => {
      const override = wsOverridesRef.current.get(ch.username.toLowerCase());
      if (override && override.status === "offline") {
        return false;
      }
      return true;
    });

    // 2. Add or update channels that went live via WS and weren't in HTTP snapshot
    for (const [slug, override] of wsOverridesRef.current.entries()) {
      if (override.status === "live" && override.user) {
        const exists = merged.some((ch) => ch.username.toLowerCase() === slug);
        if (!exists) {
          merged.push(override.user);
        }
      }
    }

    setRawLiveStreams(merged);
    setIsLiveLoading(false);
    setIsOfflineFallback(false);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    void fetchLiveChannelsApi(controller.signal, user?.accessToken)
      .then((channels) => {
        if (isMounted) {
          if (channels !== null) {
            applySnapshot(channels);
          } else {
            setIsLiveLoading(false);
            setIsOfflineFallback(true);
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsLiveLoading(false);
          setIsOfflineFallback(true);
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [applySnapshot, user?.accessToken]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.WebSocket) {
      return;
    }
    const wsUrl = `${env.realtimeWsUrl.replace(/^http/, "ws")}/ws/live`;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let isCleanedUp = false;

    function connect() {
      if (isCleanedUp) return;
      try {
        socket = new WebSocket(wsUrl);
        socket.onopen = () => {
          void fetchLiveChannelsApi(undefined, user?.accessToken).then((channels) => {
            if (!isCleanedUp && channels !== null) {
              applySnapshot(channels);
            }
          });
        };
        socket.onmessage = (event) => {
          try {
            const frame = JSON.parse(event.data);
            if (frame.type === "stream.status" && frame.payload) {
              setIsLiveLoading(false);
              const { channelId, status } = frame.payload;
              const cleanSlug = String(channelId || "").toLowerCase();
              if (status === "live") {
                wsOverridesRef.current.set(cleanSlug, { status: "live" });
                void fetchPublicUserApi(cleanSlug, undefined, user?.accessToken).then((fetched) => {
                  if (!isCleanedUp && fetched && !("isBanned" in fetched)) {
                    wsOverridesRef.current.set(cleanSlug, {
                      status: "live",
                      user: { ...fetched, isLive: true },
                    });
                    setRawLiveStreams((prev) => {
                      const next = prev.filter(
                        (p) => p.username.toLowerCase() !== cleanSlug,
                      );
                      return [...next, { ...fetched, isLive: true }];
                    });
                    setResolvedChannels((prev) => {
                      const existing = prev[cleanSlug];
                      if (!existing) return prev;
                      return {
                        ...prev,
                        [cleanSlug]: {
                          ...existing,
                          ...publicUserToStreamItem({ ...fetched, isLive: true }),
                        },
                      };
                    });
                  }
                });
              } else if (status === "offline") {
                wsOverridesRef.current.set(cleanSlug, { status: "offline" });
                setRawLiveStreams((prev) =>
                  prev.filter((p) => p.username.toLowerCase() !== cleanSlug),
                );
                setResolvedChannels((prev) => {
                  const existing = prev[cleanSlug];
                  if (!existing) return prev;
                  return {
                    ...prev,
                    [cleanSlug]: {
                      ...existing,
                      isLive: false,
                      subCategory: "Offline channel",
                      uptime: "Offline",
                    },
                  };
                });
              }
            } else if (frame.type === "stream.snapshot" && frame.payload) {
              const { channelId, snapshotUrl } = frame.payload;
              if (channelId && snapshotUrl) {
                saveStreamSnapshot(String(channelId), String(snapshotUrl));
              }
            } else if (frame.type === "moderation.banned" && frame.payload) {
              const channelSlug = String(
                frame.payload.channelSlug || frame.payload.channelId || "",
              ).toLowerCase();
              if (channelSlug) {
                markChannelBanned(channelSlug);
                setBannedChannels((prev) => ({
                  ...prev,
                  [channelSlug]: { isBanned: true, reason: frame.payload.reason ?? null },
                }));
              }
            }
          } catch {
            // Ignore malformed WS frames
          }
        };
        socket.onclose = () => {
          if (!isCleanedUp) {
            reconnectTimer = window.setTimeout(connect, 3000);
          }
        };
        socket.onerror = () => {
          socket?.close();
        };
      } catch {
        if (!isCleanedUp) {
          reconnectTimer = window.setTimeout(connect, 5000);
        }
      }
    }

    connect();

    return () => {
      isCleanedUp = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [applySnapshot, env.realtimeWsUrl, markChannelBanned, user?.accessToken]);

  useEffect(() => {
    function handlePopState() {
      setRoute(parseRouteFromLocation());
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((nextRoute: AppRoute) => {
    setRoute(nextRoute);
    if (typeof window !== "undefined") {
      const nextUrl = serializeRouteUrl(nextRoute);
      if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
        window.history.pushState(null, "", nextUrl);
      }
      if (!navigator.userAgent.includes("jsdom")) {
        window.scrollTo?.({ top: 0 });
      }
    }
  }, []);

  const streams = useMemo<readonly StreamDirectoryItem[]>(() => {
    const items: StreamDirectoryItem[] =
      isOfflineFallback && rawLiveStreams.length === 0
        ? [...INITIAL_LIVE_STREAMS]
        : rawLiveStreams.map((item) =>
            publicUserToStreamItem({
              ...item,
              isLive: true,
            }),
          );

    if (user && isBroadcastLive) {
      const userCategory = broadcastMeta?.category ?? user.channelCategory;
      const liveItem: StreamDirectoryItem = {
        id: `ch_${user.username}`,
        slug: user.username,
        displayName: user.displayName,
        title: broadcastMeta?.title ?? user.channelTitle,
        isLive: true,
        viewerCount: 1,
        category: CATEGORY_SET.has(userCategory) ? userCategory : "Programming",
        subCategory: "WebRTC Direct",
        tags: ["Live Studio", "Low Latency"],
        uptime: "0m",
        quality: "1080p60",
        ingestProtocol: "WebRTC WHIP",
        followersLabel: "1",
        bio: user.bio || "Live broadcast powered by VeloStream Studio.",
        schedule: ["Live now from VeloStream Studio"],
        scene: "rust",
        avatarInitials: deriveInitials(user.displayName),
        avatarAccent: "#2563EB",
        avatarUrl: user.avatarUrl,
      };

      const existingIndex = items.findIndex(
        (item) => item.slug.toLowerCase() === user.username.toLowerCase(),
      );
      if (existingIndex === -1) {
        return [liveItem, ...items];
      }
      return items.map((item, idx) => (idx === existingIndex ? liveItem : item));
    }

    return items;
  }, [broadcastMeta, isBroadcastLive, isOfflineFallback, rawLiveStreams, user]);

  const visibleStreams = useMemo(() => {
    const banned = new Set((user?.bannedFromSlugs ?? []).map((s) => s.toLowerCase()));
    if (banned.size === 0) return streams;
    return streams.filter((s) => !banned.has(s.slug.toLowerCase()));
  }, [streams, user?.bannedFromSlugs]);

  const searchResults = useDirectorySearch(searchQuery, streams, user);

  const handleSelectSearchedUser = useCallback(
    (match: DirectoryUserMatch) => {
      const existing = streams.find(
        (s) => s.slug.toLowerCase() === match.username.toLowerCase(),
      );
      if (!existing) {
        const item = publicUserToStreamItem(match);
        setResolvedChannels((prev) => ({
          ...prev,
          [match.username.toLowerCase()]: item,
        }));
      }
      navigate({ page: "watch", slug: match.username });
    },
    [navigate, streams],
  );

  useEffect(() => {
    if (route.page !== "watch") {
      return;
    }
    const slugLower = route.slug.toLowerCase();
    if (bannedChannels[slugLower]) {
      return;
    }
    const inDirectory = streams.some((s) => s.slug.toLowerCase() === slugLower);
    if ((inDirectory && !user) || (resolvedChannels[slugLower] && !user?.bannedFromSlugs?.includes(slugLower))) {
      return;
    }
    if (user && user.username.toLowerCase() === slugLower) {
      setResolvedChannels((prev) => ({
        ...prev,
        [slugLower]: publicUserToStreamItem({
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          bio: user.bio,
          isLive: isBroadcastLive,
          channelTitle: user.channelTitle,
          channelCategory: user.channelCategory,
        }),
      }));
      return;
    }

    const controller = new AbortController();
    void fetchPublicUserApi(route.slug, controller.signal, user?.accessToken).then((fetched) => {
      if (controller.signal.aborted || !fetched) {
        return;
      }
      if ("isBanned" in fetched && fetched.isBanned) {
        markChannelBanned(route.slug);
        setBannedChannels((prev) => ({
          ...prev,
          [slugLower]: { isBanned: true, reason: fetched.reason },
        }));
        return;
      }
      setResolvedChannels((prev) => ({
        ...prev,
        [slugLower]: publicUserToStreamItem(fetched),
      }));
    });
    return () => controller.abort();
  }, [bannedChannels, isBroadcastLive, markChannelBanned, resolvedChannels, route, streams, user]);

  const showSidebar =
    route.page === "home" ||
    route.page === "following" ||
    route.page === "watch" ||
    route.page === "profile";

  const isWatchChannelBanned =
    route.page === "watch" &&
    (Boolean(user?.bannedFromSlugs?.includes(route.slug.toLowerCase())) ||
      bannedChannels[route.slug.toLowerCase()]?.isBanned === true);

  const activeWatchChannel =
    route.page === "watch"
      ? streams.find((stream) => stream.slug.toLowerCase() === route.slug.toLowerCase()) ??
        resolvedChannels[route.slug.toLowerCase()] ??
        (isWatchChannelBanned
          ? {
              id: `ch_${route.slug}`,
              slug: route.slug,
              displayName: route.slug,
              title: `${route.slug}'s channel`,
              isLive: false,
              viewerCount: 0,
              category: "Programming" as const,
              subCategory: "Offline",
              tags: [],
              uptime: "Offline",
              quality: "1080p60",
              ingestProtocol: "WebRTC WHIP",
              followersLabel: "Creator channel",
              bio: "",
              schedule: [],
              scene: "rust" as const,
              avatarInitials: route.slug.slice(0, 2).toUpperCase(),
              avatarAccent: "#EF4444",
            }
          : undefined)
      : undefined;

  return (
    <div className="flex min-h-[calc(100vh-1rem)] flex-col bg-[var(--vs-canvas)] text-[var(--vs-text)] sm:min-h-[calc(100vh-2rem)]">
      <CookieConsentGate />

      <Navbar
        route={route}
        onNavigate={navigate}
        searchQuery={searchQuery}
        onSearchChange={(value) => {
          setSearchQuery(value);
          if (value.trim() && route.page !== "home" && route.page !== "following") {
            navigate({ page: "home" });
          }
        }}
        searchResults={searchResults}
        onSelectUser={handleSelectSearchedUser}
        {...(showSidebar ? { onToggleSidebar: () => setSidebarCollapsed((prev) => !prev) } : {})}
      />

      <div className="flex flex-1">
        {showSidebar && (
          <Sidebar
            collapsed={sidebarCollapsed}
            streams={visibleStreams}
            activeCategory={activeCategory}
            onSelectCategory={setActiveCategory}
            onNavigate={navigate}
            isLoading={isLiveLoading}
          />
        )}

        <div className="min-w-0 flex-1">
          {(route.page === "home" || route.page === "following") && (
            <DiscoveryPage
              streams={visibleStreams}
              activeCategory={activeCategory}
              onSelectCategory={setActiveCategory}
              searchQuery={searchQuery}
              onSearchChange={(value) => setSearchQuery(value)}
              onClearSearch={() => setSearchQuery("")}
              searchResults={searchResults}
              onSelectUser={handleSelectSearchedUser}
              onlyFollowing={route.page === "following"}
              onNavigate={navigate}
              isLoading={isLiveLoading}
              hlsBaseUrl={env.hlsBaseUrl}
              whepBaseUrl={env.whepBaseUrl}
            />
          )}

          {route.page === "watch" &&
            (activeWatchChannel ? (
              <WatchPage
                channel={activeWatchChannel}
                hlsBaseUrl={env.hlsBaseUrl}
                whepBaseUrl={env.whepBaseUrl}
                wsUrl={env.realtimeWsUrl}
                onNavigate={navigate}
                onSelectCategory={setActiveCategory}
                isBanned={isWatchChannelBanned}
                banReason={bannedChannels[route.slug.toLowerCase()]?.reason ?? null}
              />
            ) : (
              <div className="flex min-h-[400px] flex-col items-center justify-center p-8">
                <LoadingSpinner label="Loading channel..." />
              </div>
            ))}

          {(route.page === "signin" || route.page === "signup") && (
            <AuthPage
              mode={route.page}
              onSwitchMode={(nextMode) => navigate({ page: nextMode })}
              onNavigate={navigate}
            />
          )}

          {route.page === "profile" && <ProfilePage onNavigate={navigate} />}

          {route.page === "studio" && (
            <StudioPage
              whipBaseUrl={env.whipBaseUrl}
              wsUrl={env.realtimeWsUrl}
              onNavigate={navigate}
              isBroadcastLive={isBroadcastLive}
              onSetBroadcastLive={(nextLive, details) => {
                setIsBroadcastLive(nextLive);
                setBroadcastMeta(details);
              }}
            />
          )}
        </div>
      </div>

      <footer className="border-t border-[var(--vs-border)] bg-[var(--vs-surface)] px-4 py-3 text-xs text-[var(--vs-text-muted)] sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <span>
            VeloStream · Open live video & chat without ads, donations, or tracking cookies.
          </span>
          <div className="flex items-center gap-4">
            <span>Theme: {theme === "dark" ? "Dark Mode" : "Light Mode"}</span>
            <button
              type="button"
              onClick={openCookieSettings}
              className="font-semibold text-[var(--vs-accent)] hover:underline"
            >
              Cookie preferences
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </AuthProvider>
  );
}
