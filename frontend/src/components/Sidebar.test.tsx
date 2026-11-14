import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { StreamDirectoryItem } from "../lib/streams";
import { Sidebar } from "./Sidebar";

const MOCK_LIVE_STREAM: StreamDirectoryItem = {
  id: "ch_mira",
  slug: "mira_codes",
  displayName: "Mira Vance",
  title: "Building real-time WebRTC",
  category: "Programming",
  subCategory: "Rust",
  viewerCount: 128,
  uptime: "1h 40m",
  quality: "1080p60",
  tags: ["rust", "webrtc"],
  followersLabel: "1.2k",
  schedule: ["Mon", "Wed"],
  bio: "Rust graphics engine",
  isLive: true,
  scene: "rust",
  avatarInitials: "MV",
  avatarAccent: "#3b82f6",
  avatarUrl: null,
  ingestProtocol: "WHIP",
};

describe("Sidebar - Live channels and empty states", () => {
  it("renders empty state in expanded mode when no channels are live", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <Sidebar
        streams={[]}
        activeCategory="All Live"
        onSelectCategory={vi.fn()}
        onNavigate={onNavigate}
        collapsed={false}
      />,
    );

    expect(screen.getByText("Live channels")).toBeInTheDocument();
    expect(screen.getByText("0 on air")).toBeInTheDocument();
    expect(screen.getByText("No live channels")).toBeInTheDocument();
    expect(screen.getByText("Nobody is broadcasting right now.")).toBeInTheDocument();

    const startBtn = screen.getByRole("button", { name: /start streaming/i });
    expect(startBtn).toBeInTheDocument();
    await user.click(startBtn);
    expect(onNavigate).toHaveBeenCalledWith({ page: "studio" });
  });

  it("renders empty state icon in collapsed mode when no channels are live and navigates to studio on click", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <Sidebar
        streams={[]}
        activeCategory="All Live"
        onSelectCategory={vi.fn()}
        onNavigate={onNavigate}
        collapsed={true}
      />,
    );

    expect(screen.queryByText("Live channels")).not.toBeInTheDocument();
    const collapsedBtn = screen.getByTitle("No live channels on air");
    expect(collapsedBtn).toBeInTheDocument();
    await user.click(collapsedBtn);
    expect(onNavigate).toHaveBeenCalledWith({ page: "studio" });
  });

  it("renders live channels when channels are streaming and navigates on click", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <Sidebar
        streams={[MOCK_LIVE_STREAM]}
        activeCategory="All Live"
        onSelectCategory={vi.fn()}
        onNavigate={onNavigate}
        collapsed={false}
      />,
    );

    expect(screen.getByText("1 on air")).toBeInTheDocument();
    expect(screen.getByText(/mira_codes/i)).toBeInTheDocument();
    expect(screen.getByText("Rust")).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();

    const channelBtn = screen.getByTitle(/Mira Vance \(@mira_codes\) — Programming/i);
    await user.click(channelBtn);
    expect(onNavigate).toHaveBeenCalledWith({ page: "watch", slug: "mira_codes" });
  });

  it("displays accurate total count when > 5 live channels exist and filters offline streams", () => {
    const liveStreams: StreamDirectoryItem[] = Array.from({ length: 7 }, (_, i) => ({
      ...MOCK_LIVE_STREAM,
      id: `ch_${i}`,
      slug: `creator_${i}`,
      displayName: `Creator ${i}`,
      isLive: true,
      viewerCount: 10 + i,
    }));

    const offlineStream: StreamDirectoryItem = {
      ...MOCK_LIVE_STREAM,
      id: "ch_offline",
      slug: "offline_user",
      displayName: "Offline User",
      isLive: false,
      viewerCount: 0,
    };

    render(
      <Sidebar
        streams={[...liveStreams, offlineStream]}
        activeCategory="All Live"
        onSelectCategory={vi.fn()}
        onNavigate={vi.fn()}
        collapsed={false}
      />,
    );

    // Should display total live count: 7 on air (offline stream excluded)
    expect(screen.getByText("7 on air")).toBeInTheDocument();

    // Top 5 channels should be rendered
    expect(screen.getByText("@creator_0")).toBeInTheDocument();
    expect(screen.getByText("@creator_4")).toBeInTheDocument();
    // 6th and 7th channels should be sliced out of top 5
    expect(screen.queryByText("@creator_5")).not.toBeInTheDocument();
    expect(screen.queryByText("@offline_user")).not.toBeInTheDocument();
  });

  it("renders LoadingSpinner with flat line loading indicator when isLoading is true", () => {
    render(
      <Sidebar
        streams={[]}
        activeCategory="All Live"
        onSelectCategory={vi.fn()}
        onNavigate={vi.fn()}
        collapsed={false}
        isLoading={true}
      />,
    );

    const spinner = screen.getByRole("status");
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAttribute("aria-label", "Loading channels...");
    expect(screen.getByText("Loading channels...")).toBeInTheDocument();
    expect(screen.queryByText("No live channels")).not.toBeInTheDocument();
  });
});
