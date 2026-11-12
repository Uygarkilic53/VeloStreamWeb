import { useEffect, useState } from "react";

type AvatarSize = "sm" | "md" | "lg" | "xl";

interface UserAvatarProps {
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  size?: AvatarSize;
  className?: string;
}

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-xs",
  lg: "h-14 w-14 text-lg",
  xl: "h-20 w-20 text-xl",
};

function getInitials(displayName: string, username: string): string {
  const source = (displayName || username).trim();
  if (!source) {
    return "V";
  }
  const parts = source.split(/\s+/);
  const first = parts[0]?.[0] ?? "V";
  const second = parts[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase();
}

export function UserAvatar({
  displayName,
  username,
  avatarUrl,
  size = "md",
  className = "",
}: UserAvatarProps) {
  const [imageErrorUrl, setImageErrorUrl] = useState<string | null>(null);

  useEffect(() => {
    setImageErrorUrl(null);
  }, [avatarUrl]);

  const showImage = Boolean(avatarUrl && imageErrorUrl !== avatarUrl);
  const initials = getInitials(displayName, username);

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--vs-border)] bg-[var(--vs-accent)] font-display font-bold text-white select-none ${SIZE_CLASSES[size]} ${className}`}
    >
      {showImage ? (
        <img
          src={avatarUrl ?? undefined}
          alt={`${displayName || username} profile avatar`}
          onError={() => setImageErrorUrl(avatarUrl ?? null)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  );
}
