import { useEffect, useRef } from "react";
import { AlertTriangleIcon, BroadcastIcon, CloseIcon } from "./Icons";

export interface LeaveStudioModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  targetPageName?: string;
  isEnding?: boolean;
}

export function LeaveStudioModal({
  isOpen,
  onCancel,
  onConfirm,
  targetPageName,
  isEnding = false,
}: LeaveStudioModalProps) {
  const modalBoxRef = useRef<HTMLDivElement>(null);
  const stayButtonRef = useRef<HTMLButtonElement>(null);

  // Default focus to the safe 'Stay in studio' action so accidental Enter key does not kill stream
  useEffect(() => {
    if (isOpen) {
      stayButtonRef.current?.focus();
    }
  }, [isOpen]);

  // Handle Escape key to dismiss modal and Tab key to trap focus within dialog
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isEnding) {
        e.preventDefault();
        onCancel();
        return;
      }

      if (e.key === "Tab") {
        const container = modalBoxRef.current;
        if (!container) return;

        const focusable = container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel, isEnding]);

  if (!isOpen) return null;

  const isSignOutTarget = targetPageName?.toLowerCase() === "sign out";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-studio-modal-title"
      aria-describedby="leave-studio-modal-description"
      data-testid="leave-studio-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isEnding) {
          onCancel();
        }
      }}
    >
      <div
        ref={modalBoxRef}
        className="w-full max-w-md rounded-2xl border-2 border-[var(--vs-live)]/40 bg-[var(--vs-surface)] p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--vs-live)]/15 text-[var(--vs-live)]">
              <BroadcastIcon className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <h2
                id="leave-studio-modal-title"
                className="font-display text-base font-bold text-[var(--vs-text)]"
              >
                Leave studio and end broadcast?
              </h2>
              <p className="text-xs text-[var(--vs-text-muted)]">
                You are currently broadcasting live
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isEnding}
            aria-label="Close modal"
            className="rounded-lg p-1 text-[var(--vs-text-muted)] hover:bg-[var(--vs-surface-subtle)] hover:text-[var(--vs-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)] disabled:opacity-50"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--vs-live)]/20 bg-[var(--vs-live)]/5 p-3.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--vs-live)]" />
            <p
              id="leave-studio-modal-description"
              className="text-xs leading-relaxed text-[var(--vs-text)]"
            >
              If you proceed to leave studio, your live streaming will be ended
              {isSignOutTarget
                ? " and you will be signed out."
                : targetPageName
                  ? ` and you will be redirected to ${targetPageName}.`
                  : " immediately."}
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-[var(--vs-text-muted)]">
          Leaving this page will disconnect active viewers and terminate your WebRTC media session.
        </p>

        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            ref={stayButtonRef}
            type="button"
            onClick={onCancel}
            disabled={isEnding}
            data-testid="stay-in-studio-btn"
            className="inline-flex items-center justify-center rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] px-4 py-2.5 text-xs font-semibold text-[var(--vs-text)] transition-colors hover:bg-[var(--vs-surface-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)] disabled:opacity-50"
          >
            Stay in studio
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isEnding}
            data-testid="confirm-leave-studio-btn"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--vs-live)] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[var(--vs-live)]/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-live)] disabled:opacity-50"
          >
            <span>{isEnding ? "Ending broadcast..." : "End stream & leave"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
