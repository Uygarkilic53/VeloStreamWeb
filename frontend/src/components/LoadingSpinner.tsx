import type { HTMLAttributes } from "react";

export interface LoadingSpinnerProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  className?: string;
  lineClassName?: string;
  fullWidth?: boolean;
}

export function LoadingSpinner({
  label,
  className = "",
  lineClassName = "",
  fullWidth = false,
  ...rest
}: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label ?? "Loading"}
      className={`flex w-full flex-col items-center justify-center gap-3 py-6 ${className}`}
      {...rest}
    >
      <div
        data-testid="loading-flat-line-track"
        className={`relative h-1 w-full overflow-hidden rounded-full bg-[var(--vs-surface-subtle)] border border-[var(--vs-border)]/40 ${
          fullWidth ? "" : "max-w-md"
        } ${lineClassName}`}
      >
        <div data-testid="loading-flat-line-runner" className="animate-flat-line" />
      </div>
      {label ? (
        <p className="text-xs font-medium text-[var(--vs-text-muted)]">
          {label}
        </p>
      ) : (
        <span className="sr-only">Loading...</span>
      )}
    </div>
  );
}
