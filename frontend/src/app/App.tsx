import { useCallback, useEffect, useMemo, useState } from "react";
import { CookieConsentGate } from "../components/CookieConsentGate";
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
import { ThemeProvider, useTheme } from "../lib/theme";
import {
  fetchPublicUserApi,
  publicUserToStreamItem,
  useDirectorySearch,
  type DirectoryUserMatch,
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
  const { user } = useAuth();
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
  const [resolvedChannels, setResolvedChannels] = useState<Record<string, StreamDirectoryItem>>({});

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
    if (!user || !isBroadcastLive) {
      return INITIAL_LIVE_STREAMS;
    }

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

    const existingIndex = INITIAL_LIVE_STREAMS.findIndex((item) => item.slug === user.username);
    if (existingIndex === -1) {
      return [liveItem, ...INITIAL_LIVE_STREAMS];
    }
    return INITIAL_LIVE_STREAMS.map((item) => (item.slug === user.username ? liveItem : item));
  }, [broadcastMeta, isBroadcastLive, user]);

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
    const inDirectory = streams.some((s) => s.slug.toLowerCase() === slugLower);
    if (inDirectory || resolvedChannels[slugLower]) {
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
    void fetchPublicUserApi(route.slug, controller.signal).then((fetched) => {
      if (fetched && !controller.signal.aborted) {
        setResolvedChannels((prev) => ({
          ...prev,
          [slugLower]: publicUserToStreamItem(fetched),
        }));
      }
    });
    return () => controller.abort();
  }, [isBroadcastLive, resolvedChannels, route, streams, user]);

  const showSidebar =
    route.page === "home" ||
    route.page === "following" ||
    route.page === "watch" ||
    route.page === "profile";

  const activeWatchChannel =
    route.page === "watch"
      ? streams.find((stream) => stream.slug.toLowerCase() === route.slug.toLowerCase()) ??
        resolvedChannels[route.slug.toLowerCase()] ??
        streams[0]
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
            streams={streams}
            activeCategory={activeCategory}
            onSelectCategory={setActiveCategory}
            onNavigate={navigate}
          />
        )}

        <div className="min-w-0 flex-1">
          {(route.page === "home" || route.page === "following") && (
            <DiscoveryPage
              streams={streams}
              activeCategory={activeCategory}
              onSelectCategory={setActiveCategory}
              searchQuery={searchQuery}
              onSearchChange={(value) => setSearchQuery(value)}
              onClearSearch={() => setSearchQuery("")}
              searchResults={searchResults}
              onSelectUser={handleSelectSearchedUser}
              onlyFollowing={route.page === "following"}
              onNavigate={navigate}
            />
          )}

          {route.page === "watch" && activeWatchChannel && (
            <WatchPage
              channel={activeWatchChannel}
              hlsBaseUrl={env.hlsBaseUrl}
              wsUrl={env.realtimeWsUrl}
              onNavigate={navigate}
              onSelectCategory={setActiveCategory}
            />
          )}

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
    <ThemeProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  );
}
