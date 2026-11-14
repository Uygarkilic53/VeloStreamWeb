import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { saveStreamSnapshot } from "../lib/snapshots";
import { StreamThumbnail } from "./StreamThumbnail";

describe("StreamThumbnail component", () => {
  const mockSnapshotUrl = "data:image/jpeg;base64,sample_snapshot_image";

  it("renders snapshot image and SNAPSHOT tag by default when not hovered", () => {
    render(
      <StreamThumbnail
        scene="rust"
        viewerCount={1200}
        quality="1080p60"
        isLive={true}
        snapshotUrl={mockSnapshotUrl}
        slug="mira_codes"
      />,
    );

    const snapshotImg = screen.getByAltText(/live stream snapshot/i);
    expect(snapshotImg).toBeInTheDocument();
    expect(snapshotImg).toHaveAttribute("src", mockSnapshotUrl);

    expect(screen.getByText("SNAPSHOT")).toBeInTheDocument();
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect(screen.getByText(/1\.2k viewers/i)).toBeInTheDocument();
    expect(screen.queryByTestId("stream-hover-video")).not.toBeInTheDocument();
  });

  it("resolves cached snapshot from slug when snapshotUrl prop is omitted", () => {
    const cachedUrl = "data:image/jpeg;base64,auto_cached_snapshot_from_slug";
    saveStreamSnapshot("cache_streamer", cachedUrl);

    render(
      <StreamThumbnail
        scene="rust"
        viewerCount={850}
        quality="1080p60"
        isLive={true}
        slug="cache_streamer"
      />,
    );

    const snapshotImg = screen.getByAltText(/live stream snapshot/i);
    expect(snapshotImg).toBeInTheDocument();
    expect(snapshotImg).toHaveAttribute("src", cachedUrl);
    expect(screen.getByText("SNAPSHOT")).toBeInTheDocument();
  });

  it("activates live stream preview when hovered and stream is live", () => {
    const { container, rerender } = render(
      <StreamThumbnail
        scene="rust"
        viewerCount={1200}
        quality="1080p60"
        isLive={true}
        snapshotUrl={mockSnapshotUrl}
        slug="mira_codes"
        isHovered={false}
      />,
    );

    expect(screen.queryByTestId("stream-hover-video")).not.toBeInTheDocument();
    expect(screen.getByText("SNAPSHOT")).toBeInTheDocument();

    // Hover on
    rerender(
      <StreamThumbnail
        scene="rust"
        viewerCount={1200}
        quality="1080p60"
        isLive={true}
        snapshotUrl={mockSnapshotUrl}
        slug="mira_codes"
        isHovered={true}
      />,
    );

    // Live video is mounted
    const video = container.querySelector("video");
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute("data-testid", "stream-hover-video");

    // Snapshot image remains underneath as seamless visual backing
    expect(screen.getByAltText(/live stream snapshot/i)).toBeInTheDocument();
  });

  it("reverts to showing snapshot when user hovers off", () => {
    const { container, rerender } = render(
      <StreamThumbnail
        scene="fps"
        viewerCount={500}
        quality="720p60"
        isLive={true}
        snapshotUrl={mockSnapshotUrl}
        slug="apex_pro"
        isHovered={true}
      />,
    );

    expect(container.querySelector("video")).toBeInTheDocument();

    // Hover off
    rerender(
      <StreamThumbnail
        scene="fps"
        viewerCount={500}
        quality="720p60"
        isLive={true}
        snapshotUrl={mockSnapshotUrl}
        slug="apex_pro"
        isHovered={false}
      />,
    );

    // Video is unmounted
    expect(container.querySelector("video")).not.toBeInTheDocument();

    // Snapshot image is visible again with SNAPSHOT badge
    const snapshotImg = screen.getByAltText(/live stream snapshot/i);
    expect(snapshotImg).toBeInTheDocument();
    expect(snapshotImg).toHaveAttribute("src", mockSnapshotUrl);
    expect(screen.getByText("SNAPSHOT")).toBeInTheDocument();
  });

  it("triggers hover preview via uncontrolled internal mouse enter and leave", () => {
    const { container } = render(
      <StreamThumbnail
        scene="compiler"
        viewerCount={300}
        quality="1080p60"
        isLive={true}
        snapshotUrl={mockSnapshotUrl}
        slug="zig_dev"
      />,
    );

    const card = container.firstElementChild as HTMLElement;
    expect(screen.queryByTestId("stream-hover-video")).not.toBeInTheDocument();

    // Mouse enter
    fireEvent.mouseEnter(card);
    expect(container.querySelector("video")).toBeInTheDocument();

    // Mouse leave
    fireEvent.mouseLeave(card);
    expect(container.querySelector("video")).not.toBeInTheDocument();
    expect(screen.getByAltText(/live stream snapshot/i)).toBeInTheDocument();
  });

  it("does not render hover preview when stream is offline (isLive = false)", () => {
    const { container } = render(
      <StreamThumbnail
        scene="rust"
        viewerCount={0}
        quality="1080p60"
        isLive={false}
        snapshotUrl={mockSnapshotUrl}
        slug="offline_user"
        isHovered={true}
      />,
    );

    // Offline streams should never mount video player
    expect(container.querySelector("video")).not.toBeInTheDocument();
    expect(screen.getByText("OFFLINE")).toBeInTheDocument();
    expect(screen.getByAltText(/live stream snapshot/i)).toBeInTheDocument();
  });
});
