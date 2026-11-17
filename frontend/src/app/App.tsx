import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { CookieConsentGate } from "../components/CookieConsentGate";
import { LeaveStudioModal } from "../components/LeaveStudioModal";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { Navbar, type AppRoute } from "../components/Navbar";
import { Sidebar } from "../components/Sidebar";
import { AuthPage } from "../pages/AuthPage";
import { DiscoveryPage } from "../pages/DiscoveryPage";
import { ProfilePage } from "../pages/ProfilePage";
import { StudioPage } from "../pages/StudioPage";
import { WatchPage, ChannelNotFound } from "../pages/WatchPage";
import { AuthProvider, useAuth, type StreamCategory } from "../lib/auth";
import { hasStoredSession } from "../lib/cookies";
import { getFrontendEnv } from "../lib/env";
import { INITIAL_LIVE_STREAMS, type StreamDirectoryItem } from "../lib/streams";
import { saveStreamSnapshot } from "../lib/snapshots";
import { ThemeProvider, useTheme } from "../lib/theme";
import {
  fetchLiveChannelsApi,
  fetchPublicUserApi,
  publicUserToStreamItem,
  setChannelLiveApi,
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

const LAST_ROUTE_STORAGE_KEY = "velostream_last_route";

function isValidLastRoute(candidate: unknown): candidate is AppRoute {
  if (!candidate || typeof candidate !== "object") return false;
  const c = candidate as AppRoute;
  if (c.page === "signin" || c.page === "signup") return false;
  if (c.page === "home" || c.page === "following" || c.page === "profile" || c.page === "studio") {
    return true;
  }
  if (c.page === "watch" && typeof c.slug === "string" && c.slug.trim().length > 0) {
    return true;
  }
  return false;
}

function getStoredLastRoute(): AppRoute | null {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(LAST_ROUTE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (isValidLastRoute(parsed)) {
      return parsed;
    }
  } catch {
    // Ignore storage parse errors
  }
  return null;
}

function saveStoredLastRoute(routeToSave: AppRoute) {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  if (routeToSave.page === "signin" || routeToSave.page === "signup") return;
  try {
    window.sessionStorage.setItem(LAST_ROUTE_STORAGE_KEY, JSON.stringify(routeToSave));
  } catch {
    // Ignore storage errors
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function parseRouteFromLocation(): AppRoute {
  if (typeof window === "undefined") {
    return { page: "home" };
  }
  const url = new URL(window.location.href);
  const pageParam = url.searchParams.get("page");
  const channelParam = url.searchParams.get("channel");
  const watchParam = url.searchParams.get("watch");

  if ((pageParam === "watch" || !pageParam) && channelParam) {
    return { page: "watch", slug: channelParam };
  }
  if (watchParam) {
    return { page: "watch", slug: watchParam };
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
  if (path.startsWith("/@")) {
    const slug = decodeURIComponent(path.slice(2));
    if (slug) return { page: "watch", slug };
  }
  if (path.length > 1 && !path.slice(1).includes("/") && !path.slice(1).includes(".")) {
    const slug = decodeURIComponent(path.slice(1));
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

function getRouteDisplayName(route?: AppRoute | null): string {
  if (!route) return "another page";
  switch (route.page) {
    case "home":
      return "Browse";
    case "following":
      return "Following";
    case "watch":
      return `@${route.slug}`;
    case "profile":
      return "Profile";
    case "signin":
      return "Sign In";
    case "signup":
      return "Sign Up";
    case "studio":
      return "Studio";
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
  const { user, isHydrating, markChannelBanned, clearChannelBanned, signOut } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;
  const isHydratingRef = useRef(isHydrating);
  isHydratingRef.current = isHydrating;
  const { theme, openCookieSettings } = useTheme();

  const [route, setRoute] = useState<AppRoute>(() => {
    const initial = parseRouteFromLocation();
    const hasSession = hasStoredSession();

    if (hasSession && (initial.page === "signin" || initial.page === "signup")) {
      const targetRoute = getStoredLastRoute() ?? { page: "home" };
      if (typeof window !== "undefined") {
        const nextUrl = serializeRouteUrl(targetRoute);
        window.history.replaceState(null, "", nextUrl);
      }
      return targetRoute;
    }

    if (!hasSession && initial.page === "studio") {
      if (typeof window !== "undefined") {
        const nextUrl = serializeRouteUrl({ page: "signin" });
        window.history.replaceState(null, "", nextUrl);
      }
      return { page: "signin" };
    }

    return initial;
  });
  const lastNonAuthRouteRef = useRef<AppRoute | null>(null);
  if (lastNonAuthRouteRef.current === null) {
    const initial = parseRouteFromLocation();
    const hasSession = hasStoredSession();
    if (
      initial.page !== "signin" &&
      initial.page !== "signup" &&
      !(initial.page === "studio" && !hasSession)
    ) {
      saveStoredLastRoute(initial);
      lastNonAuthRouteRef.current = initial;
    } else {
      lastNonAuthRouteRef.current = getStoredLastRoute() ?? { page: "home" };
    }
  }
  const [activeCategory, setActiveCategory] = useState<"All Live" | StreamCategory>("All Live");
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [isBroadcastLive, setIsBroadcastLive] = useState(false);
  const isBroadcastLiveRef = useRef(isBroadcastLive);
  isBroadcastLiveRef.current = isBroadcastLive;
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const isBroadcastingRef = useRef(isBroadcasting);
  isBroadcastingRef.current = isBroadcasting;
  const routeRef = useRef(route);
  routeRef.current = route;

  const [isLeaveStudioModalOpen, setIsLeaveStudioModalOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<{
    route: AppRoute;
    signOutAfter?: boolean;
  } | null>(null);
  const pendingNavigationRef = useRef<{
    route: AppRoute;
    signOutAfter?: boolean;
  } | null>(null);
  const [isEndingBroadcast, setIsEndingBroadcast] = useState(false);
  const endBroadcastRef = useRef<(() => Promise<void>) | null>(null);
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
  const [notFoundChannels, setNotFoundChannels] = useState<Record<string, boolean>>({});
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
                    setNotFoundChannels((prev) => {
                      if (!prev[cleanSlug]) return prev;
                      const next = { ...prev };
                      delete next[cleanSlug];
                      return next;
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
              )
                .trim()
                .replace(/^@/, "")
                .toLowerCase();
              const targetUserId = frame.payload.userId?.trim();
              const targetUsername = frame.payload.username?.trim().replace(/^@/, "").toLowerCase();
              const currentUser = userRef.current;
              const currentUserId = currentUser?.id?.trim();
              const currentUsername = currentUser?.username?.trim().replace(/^@/, "").toLowerCase();
              const isForCurrentUser =
                !targetUserId && !targetUsername
                  ? true
                  : Boolean(
                      (currentUserId && targetUserId && targetUserId === currentUserId) ||
                      (currentUsername && targetUsername && targetUsername === currentUsername),
                    );
              if (channelSlug && isForCurrentUser) {
                markChannelBanned(channelSlug);
                setBannedChannels((prev) => ({
                  ...prev,
                  [channelSlug]: { isBanned: true, reason: frame.payload.reason ?? null },
                }));
              }
            } else if (frame.type === "moderation.unbanned" && frame.payload) {
              const payload = frame.payload as {
                channelId?: string;
                channelSlug?: string;
                userId?: string;
                username?: string;
              };
              const channelSlug = String(
                payload.channelSlug || payload.channelId || "",
              )
                .trim()
                .replace(/^@/, "")
                .toLowerCase();
              const targetUserId = payload.userId?.trim();
              const targetUsername = payload.username?.trim().replace(/^@/, "").toLowerCase();
              const currentUser = userRef.current;
              const currentUserId = currentUser?.id?.trim();
              const currentUsername = currentUser?.username?.trim().replace(/^@/, "").toLowerCase();
              const isForCurrentUser =
                !targetUserId && !targetUsername
                  ? true
                  : Boolean(
                      (currentUserId && targetUserId && targetUserId === currentUserId) ||
                      (currentUsername && targetUsername && targetUsername === currentUsername),
                    );
              if (channelSlug && isForCurrentUser) {
                clearChannelBanned?.(channelSlug);
                setBannedChannels((prev) => {
                  const next = { ...prev };
                  delete next[channelSlug];
                  return next;
                });
                toast.success("Your ban is vanished");
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
  }, [applySnapshot, clearChannelBanned, env.realtimeWsUrl, markChannelBanned, user?.accessToken]);

  useEffect(() => {
    function handlePopState() {
      const nextRoute = parseRouteFromLocation();
      const hasSession = Boolean(userRef.current || hasStoredSession());

      if (
        routeRef.current.page === "studio" &&
        (isBroadcastLiveRef.current || isBroadcastingRef.current) &&
        nextRoute.page !== "studio"
      ) {
        if (typeof window !== "undefined") {
          window.history.pushState(null, "", serializeRouteUrl({ page: "studio" }));
        }
        pendingNavigationRef.current = { route: nextRoute };
        setPendingNavigation({ route: nextRoute });
        setIsLeaveStudioModalOpen(true);
        return;
      }

      if (hasSession && (nextRoute.page === "signin" || nextRoute.page === "signup")) {
        const targetRoute =
          lastNonAuthRouteRef.current &&
          lastNonAuthRouteRef.current.page !== "signin" &&
          lastNonAuthRouteRef.current.page !== "signup"
            ? lastNonAuthRouteRef.current
            : getStoredLastRoute() ?? { page: "home" };

        setRoute(targetRoute);
        if (typeof window !== "undefined") {
          const nextUrl = serializeRouteUrl(targetRoute);
          window.history.replaceState(null, "", nextUrl);
        }
        return;
      }

      if (!hasSession && nextRoute.page === "studio") {
        setRoute({ page: "signin" });
        if (typeof window !== "undefined") {
          const nextUrl = serializeRouteUrl({ page: "signin" });
          window.history.replaceState(null, "", nextUrl);
        }
        return;
      }

      setRoute(nextRoute);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!isBroadcastLive && !isBroadcasting) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
      return "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isBroadcastLive, isBroadcasting]);

  useEffect(() => {
    if (route.page !== "signin" && route.page !== "signup") {
      if (route.page === "studio" && !user && !hasStoredSession()) {
        return;
      }
      lastNonAuthRouteRef.current = route;
      saveStoredLastRoute(route);
    }
  }, [route, user]);

  useEffect(() => {
    if (isHydrating) {
      return;
    }

    if (user && (route.page === "signin" || route.page === "signup")) {
      const targetRoute =
        lastNonAuthRouteRef.current &&
        lastNonAuthRouteRef.current.page !== "signin" &&
        lastNonAuthRouteRef.current.page !== "signup"
          ? lastNonAuthRouteRef.current
          : getStoredLastRoute() ?? { page: "home" };

      setRoute(targetRoute);
      if (typeof window !== "undefined") {
        const nextUrl = serializeRouteUrl(targetRoute);
        window.history.replaceState(null, "", nextUrl);
      }
      return;
    }

    if (!user && route.page === "studio") {
      setRoute({ page: "signin" });
      if (typeof window !== "undefined") {
        const nextUrl = serializeRouteUrl({ page: "signin" });
        window.history.replaceState(null, "", nextUrl);
      }
      return;
    }
  }, [isHydrating, route.page, user]);

  const executeNavigation = useCallback((nextRoute: AppRoute) => {
    const hasSession = Boolean(userRef.current || hasStoredSession());

    if (hasSession && (nextRoute.page === "signin" || nextRoute.page === "signup")) {
      const targetRoute =
        lastNonAuthRouteRef.current &&
        lastNonAuthRouteRef.current.page !== "signin" &&
        lastNonAuthRouteRef.current.page !== "signup"
          ? lastNonAuthRouteRef.current
          : getStoredLastRoute() ?? { page: "home" };

      setRoute(targetRoute);
      if (typeof window !== "undefined") {
        const nextUrl = serializeRouteUrl(targetRoute);
        if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
          window.history.replaceState(null, "", nextUrl);
        }
      }
      return;
    }

    if (!hasSession && nextRoute.page === "studio") {
      setRoute({ page: "signin" });
      if (typeof window !== "undefined") {
        const nextUrl = serializeRouteUrl({ page: "signin" });
        if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
          window.history.replaceState(null, "", nextUrl);
        }
        if (!navigator.userAgent.includes("jsdom")) {
          window.scrollTo?.({ top: 0 });
        }
      }
      return;
    }

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

  const navigate = useCallback(
    (nextRoute: AppRoute) => {
      if (isEndingBroadcast) {
        return;
      }
      // If currently broadcasting live or connecting in studio and clicked to other links in our site:
      if (
        route.page === "studio" &&
        (isBroadcastLive || isBroadcasting) &&
        nextRoute.page !== "studio"
      ) {
        pendingNavigationRef.current = { route: nextRoute };
        setPendingNavigation({ route: nextRoute });
        setIsLeaveStudioModalOpen(true);
        return;
      }

      executeNavigation(nextRoute);
    },
    [route.page, isBroadcastLive, isBroadcasting, isEndingBroadcast, executeNavigation],
  );

  const handleSignOut = useCallback(() => {
    if (isEndingBroadcast) {
      return;
    }
    if (route.page === "studio" && (isBroadcastLive || isBroadcasting)) {
      pendingNavigationRef.current = { route: { page: "home" }, signOutAfter: true };
      setPendingNavigation({ route: { page: "home" }, signOutAfter: true });
      setIsLeaveStudioModalOpen(true);
      return;
    }
    void signOut();
    executeNavigation({ page: "home" });
  }, [route.page, isBroadcastLive, isBroadcasting, isEndingBroadcast, signOut, executeNavigation]);

  const handleCancelLeaveStudio = useCallback(() => {
    setIsLeaveStudioModalOpen(false);
    setPendingNavigation(null);
    pendingNavigationRef.current = null;
  }, []);

  const handleConfirmLeaveStudio = useCallback(async () => {
    const pending = pendingNavigationRef.current;
    setIsEndingBroadcast(true);

    try {
      if (endBroadcastRef.current) {
        await endBroadcastRef.current();
      } else {
        if (userRef.current?.sessionKind !== "preview" && userRef.current?.accessToken) {
          await setChannelLiveApi(false, userRef.current.accessToken);
        }
        toast.success("Broadcast ended.");
      }
    } catch {
      if (userRef.current?.sessionKind !== "preview" && userRef.current?.accessToken) {
        await setChannelLiveApi(false, userRef.current.accessToken).catch(() => ({ ok: false }));
      }
    } finally {
      setIsBroadcastLive(false);
      setIsBroadcasting(false);
      setIsEndingBroadcast(false);
      setIsLeaveStudioModalOpen(false);
      setPendingNavigation(null);
      pendingNavigationRef.current = null;
    }

    if (pending) {
      if (pending.signOutAfter) {
        await signOut();
      }
      executeNavigation(pending.route);
    }
  }, [executeNavigation, signOut]);

  const handleRegisterEndBroadcast = useCallback((fn: (() => Promise<void>) | null) => {
    endBroadcastRef.current = fn;
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
    const banned = new Set(
      (user?.bannedFromSlugs ?? []).map((s) => s.trim().replace(/^@/, "").toLowerCase()),
    );
    if (banned.size === 0) return streams;
    return streams.filter(
      (s) => !banned.has(s.slug.trim().replace(/^@/, "").toLowerCase()),
    );
  }, [streams, user?.bannedFromSlugs]);

  const searchResults = useDirectorySearch(searchQuery, streams, user);

  const handleSelectSearchedUser = useCallback(
    (match: DirectoryUserMatch) => {
      const matchSlug = match.username.toLowerCase();
      setNotFoundChannels((prev) => {
        if (!prev[matchSlug]) return prev;
        const next = { ...prev };
        delete next[matchSlug];
        return next;
      });
      const existing = streams.find(
        (s) => s.slug.toLowerCase() === matchSlug,
      );
      if (!existing) {
        const item = publicUserToStreamItem(match);
        setResolvedChannels((prev) => ({
          ...prev,
          [matchSlug]: item,
        }));
      }
      navigate({ page: "watch", slug: match.username });
    },
    [navigate, streams],
  );

  const cleanWatchSlug = useMemo(() => {
    if (route.page !== "watch") return "";
    return route.slug.trim().replace(/^@/, "").toLowerCase();
  }, [route]);

  useEffect(() => {
    if (route.page !== "watch" || !cleanWatchSlug) {
      return;
    }
    if (bannedChannels[cleanWatchSlug] || notFoundChannels[cleanWatchSlug]) {
      return;
    }
    const inDirectory = streams.some((s) => s.slug.toLowerCase() === cleanWatchSlug);
    if ((inDirectory && !user) || (resolvedChannels[cleanWatchSlug] && !user?.bannedFromSlugs?.includes(cleanWatchSlug))) {
      return;
    }
    if (user && user.username.toLowerCase() === cleanWatchSlug) {
      setResolvedChannels((prev) => ({
        ...prev,
        [cleanWatchSlug]: publicUserToStreamItem({
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
      setNotFoundChannels((prev) => {
        if (!prev[cleanWatchSlug]) return prev;
        const next = { ...prev };
        delete next[cleanWatchSlug];
        return next;
      });
      return;
    }

    const controller = new AbortController();
    void fetchPublicUserApi(cleanWatchSlug, controller.signal, user?.accessToken)
      .then((fetched) => {
        if (controller.signal.aborted) {
          return;
        }
        if (!fetched) {
          setNotFoundChannels((prev) => ({
            ...prev,
            [cleanWatchSlug]: true,
          }));
          return;
        }
        if ("isBanned" in fetched && fetched.isBanned) {
          markChannelBanned(cleanWatchSlug);
          setBannedChannels((prev) => ({
            ...prev,
            [cleanWatchSlug]: { isBanned: true, reason: fetched.reason },
          }));
          return;
        }
        setNotFoundChannels((prev) => {
          if (!prev[cleanWatchSlug]) return prev;
          const next = { ...prev };
          delete next[cleanWatchSlug];
          return next;
        });
        setResolvedChannels((prev) => ({
          ...prev,
          [cleanWatchSlug]: publicUserToStreamItem(fetched),
        }));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setNotFoundChannels((prev) => ({
            ...prev,
            [cleanWatchSlug]: true,
          }));
        }
      });
    return () => controller.abort();
  }, [bannedChannels, cleanWatchSlug, isBroadcastLive, markChannelBanned, notFoundChannels, resolvedChannels, route.page, streams, user]);

  const showSidebar =
    route.page === "home" ||
    route.page === "following" ||
    route.page === "watch" ||
    route.page === "profile";

  const isWatchChannelBanned =
    route.page === "watch" &&
    Boolean(cleanWatchSlug) &&
    (Boolean(
      user?.bannedFromSlugs?.some(
        (s) => s.trim().replace(/^@/, "").toLowerCase() === cleanWatchSlug,
      ),
    ) ||
      bannedChannels[cleanWatchSlug]?.isBanned === true);

  const activeWatchChannel =
    route.page === "watch" && cleanWatchSlug
      ? streams.find((stream) => stream.slug.toLowerCase() === cleanWatchSlug) ??
        resolvedChannels[cleanWatchSlug] ??
        (isWatchChannelBanned
          ? {
              id: `ch_${cleanWatchSlug}`,
              slug: cleanWatchSlug,
              displayName: cleanWatchSlug,
              title: `${cleanWatchSlug}'s channel`,
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
              avatarInitials: cleanWatchSlug.slice(0, 2).toUpperCase(),
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
        onSignOut={handleSignOut}
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
                banReason={bannedChannels[cleanWatchSlug]?.reason ?? null}
              />
            ) : !cleanWatchSlug || notFoundChannels[cleanWatchSlug] ? (
              <ChannelNotFound
                slug={route.slug}
                onNavigate={navigate}
              />
            ) : (
              <div className="flex min-h-[400px] flex-col items-center justify-center p-8">
                <LoadingSpinner label="Loading channel..." />
              </div>
            ))}

          {(route.page === "signin" || route.page === "signup") &&
            (user ? null : isHydrating ? (
              <div className="flex min-h-[400px] flex-col items-center justify-center p-8">
                <LoadingSpinner label="Checking session..." />
              </div>
            ) : (
              <AuthPage
                mode={route.page}
                onSwitchMode={(nextMode) => navigate({ page: nextMode })}
                onNavigate={navigate}
              />
            ))}

          {route.page === "profile" && <ProfilePage onNavigate={navigate} />}

          {route.page === "studio" &&
            (user ? (
              <StudioPage
                whipBaseUrl={env.whipBaseUrl}
                wsUrl={env.realtimeWsUrl}
                onNavigate={navigate}
                isBroadcastLive={isBroadcastLive}
                onSetBroadcastLive={(nextLive, details) => {
                  setIsBroadcastLive(nextLive);
                  if (nextLive) {
                    setIsBroadcasting(true);
                  }
                  setBroadcastMeta(details);
                }}
                onRegisterEndBroadcast={handleRegisterEndBroadcast}
                onSetBroadcasting={setIsBroadcasting}
              />
            ) : isHydrating ? (
              <div className="flex min-h-[400px] flex-col items-center justify-center p-8">
                <LoadingSpinner label="Loading studio..." />
              </div>
            ) : null)}
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

      <LeaveStudioModal
        isOpen={isLeaveStudioModalOpen}
        onCancel={handleCancelLeaveStudio}
        onConfirm={handleConfirmLeaveStudio}
        targetPageName={
          pendingNavigation?.signOutAfter
            ? "sign out"
            : getRouteDisplayName(pendingNavigation?.route)
        }
        isEnding={isEndingBroadcast}
      />
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
