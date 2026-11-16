import { useEffect, useRef } from "react";
import { AlertTriangleIcon, CheckIcon } from "./Icons";

export interface ModerationWarningData {
  channelId: string;
  channelSlug: string;
  moderatorUsername: string;
  reason: string;
  warnedAt: string;
}

interface ModerationWarningModalProps {
  warning: ModerationWarningData;
  onAcknowledge: () => void;
}

export function ModerationWarningModal({
  warning,
  onAcknowledge,
}: ModerationWarningModalProps) {
  const acknowledgeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus the acknowledge button on mount
  useEffect(() => {
    acknowledgeButtonRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="warning-modal-title"
      aria-describedby="warning-modal-description"
      data-testid="moderation-warning-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md rounded-2xl border-2 border-[var(--vs-live)]/40 bg-[var(--vs-surface)] p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--vs-live)]/15 text-[var(--vs-live)]">
            <AlertTriangleIcon className="h-6 w-6" />
          </div>
          <div>
            <h2 id="warning-modal-title" className="text-base font-bold text-[var(--vs-text)]">
              Channel Moderation Warning
            </h2>
            <p className="text-xs text-[var(--vs-text-muted)]">
              Action required to resume chat interaction
            </p>
          </div>
        </div>

        <p id="warning-modal-description" className="mt-4 text-xs leading-relaxed text-[var(--vs-text)]">
          You received an official moderation warning from{" "}
          <span className="font-semibold text-[var(--vs-accent)]">
            @{warning.moderatorUsername || "moderator"}
          </span>{" "}
          in{" "}
          <span className="font-mono font-semibold text-[var(--vs-text)]">
            #{warning.channelSlug || warning.channelId}
          </span>
          :
        </p>

        {/* Reason quotation box */}
        <div className="mt-3 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] p-3.5">
          <p className="text-xs italic text-[var(--vs-text)]">
            &ldquo;{warning.reason}&rdquo;
          </p>
          {warning.warnedAt && (
            <p className="mt-2 text-[10px] text-[var(--vs-text-muted)]">
              Issued at {new Date(warning.warnedAt).toLocaleTimeString()}
            </p>
          )}
        </div>

        <p className="mt-4 text-[11px] text-[var(--vs-text-muted)]">
          Repeated violations may result in silence timeouts or permanent removal from this broadcast.
        </p>

        <div className="mt-6 flex justify-end">
          <button
            ref={acknowledgeButtonRef}
            type="button"
            onClick={onAcknowledge}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--vs-accent)] px-4 py-2.5 text-xs font-semibold text-white shadow-lg transition-all hover:bg-[var(--vs-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vs-accent)]"
          >
            <CheckIcon className="h-4 w-4" />
            <span>I Understand &amp; Acknowledge</span>
          </button>
        </div>
      </div>
    </div>
  );
}
