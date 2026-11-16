import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { toast } from "react-toastify";
import { GifPicker } from "./GifPicker";
import {
  ImageIcon,
  LockIcon,
  MessageSquareIcon,
  PauseIcon,
  PlayIcon,
  RoleBadgeIcon,
  SendIcon,
  TimerIcon,
  TrashIcon,
  VolumeXIcon,
} from "./Icons";
import {
  ModerationWarningModal,
  type ModerationWarningData,
} from "./ModerationWarningModal";
import { UserActionModal, type UserActionTarget } from "./UserActionModal";
import { useAuth } from "../lib/auth";
import {
  buildChatSocketUrl,
  decodeJwtPayload,
  getRoleColorClass,
  isJwtExpired,
  normalizeChatRole,
} from "../lib/chat";
import { getFrontendEnv } from "../lib/env";
import type { ChatFeedItem } from "../lib/streams";

interface ChatRailProps {
  channelSlug: string;
  wsUrl?: string | undefined;
  isLive?: boolean | undefined;
  creatorMode?: boolean | undefined;
  onViewProfile?: ((username: string) => void) | undefined;
  resetKey?: number | undefined;
}

function formatCountdown(until: Date): string {
  const diffMs = until.getTime() - Date.now();
  if (diffMs <= 0) return "0s";
  if (diffMs > 300 * 24 * 3600 * 1000) return "Permanent";

  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 24);
  const remainingMinutes = minutes % 60;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  if (days > 0) {
    return `${days}d ${remainingHours}h remaining`;
  }
  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m remaining`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s remaining`;
  }
  return `${seconds}s remaining`;
}

function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const fromLocal = window.localStorage.getItem("velostream_auth_session");
    if (fromLocal) {
      const parsed = JSON.parse(fromLocal) as { accessToken?: string };
      if (parsed.accessToken) return parsed.accessToken;
    }
    const fromSession = window.sessionStorage.getItem("velostream_auth_session");
    if (fromSession) {
      const parsed = JSON.parse(fromSession) as { accessToken?: string };
      if (parsed.accessToken) return parsed.accessToken;
    }
  } catch {
    // Ignore storage parse errors
  }
  return null;
}

export function ChatRail({
  channelSlug,
  wsUrl,
  isLive = true,
  creatorMode = false,
  onViewProfile,
  resetKey,
}: ChatRailProps) {
  const {
    user,
    listModerators,
    listSilences,
    markChannelBanned,
    clearChannelBanned,
    updateChannelSettings,
  } = useAuth();
  const { realtimeWsUrl } = getFrontendEnv();
  const [messages, setMessages] = useState<ChatFeedItem[]>([]);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserActionTarget | null>(null);
  const [activeWarning, setActiveWarning] = useState<ModerationWarningData | null>(null);
  const [silencedUntil, setSilencedUntil] = useState<Date | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const clean = channelSlug.trim().replace(/^@/, "").toLowerCase();
      const stored = window.sessionStorage.getItem(`vs_silenced_${clean}`);
      if (stored) {
        const d = new Date(stored);
        if (d.getTime() > Date.now()) return d;
        window.sessionStorage.removeItem(`vs_silenced_${clean}`);
      }
    } catch {
      // ignore
    }
    return null;
  });
  const cleanChannelSlug = channelSlug.trim().replace(/^@/, "").toLowerCase();
  const [moderatorUsernames, setModeratorUsernames] = useState<Set<string>>(new Set());
  const moderatorUsernamesRef = useRef<Set<string>>(moderatorUsernames);
  moderatorUsernamesRef.current = moderatorUsernames;
  const knownModeratorsFromApiRef = useRef<Set<string>>(new Set());
  const [demotedUsernames, setDemotedUsernames] = useState<Set<string>>(new Set());
  const demotedUsernamesRef = useRef<Set<string>>(demotedUsernames);
  demotedUsernamesRef.current = demotedUsernames;
  const [countdownLabel, setCountdownLabel] = useState<string>("");
  const [isChatFrozen, setIsChatFrozen] = useState(false);
  const isChannelCreator =
    creatorMode ||
    Boolean(
      user &&
        user.username.trim().replace(/^@/, "").toLowerCase() === cleanChannelSlug,
    );
  const [isSlowMode, setIsSlowMode] = useState<boolean>(() => {
    if (isChannelCreator && user?.slowMode !== undefined) {
      return Boolean(user.slowMode);
    }
    return false;
  });
  const [slowCooldown, setSlowCooldown] = useState<number>(0);

  // Reset channel-specific state immediately when channelSlug changes
  const [prevSlug, setPrevSlug] = useState(cleanChannelSlug);
  if (prevSlug !== cleanChannelSlug) {
    setPrevSlug(cleanChannelSlug);
    setIsSlowMode(Boolean(isChannelCreator && user?.slowMode));
    setIsChatFrozen(false);
    setSlowCooldown(0);
    setMessages([]);
    setDraft("");
    setNotice(null);
    knownModeratorsFromApiRef.current = new Set();
    setModeratorUsernames(new Set());
    moderatorUsernamesRef.current = new Set();
    setDemotedUsernames(new Set());
    demotedUsernamesRef.current = new Set();
  }

  // Synchronize slow mode state when creator channel settings hydrate
  useEffect(() => {
    if (isChannelCreator && user?.slowMode !== undefined) {
      setIsSlowMode(Boolean(user.slowMode));
    }
  }, [isChannelCreator, user?.slowMode]);

  // 3-second slow mode visual cooldown countdown
  useEffect(() => {
    if (slowCooldown <= 0) return;
    const timer = setInterval(() => {
      setSlowCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [slowCooldown]);

  const prevChannelSlugRef = useRef(cleanChannelSlug);
  const [currentUserRole, setCurrentUserRole] = useState<"Creator" | "Moderator" | "User">(() => {
    if (creatorMode || (user && user.username.trim().replace(/^@/, "").toLowerCase() === cleanChannelSlug)) return "Creator";
    if (user?.role?.toUpperCase() === "MODERATOR") return "Moderator";
    return "User";
  });

  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const userRef = useRef(user);
  userRef.current = user;
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUnmountedRef = useRef(false);
  const chatClosed = !isLive && !creatorMode;

  const isSilenced = silencedUntil !== null && silencedUntil.getTime() > Date.now();
  const isCooldownActive = slowCooldown > 0;
  const isInputDisabled =
    chatClosed ||
    (isChatFrozen && !isChannelCreator) ||
    isSilenced ||
    Boolean(activeWarning) ||
    isCooldownActive;

  // Refresh and reconcile channel moderators from REST API
  const refreshModerators = useCallback(async () => {
    if (!user) return;
    try {
      const res = await listModerators(channelSlug);
      if (res.ok && res.moderators) {
        const modSet = new Set(
          res.moderators.map((m) => m.username.trim().replace(/^@/, "").toLowerCase()),
        );

        // Any user who was previously in the channel's moderator list from the API
        // but is NO LONGER in modSet has been dismissed!
        const dismissedUsers = new Set<string>();
        for (const u of knownModeratorsFromApiRef.current) {
          if (!modSet.has(u)) {
            dismissedUsers.add(u);
          }
        }
        knownModeratorsFromApiRef.current = modSet;

        if (dismissedUsers.size > 0) {
          setDemotedUsernames((prev) => {
            const next = new Set(prev);
            for (const u of dismissedUsers) {
              next.add(u);
            }
            demotedUsernamesRef.current = next;
            return next;
          });
        }

        setModeratorUsernames((prev) => {
          const next = new Set(prev);
          for (const u of dismissedUsers) {
            next.delete(u);
          }
          for (const u of modSet) {
            next.add(u);
          }
          moderatorUsernamesRef.current = next;
          return next;
        });

        if (modSet.size > 0) {
          setDemotedUsernames((prev) => {
            const next = new Set(prev);
            for (const u of modSet) {
              next.delete(u);
            }
            demotedUsernamesRef.current = next;
            return next;
          });
        }

        if (user && !isChannelCreator) {
          const selfClean = user.username.trim().replace(/^@/, "").toLowerCase();
          setCurrentUserRole(modSet.has(selfClean) ? "Moderator" : "User");
        }

        if (dismissedUsers.size > 0 || modSet.size > 0) {
          setMessages((prev) =>
            prev.map((m) => {
              const mClean = m.author.trim().replace(/^@/, "").toLowerCase();
              const isCreatorMsg = mClean === cleanChannelSlug || normalizeChatRole(m.role) === "Creator";
              if (isCreatorMsg) return m;
              if (dismissedUsers.has(mClean)) {
                return {
                  ...m,
                  role: "User",
                  colorClass: getRoleColorClass("User"),
                };
              }
              if (modSet.has(mClean) && m.role !== "Moderator") {
                return {
                  ...m,
                  role: "Moderator",
                  colorClass: getRoleColorClass("Moderator"),
                };
              }
              return m;
            }),
          );
        }
      }
    } catch {
      // Ignore
    }
  }, [channelSlug, cleanChannelSlug, isChannelCreator, listModerators, user]);

  // Hydrate moderator privileges and active silences from REST API
  useEffect(() => {
    if (!user) return;
    if (isChannelCreator) {
      setCurrentUserRole("Creator");
    }
    void refreshModerators();
    if (listSilences) {
      void listSilences(channelSlug).then((res) => {
        if (res.ok && res.silences && user) {
          const myMute = res.silences.find(
            (m) =>
              (m.userId && m.userId === user.id) ||
              m.username.toLowerCase() === user.username.toLowerCase(),
          );
          if (myMute) {
            const exp = myMute.expiresAt ? new Date(myMute.expiresAt) : new Date(Date.now() + 86400000 * 365);
            if (exp.getTime() > Date.now()) {
              setSilencedUntil(exp);
            }
          }
        }
      });
    }
  }, [channelSlug, cleanChannelSlug, isChannelCreator, listSilences, refreshModerators, user]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === "function") {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Reset messages when resetKey changes (e.g. stream ended)
  useEffect(() => {
    if (resetKey !== undefined) {
      setMessages([]);
    }
  }, [resetKey]);

  // Silence timer countdown and sessionStorage synchronization
  useEffect(() => {
    const clean = channelSlug.trim().replace(/^@/, "").toLowerCase();
    if (!silencedUntil) {
      setCountdownLabel("");
      try {
        window.sessionStorage.removeItem(`vs_silenced_${clean}`);
      } catch {
        // ignore
      }
      return;
    }
    try {
      window.sessionStorage.setItem(`vs_silenced_${clean}`, silencedUntil.toISOString());
    } catch {
      // ignore
    }
    const update = () => {
      if (silencedUntil.getTime() <= Date.now()) {
        setSilencedUntil(null);
        setCountdownLabel("");
        try {
          window.sessionStorage.removeItem(`vs_silenced_${clean}`);
        } catch {
          // ignore
        }
      } else {
        setCountdownLabel(formatCountdown(silencedUntil));
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [channelSlug, silencedUntil]);

  const userAccessToken = user?.accessToken;
  const userSessionKind = user?.sessionKind;
  const isGuest = !user;

  // Handle incoming WebSocket frame
  const handleFrame = useCallback(
    (event: MessageEvent) => {
      try {
        const frame = JSON.parse(event.data as string) as {
          type?: string;
          payload?: unknown;
          // Legacy payload support
          content?: string;
        };

        const frameType = frame.type;
        const payload = frame.payload;

        if (frameType === "chat.message" && payload) {
          const item = payload as {
            id: string;
            channelId: string;
            userId?: string;
            username: string;
            avatarUrl?: string | null;
            role?: "Creator" | "Moderator" | "User";
            content: string;
            messageType?: "text" | "gif";
            gifUrl?: string | null;
            isDeleted?: boolean;
            createdAt?: string;
          };

          const now = item.createdAt ? new Date(item.createdAt) : new Date();
          const timestamp = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
          const rawRole = item.role ?? (item.username.trim().replace(/^@/, "").toLowerCase() === cleanChannelSlug ? "Creator" : "User");
          const normRole = normalizeChatRole(rawRole);
          const cleanAuthor = item.username.trim().replace(/^@/, "").toLowerCase();
          const isCreator = cleanAuthor === cleanChannelSlug || normRole === "Creator";
          const isDemoted = demotedUsernamesRef.current.has(cleanAuthor);
          const isMod =
            !isCreator &&
            !isDemoted &&
            (normRole === "Moderator" || moderatorUsernamesRef.current.has(cleanAuthor));
          if (isMod) {
            moderatorUsernamesRef.current.add(cleanAuthor);
          }
          const effectiveRole: "Creator" | "Moderator" | "User" = isCreator ? "Creator" : isMod ? "Moderator" : "User";

          setMessages((prev) => {
            if (prev.some((m) => m.id === item.id)) return prev;
            return [
              ...prev,
              {
                id: item.id,
                author: item.username,
                userId: item.userId,
                avatarUrl: item.avatarUrl,
                role: effectiveRole,
                colorClass: getRoleColorClass(effectiveRole),
                content: item.content,
                messageType: item.messageType ?? (item.gifUrl ? "gif" : "text"),
                gifUrl: item.gifUrl,
                isDeleted: item.isDeleted ?? false,
                timestamp,
              },
            ];
          });
        } else if (frameType === "chat.history" && Array.isArray(payload)) {
          const historyItems: ChatFeedItem[] = payload.map((m) => {
            const raw = m as {
              id: string;
              userId?: string;
              username: string;
              avatarUrl?: string | null;
              role?: "Creator" | "Moderator" | "User";
              content: string;
              messageType?: "text" | "gif";
              gifUrl?: string | null;
              isDeleted?: boolean;
              createdAt?: string;
            };
            const date = raw.createdAt ? new Date(raw.createdAt) : new Date();
            const timestamp = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
            const rawRole = raw.role ?? (raw.username.trim().replace(/^@/, "").toLowerCase() === cleanChannelSlug ? "Creator" : "User");
            const normRole = normalizeChatRole(rawRole);
            const cleanAuthor = raw.username.trim().replace(/^@/, "").toLowerCase();
            const isCreator = cleanAuthor === cleanChannelSlug || normRole === "Creator";
            const isDemoted = demotedUsernamesRef.current.has(cleanAuthor);
            const isMod =
              !isCreator &&
              !isDemoted &&
              (normRole === "Moderator" || moderatorUsernamesRef.current.has(cleanAuthor));
            if (isMod) {
              moderatorUsernamesRef.current.add(cleanAuthor);
            }
            const effectiveRole: "Creator" | "Moderator" | "User" = isCreator ? "Creator" : isMod ? "Moderator" : "User";
            return {
              id: raw.id,
              author: raw.username,
              userId: raw.userId,
              avatarUrl: raw.avatarUrl,
              role: effectiveRole,
              colorClass: getRoleColorClass(effectiveRole),
              content: raw.content,
              messageType: raw.messageType ?? (raw.gifUrl ? "gif" : "text"),
              gifUrl: raw.gifUrl,
              isDeleted: raw.isDeleted ?? false,
              timestamp,
            };
          });
          setMessages(historyItems);
        } else if (frameType === "chat.reset") {
          setMessages([]);
        } else if (frameType === "chat.freeze" && payload) {
          const freezeData = payload as {
            channelId: string;
            isFrozen: boolean;
            frozenBy?: string;
          };
          const next = Boolean(freezeData.isFrozen);
          setIsChatFrozen((prev) => {
            if (prev !== next) {
              if (next) {
                toast.info("Chat is paused by the creator.");
              } else {
                toast.info("Chat has resumed.");
              }
            }
            return next;
          });
        } else if (frameType === "chat.slowmode" && payload) {
          const slowData = payload as {
            channelId?: string;
            enabled: boolean;
            cooldownSeconds?: number;
            initial?: boolean;
          };
          const next = Boolean(slowData.enabled);
          setIsSlowMode((prev) => {
            if (prev !== next && !slowData.initial) {
              if (next) {
                toast.info("Slow mode enabled (3s cooldown)");
              } else {
                toast.info("Slow mode disabled");
              }
            }
            return next;
          });
        } else if (frameType === "chat.message_deleted" && payload) {
          const { messageId } = payload as { messageId: string; deletedBy: string };
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === messageId ? { ...msg, isDeleted: true } : msg,
            ),
          );
        } else if (frameType === "moderation.warning" && payload) {
          const warnData = payload as ModerationWarningData;
          setActiveWarning(warnData);
        } else if (frameType === "moderation.silenced" && payload) {
          const sil = payload as {
            userId?: string;
            username?: string;
            expiresAt: string | null;
            reason: string;
          };
          const currentUser = userRef.current;
          const token = userAccessToken || userRef.current?.accessToken || getStoredAccessToken();
          const tokenPayload = decodeJwtPayload(token);
          const currentId = currentUser?.id || tokenPayload?.sub;
          const currentUsername = (currentUser?.username || tokenPayload?.username)?.trim().replace(/^@/, "").toLowerCase();
          const targetId = sil.userId?.trim();
          const targetUsername = sil.username?.trim().replace(/^@/, "").toLowerCase();
          const isTarget =
            !targetId && !targetUsername
              ? true
              : Boolean(
                  (currentId && targetId && targetId === currentId) ||
                  (currentUsername && targetUsername && targetUsername === currentUsername) ||
                  (!currentId && !currentUsername),
                );
          if (isTarget) {
            const exp = sil.expiresAt ? new Date(sil.expiresAt) : new Date(Date.now() + 86400000 * 365);
            setSilencedUntil(exp);
            try {
              const clean = channelSlug.trim().replace(/^@/, "").toLowerCase();
              window.sessionStorage.setItem(`vs_silenced_${clean}`, exp.toISOString());
            } catch {
              // ignore
            }
            toast.error(`You have been silenced in #${channelSlug}: ${sil.reason || "Silenced by channel moderation"}`);
          }
        } else if (frameType === "moderation.unsilenced" && payload) {
          const unsil = payload as { userId?: string; username?: string };
          const currentUser = userRef.current;
          const token = userAccessToken || userRef.current?.accessToken || getStoredAccessToken();
          const tokenPayload = decodeJwtPayload(token);
          const currentId = currentUser?.id || tokenPayload?.sub;
          const currentUsername = (currentUser?.username || tokenPayload?.username)?.trim().replace(/^@/, "").toLowerCase();
          const targetId = unsil.userId?.trim();
          const targetUsername = unsil.username?.trim().replace(/^@/, "").toLowerCase();
          const isTarget =
            !targetId && !targetUsername
              ? true
              : Boolean(
                  (currentId && targetId && targetId === currentId) ||
                  (currentUsername && targetUsername && targetUsername === currentUsername) ||
                  (!currentId && !currentUsername),
                );
          if (isTarget) {
            setSilencedUntil(null);
            try {
              const clean = channelSlug.trim().replace(/^@/, "").toLowerCase();
              window.sessionStorage.removeItem(`vs_silenced_${clean}`);
            } catch {
              // ignore
            }
            toast.success("You have been unsilenced.");
          }
        } else if (frameType === "moderation.banned" && payload) {
          const banData = payload as {
            channelId?: string;
            userId?: string;
            username?: string;
            reason?: string;
          };
          const currentUser = userRef.current;
          const token = userAccessToken || userRef.current?.accessToken || getStoredAccessToken();
          const tokenPayload = decodeJwtPayload(token);
          const currentId = currentUser?.id || tokenPayload?.sub;
          const currentUsername = (currentUser?.username || tokenPayload?.username)?.trim().replace(/^@/, "").toLowerCase();
          const targetId = banData.userId?.trim();
          const targetUsername = banData.username?.trim().replace(/^@/, "").toLowerCase();
          const isTarget =
            !targetId && !targetUsername
              ? true
              : Boolean(
                  (currentId && targetId && targetId === currentId) ||
                  (currentUsername && targetUsername && targetUsername === currentUsername) ||
                  (!currentId && !currentUsername),
                );
          if (isTarget) {
            toast.error(`You have been banned from #${channelSlug}: ${banData.reason || "Banned by moderation"}`);
            markChannelBanned(channelSlug);
            setDraft("");
          }
        } else if (frameType === "moderation.unbanned" && payload) {
          const unbanData = payload as {
            channelId?: string;
            channelSlug?: string;
            userId?: string;
            username?: string;
          };
          const currentUser = userRef.current;
          const token = userAccessToken || userRef.current?.accessToken || getStoredAccessToken();
          const tokenPayload = decodeJwtPayload(token);
          const currentId = currentUser?.id || tokenPayload?.sub;
          const currentUsername = (currentUser?.username || tokenPayload?.username)?.trim().replace(/^@/, "").toLowerCase();
          const targetId = unbanData.userId?.trim();
          const targetUsername = unbanData.username?.trim().replace(/^@/, "").toLowerCase();
          const isTarget =
            !targetId && !targetUsername
              ? true
              : Boolean(
                  (currentId && targetId && targetId === currentId) ||
                  (currentUsername && targetUsername && targetUsername === currentUsername) ||
                  (!currentId && !currentUsername),
                );
          if (isTarget) {
            setSilencedUntil(null);
            try {
              const clean = channelSlug.trim().replace(/^@/, "").toLowerCase();
              window.sessionStorage.removeItem(`vs_silenced_${clean}`);
            } catch {
              // ignore
            }
            clearChannelBanned?.(channelSlug);
            toast.success("Your ban is vanished");
          }
        } else if (frameType === "moderation.role_updated" && payload) {
          const roleData = payload as {
            userId?: string;
            username: string;
            newRole: "Creator" | "Moderator" | "User";
          };
          const targetUsernameClean = roleData.username.trim().replace(/^@/, "").toLowerCase();
          const targetUserId = roleData.userId?.trim();

          const currentUser = userRef.current;
          const isCurrentUser =
            currentUser &&
            ((targetUserId && currentUser.id === targetUserId) ||
              targetUsernameClean === currentUser.username.trim().replace(/^@/, "").toLowerCase());
          if (isCurrentUser) {
            setCurrentUserRole((prev) => {
              if (prev !== roleData.newRole && prev !== "Creator") {
                toast.info(`Your role in #${channelSlug} is now ${roleData.newRole}.`);
              }
              return roleData.newRole;
            });
          }

          // Update active moderators and demoted sets
          if (roleData.newRole === "Moderator") {
            demotedUsernamesRef.current.delete(targetUsernameClean);
            setDemotedUsernames((prev) => {
              const next = new Set(prev);
              next.delete(targetUsernameClean);
              return next;
            });
            moderatorUsernamesRef.current.add(targetUsernameClean);
            setModeratorUsernames((prev) => new Set([...prev, targetUsernameClean]));
          } else {
            demotedUsernamesRef.current.add(targetUsernameClean);
            setDemotedUsernames((prev) => new Set([...prev, targetUsernameClean]));
            moderatorUsernamesRef.current.delete(targetUsernameClean);
            setModeratorUsernames((prev) => {
              const next = new Set(prev);
              next.delete(targetUsernameClean);
              return next;
            });
          }

          const nextColorClass = getRoleColorClass(roleData.newRole);

          // Dynamically update previous messages from that user
          setMessages((prev) =>
            prev.map((m) => {
              const mAuthorClean = m.author.trim().replace(/^@/, "").toLowerCase();
              const isMatch =
                mAuthorClean === targetUsernameClean ||
                Boolean(targetUserId && m.userId && m.userId === targetUserId);
              if (!isMatch) return m;
              return {
                ...m,
                role: roleData.newRole,
                colorClass: nextColorClass,
              };
            }),
          );
          setSelectedUser((prev) =>
            prev &&
            (prev.username.trim().replace(/^@/, "").toLowerCase() === targetUsernameClean ||
              Boolean(targetUserId && prev.userId && prev.userId === targetUserId))
              ? { ...prev, role: roleData.newRole }
              : prev,
          );
          void refreshModerators();
        } else if (frameType === "chat.error" && payload) {
          const errPayload = payload as {
            code: string;
            message: string;
            expiresAt?: string;
          };
          toast.error(errPayload.message);
          if (errPayload.code === "SILENCED") {
            const exp = errPayload.expiresAt
              ? new Date(errPayload.expiresAt)
              : new Date(Date.now() + 86400000 * 365);
            setSilencedUntil(exp);
            try {
              const clean = channelSlug.trim().replace(/^@/, "").toLowerCase();
              window.sessionStorage.setItem(`vs_silenced_${clean}`, exp.toISOString());
            } catch {
              // ignore
            }
          } else if (errPayload.code === "CHAT_FROZEN") {
            setIsChatFrozen(true);
          } else if (errPayload.code === "SLOW_MODE") {
            setSlowCooldown(3);
          }
        }
      } catch {
        // Ignore unparseable frames
      }
    },
    [channelSlug, cleanChannelSlug, clearChannelBanned, markChannelBanned, refreshModerators, userAccessToken],
  );

  // Helper to establish or re-establish WebSocket connection with exponential backoff
  const connectSocket = useCallback(() => {
    if (isUnmountedRef.current || chatClosed || !userAccessToken) {
      return;
    }

    if (isJwtExpired(userAccessToken)) {
      setNotice("Chat session expired. Please sign in again.");
      return;
    }

    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
      } catch {
        // Ignore
      }
      wsRef.current = null;
    }

    const baseWs = wsUrl || realtimeWsUrl;
    const socketUrl = buildChatSocketUrl(baseWs, channelSlug, userAccessToken);

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(socketUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isUnmountedRef.current) return;
        reconnectAttemptsRef.current = 0;
        setNotice(null);
      };

      ws.onmessage = handleFrame;

      ws.onerror = () => {
        if (isUnmountedRef.current) return;
        setNotice("Live chat server reconnecting...");
      };

      ws.onclose = (event: CloseEvent) => {
        wsRef.current = null;
        if (isUnmountedRef.current || chatClosed) {
          return;
        }

        // Normal/clean closure
        if (event.wasClean && event.code === 1000) {
          return;
        }

        // Authentication failure codes (e.g. 4001, 4401, 1008 policy violation)
        // or abnormal closure (1006) when the token is missing or expired
        const currentToken = userRef.current?.accessToken;
        if (
          event.code === 4001 ||
          event.code === 4401 ||
          event.code === 1008 ||
          !currentToken ||
          isJwtExpired(currentToken)
        ) {
          setNotice("Chat session expired. Please sign in again.");
          return;
        }

        // Exponential backoff reconnect
        const attempt = reconnectAttemptsRef.current + 1;
        reconnectAttemptsRef.current = attempt;
        const maxAttempts = 10;

        if (attempt <= maxAttempts) {
          setNotice("Live chat server reconnecting...");
          const delay = Math.min(1000 * Math.pow(1.5, attempt - 1), 10000);
          reconnectTimerRef.current = setTimeout(() => {
            if (!isUnmountedRef.current) {
              connectSocket();
            }
          }, delay);
        } else {
          setNotice("Unable to connect to live chat. Check connection or refresh.");
        }
      };
    } catch {
      // Fallback
    }
  }, [channelSlug, chatClosed, handleFrame, realtimeWsUrl, userAccessToken, wsUrl]);

  const handleManualRetry = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    setNotice("Connecting to live chat...");
    connectSocket();
  }, [connectSocket]);

  // Connect WebSocket to Fiber real-time chat
  useEffect(() => {
    isUnmountedRef.current = false;
    const cleanSlug = channelSlug.trim().replace(/^@/, "").toLowerCase();
    if (prevChannelSlugRef.current !== cleanSlug) {
      prevChannelSlugRef.current = cleanSlug;
      setMessages([]);
      setDraft("");
      setNotice(null);
      setShowGifPicker(false);
      setSelectedUser(null);
      setActiveWarning(null);
      setSilencedUntil(null);
      setIsChatFrozen(false);
      setIsSlowMode(Boolean(isChannelCreator && user?.slowMode));
      setSlowCooldown(0);
      reconnectAttemptsRef.current = 0;
      setModeratorUsernames(new Set());
      moderatorUsernamesRef.current = new Set();
      setDemotedUsernames(new Set());
      demotedUsernamesRef.current = new Set();
    }

    if (chatClosed) {
      return;
    }

    // Fetch public message history for guests, preview sessions, or expired sessions
    const fetchHistory = async () => {
      try {
        const { realtimeHttpUrl: httpBaseUrl } = getFrontendEnv();
        const httpBase = (httpBaseUrl || "http://localhost:3002").replace(/\/+$/, "");
        const res = await fetch(`${httpBase}/api/chat/${encodeURIComponent(cleanSlug)}/messages?limit=50`);
        if (res.ok) {
          const data = (await res.json()) as {
            messages?: Array<{
              id: string;
              userId?: string;
              username: string;
              avatarUrl?: string | null;
              role?: "Creator" | "Moderator" | "User";
              content: string;
              messageType?: "text" | "gif";
              gifUrl?: string | null;
              isDeleted?: boolean;
              createdAt?: string;
            }>;
          };
          if (Array.isArray(data.messages) && !isUnmountedRef.current) {
            const mapped: ChatFeedItem[] = data.messages.map((raw) => {
              const date = raw.createdAt ? new Date(raw.createdAt) : new Date();
              const timestamp = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
              const rawRole = raw.role ?? (raw.username.toLowerCase() === cleanSlug ? "Creator" : "User");
              const normRole = normalizeChatRole(rawRole);
              const cleanAuthor = raw.username.trim().replace(/^@/, "").toLowerCase();
              const isCreator = cleanAuthor === cleanSlug || normRole === "Creator";
              const isDemoted = demotedUsernamesRef.current.has(cleanAuthor);
              const isMod =
                !isCreator &&
                !isDemoted &&
                (normRole === "Moderator" || moderatorUsernamesRef.current.has(cleanAuthor));
              if (isMod) {
                moderatorUsernamesRef.current.add(cleanAuthor);
              }
              const effectiveRole: "Creator" | "Moderator" | "User" = isCreator ? "Creator" : isMod ? "Moderator" : "User";
              return {
                id: raw.id,
                author: raw.username,
                userId: raw.userId,
                avatarUrl: raw.avatarUrl,
                role: effectiveRole,
                colorClass: getRoleColorClass(effectiveRole),
                content: raw.content,
                messageType: raw.messageType ?? (raw.gifUrl ? "gif" : "text"),
                gifUrl: raw.gifUrl,
                isDeleted: raw.isDeleted ?? false,
                timestamp,
              };
            });
            setMessages((prev) => (prev.length === 0 ? mapped : prev));
          }
        }
      } catch {
        // Ignore REST history fetch error
      }
    };

    if (isGuest) {
      setNotice("Sign in to participate in live chat.");
      void fetchHistory();
      return;
    }

    if (userSessionKind === "preview") {
      setNotice("Local preview session. Sign in with a full account for live chat.");
      void fetchHistory();
      return;
    }

    if (!userAccessToken || isJwtExpired(userAccessToken)) {
      setNotice("Chat session expired. Please sign in again.");
      void fetchHistory();
      return;
    }

    connectSocket();

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.onopen = null;
          wsRef.current.onmessage = null;
          wsRef.current.onerror = null;
          wsRef.current.onclose = null;
          wsRef.current.close(1000, "Component unmounted");
        } catch {
          // Ignore
        }
        wsRef.current = null;
      }
    };
  }, [channelSlug, chatClosed, connectSocket, isChannelCreator, isGuest, user?.slowMode, userAccessToken, userSessionKind]);

  // Send text message
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isInputDisabled) {
      if (isChatFrozen && !isChannelCreator) {
        toast.warning("Chat is paused by the creator.");
      }
      return;
    }
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }

    if (!user) {
      setNotice("Sign in to send chat messages.");
      setDraft("");
      return;
    }

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "chat.message",
          payload: {
            content: trimmed,
            messageType: "text",
          },
        }),
      );
      if (isSlowMode && !isChannelCreator) {
        setSlowCooldown(3);
      }
    } else if (user.sessionKind === "preview") {
      // Local preview fallback
      const now = new Date();
      const timestamp = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const role = creatorMode || user.username.trim().replace(/^@/, "").toLowerCase() === cleanChannelSlug ? "Creator" : currentUserRole;
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}`,
          author: user.username,
          userId: user.id,
          role,
          colorClass: getRoleColorClass(role),
          content: trimmed,
          messageType: "text",
          isDeleted: false,
          timestamp,
        },
      ]);
      setNotice("Sent in local preview.");
      if (isSlowMode && !isChannelCreator) {
        setSlowCooldown(3);
      }
    } else {
      if (ws && ws.readyState === WebSocket.CONNECTING) {
        toast.info("Connecting to chat... please wait a moment.");
      } else {
        toast.error("Chat server is reconnecting. Please wait.");
        handleManualRetry();
      }
      return;
    }
    setDraft("");
  };

  // Send GIF message
  const handleSelectGif = (gifUrl: string) => {
    if (isInputDisabled || !user) {
      if (isChatFrozen && !isChannelCreator) {
        toast.warning("Chat is paused by the creator.");
      }
      return;
    }
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "chat.message",
          payload: {
            content: "GIF",
            messageType: "gif",
            gifUrl,
          },
        }),
      );
      if (isSlowMode && !isChannelCreator) {
        setSlowCooldown(3);
      }
    } else {
      const now = new Date();
      const timestamp = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const role = creatorMode || user.username.trim().replace(/^@/, "").toLowerCase() === cleanChannelSlug ? "Creator" : currentUserRole;
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}`,
          author: user.username,
          userId: user.id,
          role,
          colorClass: getRoleColorClass(role),
          content: "GIF",
          messageType: "gif",
          gifUrl,
          isDeleted: false,
          timestamp,
        },
      ]);
      if (isSlowMode && !isChannelCreator) {
        setSlowCooldown(3);
      }
    }
    setShowGifPicker(false);
  };

  // Delete message
  const handleDeleteMessage = (msgId: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "chat.delete_message",
          payload: { messageId: msgId },
        }),
      );
    } else {
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, isDeleted: true } : m)),
      );
      toast.info("Message deleted.");
    }
  };

  // Toggle chat freeze state (Creator only)
  const handleToggleFreeze = () => {
    const nextFrozen = !isChatFrozen;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "chat.freeze",
          payload: {
            channelId: cleanChannelSlug,
            isFrozen: nextFrozen,
          },
        }),
      );
    }
    setIsChatFrozen(nextFrozen);
    if (nextFrozen) {
      toast.info("Chat is paused by the creator.");
    } else {
      toast.info("Chat has resumed.");
    }
  };

  // Toggle chat slow mode state (Creator only)
  const handleToggleSlowMode = () => {
    const nextSlow = !isSlowMode;
    setIsSlowMode(nextSlow);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "chat.slowmode",
          payload: {
            channelId: cleanChannelSlug,
            enabled: nextSlow,
            cooldownSeconds: 3,
          },
        }),
      );
    }
    if (updateChannelSettings && user) {
      void updateChannelSettings({
        channelTitle: user.channelTitle,
        channelCategory: user.channelCategory,
        slowMode: nextSlow,
      });
    }
    if (nextSlow) {
      toast.info("Slow mode enabled (3s cooldown)");
    } else {
      toast.info("Slow mode disabled");
    }
  };

  // Dispatch WebSocket moderation action from modal
  const handleModerationAction = (
    action: string,
    payload: { duration?: string | undefined; reason?: string | undefined },
  ) => {
    if (selectedUser) {
      const targetUserClean = selectedUser.username.trim().replace(/^@/, "").toLowerCase();
      const targetUserId = selectedUser.userId?.trim();

      if (action === "remove_mod") {
        demotedUsernamesRef.current.add(targetUserClean);
        setDemotedUsernames((prev) => new Set([...prev, targetUserClean]));
        setModeratorUsernames((prev) => {
          const next = new Set(prev);
          next.delete(targetUserClean);
          moderatorUsernamesRef.current = next;
          return next;
        });
        setMessages((prev) =>
          prev.map((m) => {
            const mClean = m.author.trim().replace(/^@/, "").toLowerCase();
            if (
              mClean === targetUserClean ||
              Boolean(targetUserId && m.userId && m.userId === targetUserId)
            ) {
              return {
                ...m,
                role: "User",
                colorClass: getRoleColorClass("User"),
              };
            }
            return m;
          }),
        );
        setSelectedUser((prev) =>
          prev &&
          (prev.username.trim().replace(/^@/, "").toLowerCase() === targetUserClean ||
            Boolean(targetUserId && prev.userId && prev.userId === targetUserId))
            ? { ...prev, role: "User" }
            : prev,
        );
        void refreshModerators();
      } else if (action === "add_mod") {
        demotedUsernamesRef.current.delete(targetUserClean);
        setDemotedUsernames((prev) => {
          const next = new Set(prev);
          next.delete(targetUserClean);
          return next;
        });
        setModeratorUsernames((prev) => {
          const next = new Set(prev);
          next.add(targetUserClean);
          moderatorUsernamesRef.current = next;
          return next;
        });
        setMessages((prev) =>
          prev.map((m) => {
            const mClean = m.author.trim().replace(/^@/, "").toLowerCase();
            if (
              mClean === targetUserClean ||
              Boolean(targetUserId && m.userId && m.userId === targetUserId)
            ) {
              return {
                ...m,
                role: "Moderator",
                colorClass: getRoleColorClass("Moderator"),
              };
            }
            return m;
          }),
        );
        setSelectedUser((prev) =>
          prev &&
          (prev.username.trim().replace(/^@/, "").toLowerCase() === targetUserClean ||
            Boolean(targetUserId && prev.userId && prev.userId === targetUserId))
            ? { ...prev, role: "Moderator" }
            : prev,
        );
        void refreshModerators();
      }
    }

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && selectedUser) {
      ws.send(
        JSON.stringify({
          type: "moderation.action",
          payload: {
            action,
            targetUserId: selectedUser.userId,
            targetUsername: selectedUser.username,
            duration: payload.duration,
            reason: payload.reason,
          },
        }),
      );
    }
  };

  const isChannelMod =
    currentUserRole === "Moderator" || user?.role?.toUpperCase() === "MODERATOR";

  return (
    <aside
      aria-label="Live stream chat"
      className="relative flex h-full min-h-[540px] flex-col justify-between rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--vs-border)] px-4 py-3">
        <h2 className="inline-flex items-center gap-1.5 font-display text-sm font-bold text-[var(--vs-text)]">
          <MessageSquareIcon className="h-4 w-4 shrink-0 text-[var(--vs-accent)]" />
          <span>{creatorMode ? "Studio chat & moderation" : "Stream chat"}</span>
        </h2>
        <div className="flex items-center gap-2">
          {isChannelCreator && (
            <>
              <button
                type="button"
                onClick={handleToggleSlowMode}
                aria-label={isSlowMode ? "Disable Slow Mode" : "Enable Slow Mode"}
                title={isSlowMode ? "Slow Mode (3s) Active - Click to Disable" : "Enable Slow Mode (3s)"}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${
                  isSlowMode
                    ? "border-[var(--vs-accent)] bg-[var(--vs-accent)]/10 text-[var(--vs-accent)] hover:bg-[var(--vs-accent)]/20"
                    : "border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] text-[var(--vs-text)] hover:border-[var(--vs-accent)] hover:text-[var(--vs-accent)]"
                }`}
              >
                <TimerIcon className="h-3.5 w-3.5 shrink-0" />
                <span>{isSlowMode ? "Slow 3s" : "Slow Mode"}</span>
              </button>
              <button
                type="button"
                onClick={handleToggleFreeze}
                aria-label={isChatFrozen ? "Resume Chat" : "Pause Chat"}
                title={isChatFrozen ? "Resume Chat" : "Pause Chat"}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${
                  isChatFrozen
                    ? "border-[var(--vs-live)] bg-[var(--vs-live)]/10 text-[var(--vs-live)] hover:bg-[var(--vs-live)]/20"
                    : "border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] text-[var(--vs-text)] hover:border-[var(--vs-accent)] hover:text-[var(--vs-accent)]"
                }`}
              >
                {isChatFrozen ? (
                  <>
                    <PlayIcon className="h-3.5 w-3.5 shrink-0" />
                    <span>Resume Chat</span>
                  </>
                ) : (
                  <>
                    <PauseIcon className="h-3.5 w-3.5 shrink-0" />
                    <span>Pause Chat</span>
                  </>
                )}
              </button>
            </>
          )}
          {!isChannelCreator && isSlowMode && (
            <span
              data-testid="slow-mode-indicator"
              className="inline-flex items-center gap-1 rounded-md border border-[var(--vs-accent)]/30 bg-[var(--vs-accent)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--vs-accent)]"
            >
              <TimerIcon className="h-3 w-3 shrink-0" />
              <span>Slow mode (3s)</span>
            </span>
          )}
          {chatClosed && (
            <span className="inline-flex items-center gap-1 rounded-md border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--vs-text-muted)]">
              <LockIcon className="h-3 w-3" />
              <span>Closed</span>
            </span>
          )}
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
        {chatClosed ? (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] text-[var(--vs-text-muted)]">
              <LockIcon className="h-4 w-4" />
            </span>
            <p className="text-sm font-medium text-[var(--vs-text)]">Chat is closed</p>
            <p className="max-w-[220px] text-xs text-[var(--vs-text-muted)]">
              This channel is currently offline. Chat opens when the stream goes live.
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full min-h-[240px] items-center justify-center text-center">
            <p className="text-xs text-[var(--vs-text-muted)]">
              No messages yet. Say hello in chat!
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const cleanAuthor = msg.author.trim().replace(/^@/, "").toLowerCase();
            const isCreator = cleanAuthor === cleanChannelSlug || normalizeChatRole(msg.role) === "Creator";
            const isDemoted = demotedUsernames.has(cleanAuthor);
            const isMod =
              !isCreator &&
              !isDemoted &&
              (moderatorUsernames.has(cleanAuthor) || normalizeChatRole(msg.role) === "Moderator");
            const computedRole: "Creator" | "Moderator" | "User" = isCreator
              ? "Creator"
              : isMod
                ? "Moderator"
                : "User";
            const normalizedRole = normalizeChatRole(computedRole);
            const roleColorClass = getRoleColorClass(normalizedRole);
            const canDelete =
              !msg.isDeleted &&
              user &&
              (msg.author.toLowerCase() === user.username.toLowerCase() ||
                isChannelCreator ||
                (isChannelMod && normalizedRole === "User"));

            return (
              <div
                key={msg.id}
                className="group flex items-start justify-between gap-2 rounded-md px-1.5 py-1 text-[13px] leading-snug hover:bg-[var(--vs-surface-subtle)]"
              >
                <div className="min-w-0 flex-1">
                  <span className="mr-1.5 font-mono text-[11px] text-[var(--vs-text-muted)]">
                    {msg.timestamp}
                  </span>

                  {/* Role Badge */}
                  <span
                    className={`mr-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      normalizedRole === "Creator"
                        ? "bg-[var(--vs-accent)]/15 text-[var(--vs-accent)] border border-[var(--vs-accent)]/30"
                        : normalizedRole === "Moderator"
                          ? "bg-[var(--vs-ok)]/15 text-[var(--vs-ok)] border border-[var(--vs-ok)]/30"
                          : "bg-[var(--vs-surface-subtle)] text-[var(--vs-text-muted)] border border-[var(--vs-border)]/50"
                    }`}
                  >
                    <RoleBadgeIcon role={normalizedRole} className="h-3 w-3 shrink-0" />
                    <span>{normalizedRole}</span>
                  </span>

                  {/* Clickable Username */}
                  <button
                    type="button"
                    data-chat-role={normalizedRole}
                    onClick={() =>
                      setSelectedUser({
                        userId: msg.userId,
                        username: msg.author,
                        avatarUrl: msg.avatarUrl,
                        role: normalizedRole,
                      })
                    }
                    className={`font-semibold hover:underline ${roleColorClass}`}
                  >
                    @{msg.author}
                  </button>
                  <span className="text-[var(--vs-text-muted)]">: </span>

                  {/* Message Content or Tombstone */}
                  {msg.isDeleted ? (
                    <span className="italic text-[var(--vs-text-muted)]">
                      This message has been deleted.
                    </span>
                  ) : msg.messageType === "gif" && msg.gifUrl ? (
                    <div className="mt-1 max-w-[240px]">
                      <img
                        src={msg.gifUrl}
                        alt="GIF"
                        loading="lazy"
                        className="max-h-44 w-auto rounded-lg border border-[var(--vs-border)] object-contain shadow-sm"
                      />
                    </div>
                  ) : (
                    <span className="break-words text-[var(--vs-text)]">{msg.content}</span>
                  )}
                </div>

                {/* Delete button (accessible on hover) */}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => handleDeleteMessage(msg.id)}
                    aria-label="Delete message"
                    title="Delete message"
                    className="inline-flex shrink-0 items-center rounded p-1 text-[var(--vs-text-muted)] opacity-0 transition-opacity hover:bg-[var(--vs-surface)] hover:text-[var(--vs-live)] group-hover:opacity-100 focus:opacity-100"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer Area */}
      <form onSubmit={handleSubmit} className="relative space-y-2 border-t border-[var(--vs-border)] p-3">
        {/* GIF Picker Popover */}
        {showGifPicker && (
          <GifPicker
            onSelectGif={handleSelectGif}
            onClose={() => setShowGifPicker(false)}
          />
        )}

        {/* Chat Paused Banner */}
        {isChatFrozen && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-[var(--vs-live)]/30 bg-[var(--vs-live)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--vs-live)]"
          >
            <PauseIcon className="h-4 w-4 shrink-0" />
            <span>Chat is paused by the creator.</span>
          </div>
        )}

        {/* Silence Timeout Banner */}
        {isSilenced && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-[var(--vs-live)]/30 bg-[var(--vs-live)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--vs-live)]"
          >
            <VolumeXIcon className="h-4 w-4 shrink-0" />
            <span>Silenced: {countdownLabel || "Timed out"}</span>
          </div>
        )}

        {/* Slow Mode Indicator / Cooldown Banner */}
        {isSlowMode && !isChannelCreator && (
          <div
            role="status"
            className="flex items-center gap-1.5 rounded-lg border border-[var(--vs-accent)]/30 bg-[var(--vs-accent)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--vs-accent)]"
          >
            <TimerIcon className="h-4 w-4 shrink-0" />
            <span>
              {isCooldownActive
                ? `Slow mode: Cooldown active (${slowCooldown}s)`
                : "Slow mode is enabled (3s between messages)"}
            </span>
          </div>
        )}

        {notice && !chatClosed && !isSilenced && (
          <div
            role="status"
            className="flex items-center justify-between gap-2 text-xs text-[var(--vs-text-muted)]"
          >
            <span>{notice}</span>
            {user?.sessionKind === "backend" &&
              !isJwtExpired(user?.accessToken) &&
              (notice.includes("reconnect") ||
                notice.includes("Unable to connect") ||
                notice.includes("Connecting")) && (
                <button
                  type="button"
                  onClick={handleManualRetry}
                  className="shrink-0 font-medium text-[var(--vs-accent)] hover:underline focus:outline-none"
                >
                  Retry
                </button>
              )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <label htmlFor={`chat-draft-${channelSlug}`} className="sr-only">
            Chat message
          </label>
          <input
            id={`chat-draft-${channelSlug}`}
            type="text"
            value={isInputDisabled ? "" : draft}
            disabled={isInputDisabled}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              chatClosed
                ? "Chat is closed while user is offline"
                : activeWarning
                  ? "Chat is frozen: Acknowledge warning above"
                  : isSilenced
                    ? `Silenced (${countdownLabel})`
                    : isChatFrozen && !isChannelCreator
                      ? "Chat is paused by the creator."
                      : isCooldownActive
                        ? `Slow mode: wait ${slowCooldown}s...`
                        : user
                          ? `Message as @${user.username}...`
                          : "Sign in to send chat messages"
            }
            className="min-w-0 flex-1 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-canvas)] px-3 py-2 text-sm text-[var(--vs-text)] placeholder:text-[var(--vs-text-muted)] focus:border-[var(--vs-accent)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />

          {/* GIF Picker Toggle Button */}
          <button
            type="button"
            disabled={isInputDisabled}
            onClick={() => setShowGifPicker((prev) => !prev)}
            aria-label="Open GIF picker"
            title="Send a GIF"
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${showGifPicker
                ? "border-[var(--vs-accent)] bg-[var(--vs-accent)] text-white"
                : "border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] text-[var(--vs-text)] hover:border-[var(--vs-accent)]"
              }`}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            <span>GIF</span>
          </button>

          {/* Send Button */}
          <button
            type="submit"
            disabled={isInputDisabled}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--vs-accent)] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[var(--vs-accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[var(--vs-accent)]"
          >
            <SendIcon className="h-3.5 w-3.5" />
            <span>{isCooldownActive ? `${slowCooldown}s` : "Send"}</span>
          </button>
        </div>
      </form>

      {/* User Action Modal */}
      {selectedUser && (
        <UserActionModal
          target={selectedUser}
          channelSlug={channelSlug}
          creatorMode={creatorMode}
          currentUserRole={currentUserRole}
          onClose={() => setSelectedUser(null)}
          onViewProfile={onViewProfile}
          onModerationAction={handleModerationAction}
        />
      )}

      {/* Real-Time Moderation Warning Modal */}
      {activeWarning && (
        <ModerationWarningModal
          warning={activeWarning}
          onAcknowledge={() => setActiveWarning(null)}
        />
      )}
    </aside>
  );
}
