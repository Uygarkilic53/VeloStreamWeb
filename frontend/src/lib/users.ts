import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import type { StreamCategory, UserAccount } from "./auth";
import { STREAM_CATEGORIES } from "./auth-schemas";
import { getFrontendEnv } from "./env";
import type { StreamDirectoryItem } from "./streams";

export const PublicUserSummarySchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable().optional().default(null),
  bio: z.string().optional().default(""),
  isLive: z.boolean().optional().default(false),
  channelTitle: z.string().nullable().optional().default(null),
  channelCategory: z.enum(STREAM_CATEGORIES).nullable().optional().default(null),
});

export type PublicUserSummary = z.infer<typeof PublicUserSummarySchema>;

const SearchUsersResponseSchema = z.object({
  query: z.string().optional().default(""),
  users: z.array(PublicUserSummarySchema),
  relatedLiveUsers: z.array(PublicUserSummarySchema).optional().default([]),
});

const PublicProfileResponseSchema = z.object({
  user: PublicUserSummarySchema,
});

export interface DirectoryUserMatch {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  isLive: boolean;
  channelTitle: string | null;
  channelCategory: StreamCategory | null;
  viewerCount?: number;
  avatarInitials?: string;
  avatarAccent?: string;
}

export interface DirectorySearchResult {
  matchedUsers: DirectoryUserMatch[];
  relatedLiveUsers: StreamDirectoryItem[];
  isSearching: boolean;
}

const ACCENT_PALETTE = [
  "#2563EB",
  "#0EA5E9",
  "#059669",
  "#D97706",
  "#4F46E5",
  "#E11D48",
  "#0D9488",
  "#7C3AED",
] as const;

function pickAccent(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i += 1) {
    hash = (hash * 31 + username.charCodeAt(i)) | 0;
  }
  return ACCENT_PALETTE[Math.abs(hash) % ACCENT_PALETTE.length] ?? "#2563EB";
}

function deriveInitials(displayName: string, username: string): string {
  const source = (displayName || username).trim();
  const parts = source.split(/\s+/);
  const first = parts[0]?.[0] ?? "V";
  const second = parts[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase();
}

export function publicUserToStreamItem(user: {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  bio?: string;
  isLive?: boolean;
  channelTitle?: string | null;
  channelCategory?: StreamCategory | null;
}): StreamDirectoryItem {
  const isLive = Boolean(user.isLive);
  return {
    id: `ch_${user.username}`,
    slug: user.username,
    displayName: user.displayName || user.username,
    title:
      user.channelTitle?.trim() ||
      (isLive ? `${user.displayName || user.username}'s live broadcast` : `${user.displayName || user.username}'s channel`),
    isLive,
    viewerCount: isLive ? 1 : 0,
    category: user.channelCategory ?? "Programming",
    subCategory: isLive ? "Live channel" : "Offline channel",
    tags: isLive ? ["live"] : ["offline"],
    uptime: isLive ? "Live" : "Offline",
    quality: "1080p60",
    ingestProtocol: "WebRTC WHIP",
    followersLabel: "Creator channel",
    bio: user.bio?.trim() || `Creator channel for @${user.username}.`,
    schedule: [isLive ? "Live now on VeloStream" : "Currently offline"],
    scene: "rust",
    avatarInitials: deriveInitials(user.displayName, user.username),
    avatarAccent: pickAccent(user.username),
    avatarUrl: user.avatarUrl ?? null,
  };
}

export async function searchUsersApi(
  query: string,
  signal?: AbortSignal,
): Promise<{ users: PublicUserSummary[]; relatedLiveUsers: PublicUserSummary[] }> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { users: [], relatedLiveUsers: [] };
  }

  const baseUrl = getFrontendEnv().coreApiUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/api/v1/users/search?q=${encodeURIComponent(trimmed)}&limit=12`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) {
      return { users: [], relatedLiveUsers: [] };
    }
    const raw: unknown = await response.json();
    const parsed = SearchUsersResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return { users: [], relatedLiveUsers: [] };
    }
    return {
      users: parsed.data.users,
      relatedLiveUsers: parsed.data.relatedLiveUsers,
    };
  } catch {
    return { users: [], relatedLiveUsers: [] };
  }
}

export async function fetchPublicUserApi(
  username: string,
  signal?: AbortSignal,
): Promise<PublicUserSummary | null> {
  const clean = username.trim().replace(/^@/, "");
  if (!clean) {
    return null;
  }

  const baseUrl = getFrontendEnv().coreApiUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/api/v1/users/${encodeURIComponent(clean)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) {
      return null;
    }
    const raw: unknown = await response.json();
    const parsed = PublicProfileResponseSchema.safeParse(raw);
    return parsed.success ? parsed.data.user : null;
  } catch {
    return null;
  }
}

export function useDirectorySearch(
  searchQuery: string,
  streams: readonly StreamDirectoryItem[],
  currentUser: UserAccount | null,
): DirectorySearchResult {
  const trimmedQuery = searchQuery.trim();
  const [backendResult, setBackendResult] = useState<{
    query: string;
    users: PublicUserSummary[];
    relatedLiveUsers: PublicUserSummary[];
  }>({
    query: "",
    users: [],
    relatedLiveUsers: [],
  });
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!trimmedQuery) {
      setBackendResult({ query: "", users: [], relatedLiveUsers: [] });
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    setIsSearching(true);

    const timer = window.setTimeout(() => {
      void searchUsersApi(trimmedQuery, controller.signal)
        .then((res) => {
          if (!controller.signal.aborted) {
            setBackendResult({
              query: trimmedQuery,
              users: res.users,
              relatedLiveUsers: res.relatedLiveUsers,
            });
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsSearching(false);
          }
        });
    }, 150);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [trimmedQuery]);

  return useMemo(() => {
    if (!trimmedQuery) {
      return {
        matchedUsers: [],
        relatedLiveUsers: [],
        isSearching: false,
      };
    }

    const lowerQuery = trimmedQuery.toLowerCase();
    const handleQuery = lowerQuery.replace(/^@/, "");
    const activeBackend =
      backendResult.query === trimmedQuery
        ? backendResult
        : { users: [], relatedLiveUsers: [] };

    const streamBySlug = new Map<string, StreamDirectoryItem>();
    for (const stream of streams) {
      streamBySlug.set(stream.slug.toLowerCase(), stream);
    }

    const usersByKey = new Map<string, DirectoryUserMatch>();

    // 1. Real backend users (online or offline)
    for (const u of activeBackend.users) {
      const key = u.username.toLowerCase();
      const liveStream = streamBySlug.get(key);
      usersByKey.set(key, {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl ?? liveStream?.avatarUrl ?? null,
        bio: u.bio,
        isLive: u.isLive || Boolean(liveStream?.isLive),
        channelTitle: u.channelTitle ?? liveStream?.title ?? null,
        channelCategory: u.channelCategory ?? liveStream?.category ?? null,
        ...(liveStream ? { viewerCount: liveStream.viewerCount } : {}),
        ...(liveStream
          ? {
              avatarInitials: liveStream.avatarInitials,
              avatarAccent: liveStream.avatarAccent,
            }
          : {}),
      });
    }

    // 2. Signed-in user (covers local preview session or immediate profile updates)
    if (currentUser) {
      const key = currentUser.username.toLowerCase();
      const matchesUser =
        (handleQuery.length > 0 && currentUser.username.toLowerCase().includes(handleQuery)) ||
        currentUser.displayName.toLowerCase().includes(lowerQuery);

      if (matchesUser && !usersByKey.has(key)) {
        const liveStream = streamBySlug.get(key);
        usersByKey.set(key, {
          id: currentUser.id,
          username: currentUser.username,
          displayName: currentUser.displayName,
          avatarUrl: currentUser.avatarUrl,
          bio: currentUser.bio,
          isLive: Boolean(liveStream?.isLive),
          channelTitle: liveStream?.title ?? currentUser.channelTitle,
          channelCategory: liveStream?.category ?? currentUser.channelCategory,
          ...(liveStream ? { viewerCount: liveStream.viewerCount } : {}),
        });
      }
    }

    // 3. Directory stream creators matching by username (slug) or displayName
    for (const stream of streams) {
      const key = stream.slug.toLowerCase();
      if (usersByKey.has(key)) continue;
      const matchesCreator =
        (handleQuery.length > 0 && stream.slug.toLowerCase().includes(handleQuery)) ||
        stream.displayName.toLowerCase().includes(lowerQuery);
      if (matchesCreator) {
        usersByKey.set(key, {
          id: stream.id,
          username: stream.slug,
          displayName: stream.displayName,
          avatarUrl: stream.avatarUrl ?? null,
          bio: stream.bio,
          isLive: stream.isLive,
          channelTitle: stream.title,
          channelCategory: stream.category,
          viewerCount: stream.viewerCount,
          avatarInitials: stream.avatarInitials,
          avatarAccent: stream.avatarAccent,
        });
      }
    }

    const matchedUsers = Array.from(usersByKey.values()).sort((a, b) => {
      if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
      const aExact =
        a.username.toLowerCase() === handleQuery || a.displayName.toLowerCase() === lowerQuery
          ? 1
          : 0;
      const bExact =
        b.username.toLowerCase() === handleQuery || b.displayName.toLowerCase() === lowerQuery
          ? 1
          : 0;
      if (aExact !== bExact) return bExact - aExact;
      return a.displayName.localeCompare(b.displayName);
    });

    // Related live users: combine backend related live users + live directory streams
    // matching query text or sharing a category with matched users.
    const matchedCategories = new Set<StreamCategory>();
    for (const u of matchedUsers) {
      if (u.channelCategory) {
        matchedCategories.add(u.channelCategory);
      }
    }

    const liveMap = new Map<string, StreamDirectoryItem>();
    for (const backendLive of activeBackend.relatedLiveUsers) {
      if (!backendLive.isLive) continue;
      const key = backendLive.username.toLowerCase();
      const existingStream = streamBySlug.get(key);
      liveMap.set(
        key,
        existingStream ??
          publicUserToStreamItem({
            ...backendLive,
            isLive: true,
          }),
      );
    }

    for (const stream of streams) {
      if (!stream.isLive) continue;
      const key = stream.slug.toLowerCase();
      if (liveMap.has(key)) continue;

      const haystack = `${stream.title} ${stream.slug} ${stream.displayName} ${stream.category} ${stream.subCategory} ${stream.tags.join(" ")}`.toLowerCase();
      const matchesText = haystack.includes(lowerQuery) || (handleQuery.length > 0 && haystack.includes(handleQuery));
      const matchesMatchedUserCategory = matchedCategories.has(stream.category);
      if (matchesText || matchesMatchedUserCategory) {
        liveMap.set(key, stream);
      }
    }

    const relatedLiveUsers = Array.from(liveMap.values()).sort((a, b) => {
      const aDirect =
        (handleQuery.length > 0 && a.slug.toLowerCase().includes(handleQuery)) ||
        a.displayName.toLowerCase().includes(lowerQuery) ||
        a.title.toLowerCase().includes(lowerQuery)
          ? 1
          : 0;
      const bDirect =
        (handleQuery.length > 0 && b.slug.toLowerCase().includes(handleQuery)) ||
        b.displayName.toLowerCase().includes(lowerQuery) ||
        b.title.toLowerCase().includes(lowerQuery)
          ? 1
          : 0;
      if (aDirect !== bDirect) return bDirect - aDirect;
      return b.viewerCount - a.viewerCount;
    });

    return {
      matchedUsers,
      relatedLiveUsers,
      isSearching,
    };
  }, [backendResult, currentUser, isSearching, streams, trimmedQuery]);
}
