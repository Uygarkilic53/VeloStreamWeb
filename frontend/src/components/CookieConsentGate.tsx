import { COOKIE_DISCLOSURES } from "../lib/cookies";
import { useTheme } from "../lib/theme";
import { ShieldIcon } from "./Icons";
import { VeloStreamLogo } from "./VeloStreamLogo";

export function CookieConsentGate() {
  const {
    cookiesAccepted,
    isCookieDialogOpen,
    acceptCookies,
    closeCookieSettings,
    revokeCookies,
  } = useTheme();

  if (!isCookieDialogOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cookie-gate-title"
      aria-describedby="cookie-gate-description"
    >
      <div className="w-full max-w-xl rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--vs-border)] pb-4">
          <VeloStreamLogo size={26} badge="Cookie Notice" />
        </div>

        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <h2
              id="cookie-gate-title"
              className="font-display text-xl font-bold tracking-tight text-[var(--vs-text)]"
            >
              {cookiesAccepted ? "Your VeloStream cookie settings" : "Accept cookies to enter VeloStream"}
            </h2>
            <p
              id="cookie-gate-description"
              className="text-sm leading-relaxed text-[var(--vs-text-muted)]"
            >
              Before you enter the live directory, review the minimal first-party cookies we store.
              We use essential cookies to remember your consent decision across visits and to keep
              you signed in on this device when you select &apos;Remember me&apos;.
            </p>
          </div>

          <div className="space-y-2.5">
            {COOKIE_DISCLOSURES.map((cookie) => (
              <div
                key={cookie.name}
                className="rounded-lg border border-[var(--vs-border)] bg-[var(--vs-canvas)] p-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <code className="font-mono text-xs font-semibold text-[var(--vs-text)]">
                    {cookie.name}
                  </code>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border border-[var(--vs-border)] bg-[var(--vs-surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--vs-text-muted)]">
                      {cookie.category}
                    </span>
                    <span className="text-[11px] text-[var(--vs-text-muted)]">
                      {cookie.retention}
                    </span>
                  </div>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--vs-text-muted)]">
                  {cookie.purpose}
                </p>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] p-3 text-xs text-[var(--vs-text-muted)]">
            <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--vs-ok)]" />
            <span>
              Zero ad trackers, zero third-party analytics, and zero donation or monetization
              tracking cookies. Essential session cookies are only created when you select
              &apos;Remember me&apos; to keep you signed in across visits and server restarts, and
              theme preferences are saved to your account.
            </span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5 border-t border-[var(--vs-border)] pt-4">
          {cookiesAccepted && (
            <>
              <button
                type="button"
                onClick={revokeCookies}
                className="rounded-lg border border-[var(--vs-border)] bg-[var(--vs-canvas)] px-3.5 py-2 text-xs font-medium text-[var(--vs-live)] hover:bg-[var(--vs-surface-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)]"
              >
                Clear cookies & reset
              </button>
              <button
                type="button"
                onClick={closeCookieSettings}
                className="rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] px-4 py-2 text-sm font-medium text-[var(--vs-text)] hover:bg-[var(--vs-surface-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)]"
              >
                Keep current settings
              </button>
            </>
          )}
          <button
            type="button"
            onClick={acceptCookies}
            className="rounded-lg bg-[var(--vs-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--vs-accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)]"
          >
            {cookiesAccepted ? "Save cookie preferences" : "Accept cookies & enter VeloStream"}
          </button>
        </div>
      </div>
    </div>
  );
}

