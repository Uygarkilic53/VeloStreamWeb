export function decodeJwtPayload(
  token: string | null | undefined,
): { sub?: string; username?: string; role?: string; exp?: number } | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    const payloadPart = parts[1];
    if (parts.length !== 3 || !payloadPart) return null;
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = atob(base64);
    return JSON.parse(jsonStr) as {
      sub?: string;
      username?: string;
      role?: string;
      exp?: number;
    };
  } catch {
    return null;
  }
}

export function isJwtExpired(token: string | null | undefined): boolean {
  if (!token) return true;
  try {
    const parts = token.split(".");
    const payloadPart = parts[1];
    if (parts.length !== 3 || !payloadPart) return false;
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = atob(base64);
    const payload = JSON.parse(jsonStr) as { exp?: number };
    if (typeof payload.exp === "number") {
      return payload.exp * 1000 <= Date.now();
    }
    return false;
  } catch {
    return false;
  }
}

export function buildChatSocketUrl(baseUrl: string | undefined, slug: string, token: string): string {
  let wsBase = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!wsBase) {
    const isHttps = typeof window !== "undefined" && window.location?.protocol === "https:";
    const host = typeof window !== "undefined" && window.location?.host ? window.location.host : "localhost:3002";
    wsBase = `${isHttps ? "wss://" : "ws://"}${host}`;
  } else if (wsBase.startsWith("http://")) {
    wsBase = "ws://" + wsBase.slice(7);
  } else if (wsBase.startsWith("https://")) {
    wsBase = "wss://" + wsBase.slice(8);
  } else if (!wsBase.startsWith("ws://") && !wsBase.startsWith("wss://")) {
    const isHttps = typeof window !== "undefined" && window.location?.protocol === "https:";
    wsBase = `${isHttps ? "wss://" : "ws://"}${wsBase.replace(/^\/+/, "")}`;
  }
  const cleanSlug = encodeURIComponent(slug.trim().replace(/^@/, "").toLowerCase());
  const cleanToken = encodeURIComponent(token.trim());
  return `${wsBase}/ws/chat/${cleanSlug}?token=${cleanToken}`;
}

export type ChatRole =
  | "Creator"
  | "Host"
  | "Owner"
  | "Streamer"
  | "Moderator"
  | "Mod"
  | "Admin"
  | "User"
  | "Audience"
  | string;

export function normalizeChatRole(
  role?: ChatRole | null,
): "Creator" | "Moderator" | "User" {
  const norm = (role || "").trim().toLowerCase();
  if (
    norm === "creator" ||
    norm === "host" ||
    norm === "owner" ||
    norm === "streamer"
  ) {
    return "Creator";
  }
  if (
    norm === "moderator" ||
    norm === "mod" ||
    norm === "admin" ||
    norm === "compliance" ||
    norm === "guard"
  ) {
    return "Moderator";
  }
  return "User";
}

export function getRoleColorClass(role?: ChatRole | null): string {
  const norm = normalizeChatRole(role);
  if (norm === "Creator") return "chat-creator-lightning";
  if (norm === "Moderator") return "chat-moderator-lightning";
  return "text-[var(--vs-text)]";
}


