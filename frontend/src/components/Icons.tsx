import type { IconType } from "react-icons";
import {
  LuArrowLeft,
  LuBan,
  LuCalendar,
  LuCheck,
  LuClock,
  LuCodeXml,
  LuCompass,
  LuCopy,
  LuEye,
  LuEyeOff,
  LuFlame,
  LuGamepad2,
  LuGlobe,
  LuHeart,
  LuLock,
  LuLogIn,
  LuLogOut,
  LuMaximize2,
  LuMessageCircle,
  LuMessageSquare,
  LuMic,
  LuMicOff,
  LuMinimize2,
  LuMonitor,
  LuMoon,
  LuMusic,
  LuPalette,
  LuPanelLeft,
  LuPause,
  LuPlay,
  LuRadio,
  LuRefreshCw,
  LuSave,
  LuSearch,
  LuSearchX,
  LuSend,
  LuSettings,
  LuShieldAlert,
  LuShieldCheck,
  LuSlidersHorizontal,
  LuSun,
  LuTimer,
  LuTrash2,
  LuTriangleAlert,
  LuTv,
  LuUpload,
  LuUser,
  LuUserCheck,
  LuUserMinus,
  LuUserPlus,
  LuUsers,
  LuVideo,
  LuVolume2,
  LuVolumeX,
  LuX,
  LuImage,
} from "react-icons/lu";
import type { StreamCategory } from "../lib/auth";
import { type ChatRole, normalizeChatRole } from "../lib/chat";

export interface IconProps {
  className?: string | undefined;
  "data-testid"?: string | undefined;
  title?: string | undefined;
}

function createIcon(Component: IconType, defaultClassName = "h-4 w-4") {
  return function WrappedIcon({ className = defaultClassName, "data-testid": testId, title }: IconProps) {
    return (
      <Component
        className={className}
        aria-hidden="true"
        data-testid={testId}
        {...(title !== undefined ? { title } : {})}
      />
    );
  };
}

export const SunIcon = createIcon(LuSun);
export const MoonIcon = createIcon(LuMoon);
export const SearchIcon = createIcon(LuSearch);
export const SearchXIcon = createIcon(LuSearchX);
export const BroadcastIcon = createIcon(LuRadio);
export const EyeIcon = createIcon(LuEye);
export const EyeOffIcon = createIcon(LuEyeOff);
export const ShieldIcon = createIcon(LuShieldCheck);
export const ShieldAlertIcon = createIcon(LuShieldAlert);
export const CopyIcon = createIcon(LuCopy);
export const CheckIcon = createIcon(LuCheck);
export const SidebarToggleIcon = createIcon(LuPanelLeft);
export const PlayIcon = createIcon(LuPlay);
export const UserIcon = createIcon(LuUser);
export const UsersIcon = createIcon(LuUsers);
export const UserPlusIcon = createIcon(LuUserPlus);
export const MicIcon = createIcon(LuMic);
export const MicOffIcon = createIcon(LuMicOff);
export const CameraIcon = createIcon(LuVideo);
export const MonitorIcon = createIcon(LuMonitor);
export const CompassIcon = createIcon(LuCompass);
export const HeartIcon = createIcon(LuHeart);
export const LogOutIcon = createIcon(LuLogOut);
export const LogInIcon = createIcon(LuLogIn);
export const RefreshIcon = createIcon(LuRefreshCw);
export const ClockIcon = createIcon(LuClock);
export const TimerIcon = createIcon(LuTimer);
export const CalendarIcon = createIcon(LuCalendar);
export const TvIcon = createIcon(LuTv);
export const MaximizeIcon = createIcon(LuMaximize2);
export const MinimizeIcon = createIcon(LuMinimize2);
export const SendIcon = createIcon(LuSend);
export const MessageSquareIcon = createIcon(LuMessageSquare);
export const BanIcon = createIcon(LuBan);
export const LockIcon = createIcon(LuLock);
export const SettingsIcon = createIcon(LuSettings);
export const SlidersIcon = createIcon(LuSlidersHorizontal);
export const GlobeIcon = createIcon(LuGlobe);
export const UploadIcon = createIcon(LuUpload);
export const TrashIcon = createIcon(LuTrash2);
export const ArrowLeftIcon = createIcon(LuArrowLeft);
export const SaveIcon = createIcon(LuSave);
export const CloseIcon = createIcon(LuX);
export const AlertTriangleIcon = createIcon(LuTriangleAlert);
export const VolumeXIcon = createIcon(LuVolumeX);
export const Volume2Icon = createIcon(LuVolume2);
export const PauseIcon = createIcon(LuPause);
export const ImageIcon = createIcon(LuImage);
export const UserCheckIcon = createIcon(LuUserCheck);
export const UserMinusIcon = createIcon(LuUserMinus);

const CATEGORY_ICON_MAP: Record<"All Live" | StreamCategory, IconType> = {
  "All Live": LuFlame,
  Gaming: LuGamepad2,
  "Just Chatting": LuMessageCircle,
  Programming: LuCodeXml,
  "Music & Audio": LuMusic,
  Creative: LuPalette,
};

export function CategoryIcon({
  category,
  className = "h-3.5 w-3.5",
}: IconProps & { category: "All Live" | StreamCategory }) {
  const Component = CATEGORY_ICON_MAP[category];
  return <Component className={className} aria-hidden="true" />;
}

export function CreatorBadgeIcon({
  className = "h-4 w-4",
  title,
  "data-testid": testId,
}: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      data-testid={testId}
    >
      {title && <title>{title}</title>}
      {/* Background Container Squircle */}
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="5.5"
        fill="#0B132B"
        stroke="#1E3A8A"
        strokeWidth="1.25"
      />
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="4.5"
        fill="#2563EB"
        fillOpacity="0.14"
      />
      {/* Studio Crown & Geometric Broadcast Nodes */}
      <path
        d="M5.8 16.2L7.2 9.2L10.2 12L12 7.6L13.8 12L16.8 9.2L18.2 16.2H5.8Z"
        fill="#2563EB"
        stroke="#60A5FA"
        strokeWidth="1.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Horizontal Horizon Platform */}
      <rect x="6.4" y="15" width="11.2" height="1.6" rx="0.8" fill="#93C5FD" />
      {/* Signal Beacons on Crown Peaks */}
      <circle cx="12" cy="5.6" r="1.15" fill="#60A5FA" />
      <circle cx="7.2" cy="7.4" r="0.9" fill="#93C5FD" />
      <circle cx="16.8" cy="7.4" r="0.9" fill="#93C5FD" />
    </svg>
  );
}

export function ModeratorBadgeIcon({
  className = "h-4 w-4",
  title,
  "data-testid": testId,
}: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      data-testid={testId}
    >
      {title && <title>{title}</title>}
      {/* Background Container Squircle */}
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="5.5"
        fill="#0C1512"
        stroke="#134E4A"
        strokeWidth="1.25"
      />
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="4.5"
        fill="#10B981"
        fillOpacity="0.12"
      />
      {/* Crisp Protective Shield */}
      <path
        d="M12 5.2L17.5 7.4V11.8C17.5 15.3 15.1 18 12 19C8.9 18 6.5 15.3 6.5 11.8V7.4L12 5.2Z"
        fill="#10B981"
        stroke="#34D399"
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Verified Moderator Checkmark */}
      <path
        d="M9.4 11.9L11.2 13.7L14.8 10.1"
        stroke="#ECFDF5"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Micro Telemetry Node Dot */}
      <circle cx="12" cy="3.6" r="0.85" fill="#34D399" />
    </svg>
  );
}

export function UserBadgeIcon({
  className = "h-4 w-4",
  title,
  "data-testid": testId,
}: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      data-testid={testId}
    >
      {title && <title>{title}</title>}
      {/* Background Container Squircle */}
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="5.5"
        fill="#0F172A"
        stroke="#334155"
        strokeWidth="1.25"
      />
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="4.5"
        fill="#64748B"
        fillOpacity="0.12"
      />
      {/* Audience Profile Silhouette */}
      <circle
        cx="12"
        cy="9"
        r="3.2"
        fill="#94A3B8"
        stroke="#CBD5E1"
        strokeWidth="1.1"
      />
      <path
        d="M6.6 17.5C6.6 14.7 9 13.4 12 13.4C15 13.4 17.4 14.7 17.4 17.5"
        stroke="#CBD5E1"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      {/* Low-latency Peer Connection Dot */}
      <circle cx="17.6" cy="6.2" r="1.0" fill="#38BDF8" />
    </svg>
  );
}

export type { ChatRole };

export function RoleBadgeIcon({
  role,
  className = "h-3.5 w-3.5 shrink-0",
  title,
  "data-testid": testId,
}: {
  role?: ChatRole | null | undefined;
  className?: string | undefined;
  title?: string | undefined;
  "data-testid"?: string | undefined;
}) {
  const normalizedRole = normalizeChatRole(role);
  const testIdAttr = testId ?? `${normalizedRole.toLowerCase()}-badge-icon`;
  const iconProps: IconProps = {
    className,
    "data-testid": testIdAttr,
    ...(title !== undefined ? { title } : {}),
  };
  if (normalizedRole === "Creator") {
    return <CreatorBadgeIcon {...iconProps} />;
  }
  if (normalizedRole === "Moderator") {
    return <ModeratorBadgeIcon {...iconProps} />;
  }
  return <UserBadgeIcon {...iconProps} />;
}

