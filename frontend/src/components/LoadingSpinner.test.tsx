import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingSpinner } from "./LoadingSpinner";

describe("LoadingSpinner", () => {
  it("renders with default accessible role='status' and aria-live='polite'", () => {
    render(<LoadingSpinner />);
    const spinner = screen.getByRole("status");
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAttribute("aria-live", "polite");
    expect(spinner).toHaveAttribute("aria-label", "Loading");
  });

  it("renders optional label and screen-reader announcement", () => {
    render(<LoadingSpinner label="Loading live broadcasts..." />);
    const spinner = screen.getByRole("status");
    expect(spinner).toHaveAttribute("aria-label", "Loading live broadcasts...");
    expect(screen.getByText("Loading live broadcasts...")).toBeInTheDocument();
  });

  it("renders flat line loading track and animated runner with blueish styling", () => {
    render(<LoadingSpinner label="Loading..." />);
    const track = screen.getByTestId("loading-flat-line-track");
    const runner = screen.getByTestId("loading-flat-line-runner");

    expect(track).toBeInTheDocument();
    expect(track.className).toContain("overflow-hidden");
    expect(track.className).toContain("rounded-full");
    expect(runner).toBeInTheDocument();
    expect(runner.className).toContain("animate-flat-line");
  });

  it("supports fullWidth prop and custom class names", () => {
    const { rerender } = render(<LoadingSpinner fullWidth className="custom-container" lineClassName="h-2" />);
    const spinner = screen.getByRole("status");
    const track = screen.getByTestId("loading-flat-line-track");

    expect(spinner.className).toContain("custom-container");
    expect(track.className).not.toContain("max-w-md");
    expect(track.className).toContain("h-2");

    rerender(<LoadingSpinner fullWidth={false} />);
    const trackDefault = screen.getByTestId("loading-flat-line-track");
    expect(trackDefault.className).toContain("max-w-md");
  });
});
