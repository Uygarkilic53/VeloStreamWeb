import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { STREAM_CATEGORIES } from "../lib/streams";
import {
  ArrowLeftIcon,
  BanIcon,
  BroadcastIcon,
  CalendarIcon,
  CameraIcon,
  CategoryIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  CompassIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  GlobeIcon,
  HeartIcon,
  LockIcon,
  LogInIcon,
  LogOutIcon,
  MaximizeIcon,
  MessageSquareIcon,
  MicIcon,
  MicOffIcon,
  MinimizeIcon,
  MonitorIcon,
  MoonIcon,
  PlayIcon,
  RefreshIcon,
  SaveIcon,
  SearchIcon,
  SearchXIcon,
  SendIcon,
  SettingsIcon,
  ShieldAlertIcon,
  ShieldIcon,
  SidebarToggleIcon,
  SlidersIcon,
  SunIcon,
  TimerIcon,
  TrashIcon,
  TvIcon,
  UploadIcon,
  UserIcon,
  UserPlusIcon,
  UsersIcon,
  AlertTriangleIcon,
  VolumeXIcon,
  Volume2Icon,
  PauseIcon,
  ImageIcon,
  UserCheckIcon,
  UserMinusIcon,
  CreatorBadgeIcon,
  ModeratorBadgeIcon,
  UserBadgeIcon,
  RoleBadgeIcon,
} from "./Icons";
import { getRoleColorClass, normalizeChatRole } from "../lib/chat";

describe("Icons (react-icons wrappers)", () => {
  const iconComponents = [
    ["SunIcon", SunIcon],
    ["MoonIcon", MoonIcon],
    ["SearchIcon", SearchIcon],
    ["SearchXIcon", SearchXIcon],
    ["BroadcastIcon", BroadcastIcon],
    ["EyeIcon", EyeIcon],
    ["EyeOffIcon", EyeOffIcon],
    ["ShieldIcon", ShieldIcon],
    ["ShieldAlertIcon", ShieldAlertIcon],
    ["CopyIcon", CopyIcon],
    ["CheckIcon", CheckIcon],
    ["SidebarToggleIcon", SidebarToggleIcon],
    ["PlayIcon", PlayIcon],
    ["UserIcon", UserIcon],
    ["UsersIcon", UsersIcon],
    ["UserPlusIcon", UserPlusIcon],
    ["MicIcon", MicIcon],
    ["MicOffIcon", MicOffIcon],
    ["CameraIcon", CameraIcon],
    ["MonitorIcon", MonitorIcon],
    ["CompassIcon", CompassIcon],
    ["HeartIcon", HeartIcon],
    ["LogOutIcon", LogOutIcon],
    ["LogInIcon", LogInIcon],
    ["RefreshIcon", RefreshIcon],
    ["ClockIcon", ClockIcon],
    ["TimerIcon", TimerIcon],
    ["CalendarIcon", CalendarIcon],
    ["TvIcon", TvIcon],
    ["MaximizeIcon", MaximizeIcon],
    ["MinimizeIcon", MinimizeIcon],
    ["SendIcon", SendIcon],
    ["MessageSquareIcon", MessageSquareIcon],
    ["BanIcon", BanIcon],
    ["LockIcon", LockIcon],
    ["SettingsIcon", SettingsIcon],
    ["SlidersIcon", SlidersIcon],
    ["GlobeIcon", GlobeIcon],
    ["UploadIcon", UploadIcon],
    ["TrashIcon", TrashIcon],
    ["ArrowLeftIcon", ArrowLeftIcon],
    ["SaveIcon", SaveIcon],
    ["CloseIcon", CloseIcon],
    ["AlertTriangleIcon", AlertTriangleIcon],
    ["VolumeXIcon", VolumeXIcon],
    ["Volume2Icon", Volume2Icon],
    ["PauseIcon", PauseIcon],
    ["ImageIcon", ImageIcon],
    ["UserCheckIcon", UserCheckIcon],
    ["UserMinusIcon", UserMinusIcon],
    ["CreatorBadgeIcon", CreatorBadgeIcon],
    ["ModeratorBadgeIcon", ModeratorBadgeIcon],
    ["UserBadgeIcon", UserBadgeIcon],
  ] as const;

  it.each(iconComponents)("renders %s as an accessible-hidden SVG icon", (_name, Icon) => {
    const { container } = render(<Icon className="h-5 w-5" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg?.getAttribute("class")).toContain("h-5 w-5");
  });

  it("renders distinct CategoryIcon SVGs for every stream category", () => {
    const paths = STREAM_CATEGORIES.map((category) => {
      const { container } = render(<CategoryIcon category={category} />);
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute("aria-hidden", "true");
      return svg?.innerHTML ?? "";
    });
    expect(new Set(paths).size).toBe(STREAM_CATEGORIES.length);
  });

  it("renders RoleBadgeIcon with correct icon for each chat role", () => {
    const { container: creatorContainer } = render(<RoleBadgeIcon role="Creator" />);
    expect(creatorContainer.querySelector("[data-testid='creator-badge-icon']")).not.toBeNull();

    const { container: hostContainer } = render(<RoleBadgeIcon role="host" />);
    expect(hostContainer.querySelector("[data-testid='creator-badge-icon']")).not.toBeNull();

    const { container: ownerContainer } = render(<RoleBadgeIcon role="Owner" />);
    expect(ownerContainer.querySelector("[data-testid='creator-badge-icon']")).not.toBeNull();

    const { container: modContainer } = render(<RoleBadgeIcon role="Moderator" />);
    expect(modContainer.querySelector("[data-testid='moderator-badge-icon']")).not.toBeNull();

    const { container: modShortContainer } = render(<RoleBadgeIcon role="Mod" />);
    expect(modShortContainer.querySelector("[data-testid='moderator-badge-icon']")).not.toBeNull();

    const { container: adminContainer } = render(<RoleBadgeIcon role="admin" />);
    expect(adminContainer.querySelector("[data-testid='moderator-badge-icon']")).not.toBeNull();

    const { container: userContainer } = render(<RoleBadgeIcon role="User" />);
    expect(userContainer.querySelector("[data-testid='user-badge-icon']")).not.toBeNull();

    const { container: audienceContainer } = render(<RoleBadgeIcon role="Audience" />);
    expect(audienceContainer.querySelector("[data-testid='user-badge-icon']")).not.toBeNull();

    const { container: fallbackContainer } = render(<RoleBadgeIcon role={null} />);
    expect(fallbackContainer.querySelector("[data-testid='user-badge-icon']")).not.toBeNull();
  });

  it("normalizes chat role strings correctly", () => {
    expect(normalizeChatRole("Creator")).toBe("Creator");
    expect(normalizeChatRole("creator")).toBe("Creator");
    expect(normalizeChatRole("Host")).toBe("Creator");
    expect(normalizeChatRole("owner")).toBe("Creator");
    expect(normalizeChatRole("streamer")).toBe("Creator");

    expect(normalizeChatRole("Moderator")).toBe("Moderator");
    expect(normalizeChatRole("moderator")).toBe("Moderator");
    expect(normalizeChatRole("Mod")).toBe("Moderator");
    expect(normalizeChatRole("mod")).toBe("Moderator");
    expect(normalizeChatRole("admin")).toBe("Moderator");
    expect(normalizeChatRole("guard")).toBe("Moderator");

    expect(normalizeChatRole("User")).toBe("User");
    expect(normalizeChatRole("user")).toBe("User");
    expect(normalizeChatRole("Audience")).toBe("User");
    expect(normalizeChatRole("viewer")).toBe("User");
    expect(normalizeChatRole("")).toBe("User");
    expect(normalizeChatRole(null)).toBe("User");
    expect(normalizeChatRole(undefined)).toBe("User");
  });

  it("returns correct role color and lightning effect classes", () => {
    // Creator receives flashing blue lightning effect
    expect(getRoleColorClass("Creator")).toBe("chat-creator-lightning");
    expect(getRoleColorClass("creator")).toBe("chat-creator-lightning");
    expect(getRoleColorClass("Host")).toBe("chat-creator-lightning");

    // Moderator receives greenish lightning effect
    expect(getRoleColorClass("Moderator")).toBe("chat-moderator-lightning");
    expect(getRoleColorClass("moderator")).toBe("chat-moderator-lightning");
    expect(getRoleColorClass("Mod")).toBe("chat-moderator-lightning");
    expect(getRoleColorClass("guard")).toBe("chat-moderator-lightning");

    // Regular users receive standard text color (no lightning animation)
    expect(getRoleColorClass("User")).toBe("text-[var(--vs-text)]");
    expect(getRoleColorClass("user")).toBe("text-[var(--vs-text)]");
    expect(getRoleColorClass("viewer")).toBe("text-[var(--vs-text)]");
    expect(getRoleColorClass("")).toBe("text-[var(--vs-text)]");
    expect(getRoleColorClass(null)).toBe("text-[var(--vs-text)]");
    expect(getRoleColorClass(undefined)).toBe("text-[var(--vs-text)]");
  });

  it("renders badge icons with optional title tooltip", () => {
    const { container: creator } = render(<CreatorBadgeIcon title="Stream Broadcaster" />);
    expect(creator.querySelector("title")?.textContent).toBe("Stream Broadcaster");

    const { container: mod } = render(<ModeratorBadgeIcon title="Room Guardian" />);
    expect(mod.querySelector("title")?.textContent).toBe("Room Guardian");

    const { container: user } = render(<UserBadgeIcon title="Viewer" />);
    expect(user.querySelector("title")?.textContent).toBe("Viewer");
  });
});
