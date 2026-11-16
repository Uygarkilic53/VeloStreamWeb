import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModerationWarningModal, type ModerationWarningData } from "./ModerationWarningModal";

describe("ModerationWarningModal", () => {
  const sampleWarning: ModerationWarningData = {
    channelId: "channel-123",
    channelSlug: "alex_dev",
    moderatorUsername: "alex_dev",
    reason: "Please keep chat civil and avoid spamming links.",
    warnedAt: new Date().toISOString(),
  };

  it("renders modal with warning message, backdrop, and role='dialog'", () => {
    const onAcknowledge = vi.fn();
    render(<ModerationWarningModal warning={sampleWarning} onAcknowledge={onAcknowledge} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Channel Moderation Warning")).toBeInTheDocument();
    expect(screen.getByText(/Please keep chat civil and avoid spamming links\./i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /I Understand & Acknowledge/i })).toBeInTheDocument();
  });

  it("invokes onAcknowledge when acknowledge button is clicked", () => {
    const onAcknowledge = vi.fn();
    render(<ModerationWarningModal warning={sampleWarning} onAcknowledge={onAcknowledge} />);

    fireEvent.click(screen.getByRole("button", { name: /I Understand & Acknowledge/i }));
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  });
});
