import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GifPicker } from "./GifPicker";

describe("GifPicker", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("fetches and renders trending GIFs on mount", async () => {
    const mockGifs = [
      {
        id: "gif1",
        title: "Excited Cat",
        previewUrl: "https://media.giphy.com/media/gif1/fixed_width.gif",
        originalUrl: "https://media.giphy.com/media/gif1/giphy.gif",
        width: 200,
        height: 200,
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ gifs: mockGifs }),
    } as unknown as Response);

    const onSelectGif = vi.fn();
    const onClose = vi.fn();

    render(<GifPicker onSelectGif={onSelectGif} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Excited Cat" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("img", { name: "Excited Cat" }));
    expect(onSelectGif).toHaveBeenCalledWith("https://media.giphy.com/media/gif1/giphy.gif");
  });

  it("searches GIFs on text input", async () => {
    const mockSearchResults = [
      {
        id: "gif2",
        title: "Dancing Dog",
        previewUrl: "https://media.giphy.com/media/gif2/fixed_width.gif",
        originalUrl: "https://media.giphy.com/media/gif2/giphy.gif",
        width: 200,
        height: 200,
      },
    ];

    globalThis.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("dance")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ gifs: mockSearchResults }),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ gifs: [] }),
      } as unknown as Response);
    });

    const onSelectGif = vi.fn();
    const onClose = vi.fn();

    render(<GifPicker onSelectGif={onSelectGif} onClose={onClose} />);

    const searchInput = screen.getByPlaceholderText(/Search GIPHY/i);
    fireEvent.change(searchInput, { target: { value: "dance" } });

    await waitFor(
      () => {
        expect(screen.getByRole("img", { name: "Dancing Dog" })).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
  });

  it("calls onClose when close button is clicked", () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ gifs: [] }),
    } as unknown as Response);

    const onClose = vi.fn();
    render(<GifPicker onSelectGif={vi.fn()} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /Close GIF picker/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
