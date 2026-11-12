import { useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import {
  BanIcon,
  MessageSquareIcon,
  SendIcon,
} from "./Icons";
import { useAuth } from "../lib/auth";
import { INITIAL_CHAT_MESSAGES, type ChatFeedItem } from "../lib/streams";

interface ChatRailProps {
  channelSlug: string;
  wsUrl: string;
  creatorMode?: boolean;
}

export function ChatRail({
  channelSlug,
  wsUrl,
  creatorMode = false,
}: ChatRailProps) {
  const { user, banUser } = useAuth();
  const [messages, setMessages] = useState<ChatFeedItem[]>(() => [...INITIAL_CHAT_MESSAGES]);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }

    if (!user) {
      setNotice("Sign in and connect to the real-time engine before sending messages.");
      setDraft("");
      return;
    }

    const now = new Date();
    const timestamp = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    setMessages((prev) => [
      ...prev,
      {
        id: `msg_${Date.now()}`,
        author: user.username,
        ...(creatorMode || user.username === channelSlug ? { role: "Creator" as const } : {}),
        colorClass: "text-[var(--vs-accent)]",
        content: trimmed,
        timestamp,
      },
    ]);
    setNotice(
      user.sessionKind === "backend"
        ? `Sent to #${channelSlug} room`
        : "Sent in local room preview (connect Go fiber service for multi-user broadcast).",
    );
    setDraft("");
  };

  return (
    <aside
      aria-label="Live stream chat"
      className="flex h-full min-h-[540px] flex-col justify-between rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)]"
    >
      <div className="border-b border-[var(--vs-border)] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-1.5 font-display text-sm font-bold text-[var(--vs-text)]">
            <MessageSquareIcon className="h-4 w-4 shrink-0 text-[var(--vs-accent)]" />
            <span>{creatorMode ? "Studio chat & moderation" : "Stream chat"}</span>
          </h2>
        </div>
        <div className="mt-1 truncate font-mono text-[11px] text-[var(--vs-text-muted)]">
          {wsUrl}/ws/chat/{channelSlug}
        </div>
      </div>

      <div className="border-b border-[var(--vs-border)] bg-[var(--vs-surface-subtle)]/60 px-4 py-2 text-xs text-[var(--vs-text-muted)]">
        Keep chat constructive. Plain room chat — zero donations or hype overlays.
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className="group flex items-start justify-between gap-2 rounded-md px-1.5 py-1 text-[13px] leading-snug hover:bg-[var(--vs-surface-subtle)]"
          >
            <div className="min-w-0">
              <span className="mr-1.5 font-mono text-[11px] text-[var(--vs-text-muted)]">
                {msg.timestamp}
              </span>
              {msg.role && (
                <span
                  className={`mr-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    msg.role === "Creator"
                      ? "bg-[var(--vs-accent)] text-white"
                      : "bg-[var(--vs-ok)]/15 text-[var(--vs-ok)]"
                  }`}
                >
                  {msg.role}
                </span>
              )}
              <span className={`font-semibold ${msg.colorClass}`}>@{msg.author}</span>
              <span className="text-[var(--vs-text-muted)]">: </span>
              <span className="break-words text-[var(--vs-text)]">{msg.content}</span>
            </div>

            {creatorMode && msg.author !== user?.username && (
              <button
                type="button"
                onClick={() => {
                  void banUser(msg.author, "Banned from studio chat").then((result) => {
                    if (!result.ok) {
                      toast.error(result.error ?? `Unable to ban @${msg.author}.`);
                      return;
                    }
                    setMessages((prev) => prev.filter((item) => item.author !== msg.author));
                    const text = result.message ?? `Banned @${msg.author} from room.`;
                    setNotice(text);
                    toast.success(text);
                  });
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded border border-[var(--vs-border)] bg-[var(--vs-surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--vs-live)] opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              >
                <BanIcon className="h-2.5 w-2.5" />
                <span>Ban</span>
              </button>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-2 border-t border-[var(--vs-border)] p-3">
        {notice && (
          <p role="status" className="text-xs text-[var(--vs-text-muted)]">
            {notice}
          </p>
        )}
        <div className="flex gap-2">
          <label htmlFor={`chat-draft-${channelSlug}`} className="sr-only">
            Chat message
          </label>
          <input
            id={`chat-draft-${channelSlug}`}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={user ? `Message as @${user.username}...` : "Write a message"}
            className="min-w-0 flex-1 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-canvas)] px-3 py-2 text-sm text-[var(--vs-text)] placeholder:text-[var(--vs-text-muted)] focus:border-[var(--vs-accent)] focus:outline-none"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--vs-accent)] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[var(--vs-accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)]"
          >
            <SendIcon className="h-3.5 w-3.5" />
            <span>Send</span>
          </button>
        </div>
      </form>
    </aside>
  );
}
