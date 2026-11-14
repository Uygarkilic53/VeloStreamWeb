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
  LuTrash2,
  LuTv,
  LuUpload,
  LuUser,
  LuUserPlus,
  LuUsers,
  LuVideo,
  LuX,
} from "react-icons/lu";
import type { StreamCategory } from "../lib/auth";

export interface IconProps {
  className?: string;
}

function createIcon(Component: IconType, defaultClassName = "h-4 w-4") {
  return function WrappedIcon({ className = defaultClassName }: IconProps) {
    return <Component className={className} aria-hidden="true" />;
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
