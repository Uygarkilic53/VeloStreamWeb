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
  TrashIcon,
  TvIcon,
  UploadIcon,
  UserIcon,
  UserPlusIcon,
  UsersIcon,
} from "./Icons";

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
});
