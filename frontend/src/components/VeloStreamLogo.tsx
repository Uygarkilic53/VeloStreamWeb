interface VeloStreamLogoProps {
  size?: number;
  showWordmark?: boolean;
  wordmarkClassName?: string;
  badge?: string;
}

export function VeloStreamLogo({
  size = 28,
  showWordmark = true,
  wordmarkClassName = "",
  badge,
}: VeloStreamLogoProps) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] p-1"
        style={{ width: size + 8, height: size + 8 }}
        aria-hidden="true"
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M22 26L50 74L78 26H60L50 45L40 26H22Z"
            fill="var(--vs-accent)"
          />
          <polygon points="46,49 46,61 56,55" fill="var(--vs-surface)" />
          <circle cx="81" cy="21" r="8" fill="var(--vs-live)" />
        </svg>
      </span>
      {showWordmark && (
        <span
          className={`font-display text-base font-bold tracking-tight text-[var(--vs-text)] ${wordmarkClassName}`}
        >
          VeloStream
        </span>
      )}
      {badge && (
        <span className="rounded border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--vs-text-muted)]">
          {badge}
        </span>
      )}
    </span>
  );
}

