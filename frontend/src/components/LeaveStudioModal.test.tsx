import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LeaveStudioModal } from "./LeaveStudioModal";

describe("LeaveStudioModal", () => {
  it("does not render when isOpen is false", () => {
    render(
      <LeaveStudioModal
        isOpen={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders accessible modal with title, description, and action buttons when open", () => {
    render(
      <LeaveStudioModal
        isOpen={true}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        targetPageName="Browse"
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "leave-studio-modal-title");
    expect(dialog).toHaveAttribute("aria-describedby", "leave-studio-modal-description");

    expect(screen.getByRole("heading", { name: /leave studio and end broadcast\?/i })).toBeInTheDocument();
    expect(
      screen.getByText(/if you proceed to leave studio, your live streaming will be ended and you will be redirected to browse\./i)
    ).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /stay in studio/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /end stream & leave/i })).toBeInTheDocument();
  });

  it("focuses 'Stay in studio' button by default on open for safety", () => {
    render(
      <LeaveStudioModal
        isOpen={true}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    const stayButton = screen.getByRole("button", { name: /stay in studio/i });
    expect(stayButton).toHaveFocus();
  });

  it("calls onCancel when 'Stay in studio' button is clicked", async () => {
    const user = userEvent.setup();
    const handleCancel = vi.fn();
    const handleConfirm = vi.fn();

    render(
      <LeaveStudioModal
        isOpen={true}
        onCancel={handleCancel}
        onConfirm={handleConfirm}
      />
    );

    await user.click(screen.getByRole("button", { name: /stay in studio/i }));
    expect(handleCancel).toHaveBeenCalledTimes(1);
    expect(handleConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm when 'End stream & leave' button is clicked", async () => {
    const user = userEvent.setup();
    const handleCancel = vi.fn();
    const handleConfirm = vi.fn();

    render(
      <LeaveStudioModal
        isOpen={true}
        onCancel={handleCancel}
        onConfirm={handleConfirm}
      />
    );

    await user.click(screen.getByRole("button", { name: /end stream & leave/i }));
    expect(handleConfirm).toHaveBeenCalledTimes(1);
    expect(handleCancel).not.toHaveBeenCalled();
  });

  it("calls onCancel when close (X) button is clicked", async () => {
    const user = userEvent.setup();
    const handleCancel = vi.fn();

    render(
      <LeaveStudioModal
        isOpen={true}
        onCancel={handleCancel}
        onConfirm={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /close modal/i }));
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Escape key is pressed", async () => {
    const user = userEvent.setup();
    const handleCancel = vi.fn();

    render(
      <LeaveStudioModal
        isOpen={true}
        onCancel={handleCancel}
        onConfirm={vi.fn()}
      />
    );

    await user.keyboard("{Escape}");
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when clicking outside the dialog on the backdrop", async () => {
    const user = userEvent.setup();
    const handleCancel = vi.fn();

    render(
      <LeaveStudioModal
        isOpen={true}
        onCancel={handleCancel}
        onConfirm={vi.fn()}
      />
    );

    const backdrop = screen.getByTestId("leave-studio-modal");
    await user.click(backdrop);
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it("disables buttons and displays 'Ending broadcast...' when isEnding is true", () => {
    render(
      <LeaveStudioModal
        isOpen={true}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        isEnding={true}
      />
    );

    const stayBtn = screen.getByRole("button", { name: /stay in studio/i });
    const endBtn = screen.getByRole("button", { name: /ending broadcast\.\.\./i });

    expect(stayBtn).toBeDisabled();
    expect(endBtn).toBeDisabled();
  });

  it("renders custom message when target is sign out", () => {
    render(
      <LeaveStudioModal
        isOpen={true}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        targetPageName="sign out"
      />
    );

    expect(
      screen.getByText(/if you proceed to leave studio, your live streaming will be ended and you will be signed out\./i)
    ).toBeInTheDocument();
  });

  it("traps Tab key focus inside the dialog", async () => {
    const user = userEvent.setup();

    render(
      <LeaveStudioModal
        isOpen={true}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    const closeBtn = screen.getByRole("button", { name: /close modal/i });
    const stayBtn = screen.getByRole("button", { name: /stay in studio/i });
    const confirmBtn = screen.getByRole("button", { name: /end stream & leave/i });

    // Focus starts on stayBtn
    expect(stayBtn).toHaveFocus();

    // Tab from stayBtn -> confirmBtn
    await user.tab();
    expect(confirmBtn).toHaveFocus();

    // Tab from confirmBtn (last element) -> wraps to closeBtn (first element)
    await user.tab();
    expect(closeBtn).toHaveFocus();

    // Shift+Tab from closeBtn (first element) -> wraps to confirmBtn (last element)
    await user.tab({ shift: true });
    expect(confirmBtn).toHaveFocus();
  });
});
