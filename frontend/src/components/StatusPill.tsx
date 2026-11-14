interface StatusPillProps {
  label: string;
  tone: "live" | "ok" | "offline" | "danger";
}

export function StatusPill({ label, tone }: StatusPillProps) {
  const dotColor =
    tone === "live" || tone === "danger"
      ? "bg-[var(--vs-live)]"
      : tone === "ok"
        ? "bg-[var(--vs-ok)]"
        : "bg-[var(--vs-text-muted)]/60";

  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--vs-text)]">
      <span className={`h-2 w-2 rounded-full ${dotColor}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
