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

const LiveChannelsResponseSchema = z.object({
  channels: z.array(PublicUserSummarySchema),
});

const FollowingUsersResponseSchema = z.object({
  following: z.array(PublicUserSummarySchema),
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

function pickAccent(username?: string): string {
  const safe = username ?? "";
  let hash = 0;
  for (let i = 0; i < safe.length; i += 1) {
    hash = (hash * 31 + safe.charCodeAt(i)) | 0;
  }
  return ACCENT_PALETTE[Math.abs(hash) % ACCENT_PALETTE.length] ?? "#2563EB";
}

function deriveInitials(displayName?: string, username?: string): string {
  const source = (displayName || username || "V").trim();
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
  accessToken?: string | null,
): Promise<{ users: PublicUserSummary[]; relatedLiveUsers: PublicUserSummary[] }> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { users: [], relatedLiveUsers: [] };
  }

  const baseUrl = getFrontendEnv().coreApiUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/api/v1/users/search?q=${encodeURIComponent(trimmed)}&limit=12`;

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    const response = await fetch(url, {
      method: "GET",
      headers,
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

export type FetchPublicUserResult =
  | (PublicUserSummary & { isBanned?: false })
  | { isBanned: true; bannedBy: string; reason: string | null; message: string };

export async function fetchPublicUserApi(
  username: string,
  signal?: AbortSignal,
  accessToken?: string | null,
): Promise<FetchPublicUserResult | null> {
  const clean = username.trim().replace(/^@/, "");
  if (!clean) {
    return null;
  }

  const baseUrl = getFrontendEnv().coreApiUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/api/v1/users/${encodeURIComponent(clean)}`;

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    const response = await fetch(url, {
      method: "GET",
      headers,
      ...(signal ? { signal } : {}),
    });

    if (response.status === 403) {
      const raw: unknown = await response.json().catch(() => ({}));
      const errorObj = (typeof raw === "object" && raw !== null ? raw : {}) as {
        error?: string;
        message?: string;
        bannedBy?: string;
        reason?: string | null;
      };
      return {
        isBanned: true,
        bannedBy: errorObj.bannedBy || clean,
        reason: errorObj.reason ?? null,
        message: errorObj.message ?? `You have been banned by @${clean}.`,
      };
    }

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

export async function fetchLiveChannelsApi(
  signal?: AbortSignal,
  accessToken?: string | null,
): Promise<PublicUserSummary[] | null> {
  const baseUrl = getFrontendEnv().coreApiUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/api/v1/channels/live`;

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    const response = await fetch(url, {
      method: "GET",
      headers,
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) {
      return null;
    }
    const raw: unknown = await response.json();
    const parsed = LiveChannelsResponseSchema.safeParse(raw);
    return parsed.success ? parsed.data.channels : null;
  } catch {
    return null;
  }
}

export async function fetchFollowedUsersApi(
  accessToken: string,
  signal?: AbortSignal,
): Promise<PublicUserSummary[]> {
  const baseUrl = getFrontendEnv().coreApiUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/api/v1/users/me/following`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) {
      return [];
    }
    const raw: unknown = await response.json();
    const parsed = FollowingUsersResponseSchema.safeParse(raw);
    return parsed.success ? parsed.data.following : [];
  } catch {
    return [];
  }
}

export async function setChannelLiveApi(
  isLive: boolean,
  accessToken: string,
): Promise<{ ok: boolean; message?: string }> {
  const baseUrl = getFrontendEnv().coreApiUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/api/v1/channels/me/live`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ isLive }),
    });
    const data = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      return { ok: false, message: data.message ?? "Failed to update broadcast status." };
    }
    return data.message ? { ok: true, message: data.message } : { ok: true };
  } catch {
    return { ok: false, message: "Network error updating broadcast status." };
  }
}

function isSelfUser(
  candidate: { id?: string; username: string },
  currentUser: UserAccount | null,
): boolean {
  if (!currentUser) return false;
  if (candidate.id && candidate.id === currentUser.id) return true;
  return candidate.username.toLowerCase() === currentUser.username.toLowerCase();
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
      void searchUsersApi(trimmedQuery, controller.signal, currentUser?.accessToken)
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
  }, [currentUser?.accessToken, currentUser?.id, currentUser?.username, trimmedQuery]);

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

    const bannedSet = new Set((currentUser?.bannedFromSlugs ?? []).map((s) => s.toLowerCase()));
    const usersByKey = new Map<string, DirectoryUserMatch>();

    // 1. Real backend users (online or offline), excluding the signed-in user themselves and banned channels
    for (const u of activeBackend.users) {
      if (isSelfUser(u, currentUser)) continue;
      const key = u.username.toLowerCase();
      if (bannedSet.has(key)) continue;
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

    // 2. Directory stream creators matching by username (slug) or displayName, excluding self and banned
    for (const stream of streams) {
      if (isSelfUser({ id: stream.id, username: stream.slug }, currentUser)) continue;
      const key = stream.slug.toLowerCase();
      if (bannedSet.has(key)) continue;
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
    // matching query text or sharing a category with matched users, excluding self.
    const matchedCategories = new Set<StreamCategory>();
    for (const u of matchedUsers) {
      if (u.channelCategory) {
        matchedCategories.add(u.channelCategory);
      }
    }

    const liveMap = new Map<string, StreamDirectoryItem>();
    for (const backendLive of activeBackend.relatedLiveUsers) {
      if (!backendLive.isLive) continue;
      if (isSelfUser(backendLive, currentUser)) continue;
      const key = backendLive.username.toLowerCase();
      if (bannedSet.has(key)) continue;
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
      if (isSelfUser({ id: stream.id, username: stream.slug }, currentUser)) continue;
      const key = stream.slug.toLowerCase();
      if (bannedSet.has(key)) continue;
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
