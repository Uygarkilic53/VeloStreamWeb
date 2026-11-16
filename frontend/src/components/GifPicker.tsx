import { useEffect, useRef, useState } from "react";
import { CloseIcon, SearchIcon } from "./Icons";
import { LoadingSpinner } from "./LoadingSpinner";
import { getFrontendEnv } from "../lib/env";

export interface GiphyItem {
  id: string;
  title: string;
  previewUrl: string;
  originalUrl: string;
  width?: number;
  height?: number;
}

interface GifPickerProps {
  onSelectGif: (gifUrl: string) => void;
  onClose: () => void;
}

export function GifPicker({ onSelectGif, onClose }: GifPickerProps) {
  const { realtimeHttpUrl } = getFrontendEnv();
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GiphyItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus input and listen for Escape key
  useEffect(() => {
    searchInputRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Handle outside click
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    const fetchGifs = async () => {
      setIsLoading(true);
      setErrorNotice(null);
      try {
        const trimmed = query.trim();
        const url = trimmed
          ? `${realtimeHttpUrl}/api/gifs/search?q=${encodeURIComponent(trimmed)}&limit=24`
          : `${realtimeHttpUrl}/api/gifs/trending?limit=24`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error("Unable to fetch GIFs");
        }
        const data = (await res.json()) as { gifs?: GiphyItem[] };
        if (active) {
          setGifs(data.gifs ?? []);
        }
      } catch {
        if (active) {
          setErrorNotice("Unable to load GIFs. Please try again.");
          setGifs([]);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    const timer = setTimeout(fetchGifs, query ? 300 : 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, realtimeHttpUrl]);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="GIPHY GIF Picker"
      data-testid="gif-picker"
      className="absolute bottom-full left-0 right-0 z-50 mb-2 flex max-h-[380px] flex-col overflow-hidden rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-[var(--vs-border)] px-3 py-2.5">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--vs-text-muted)]" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GIPHY..."
            aria-label="Search GIFs"
            className="w-full rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] py-1.5 pl-8 pr-3 text-xs text-[var(--vs-text)] placeholder:text-[var(--vs-text-muted)] focus:border-[var(--vs-accent)] focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close GIF picker"
          className="ml-2 rounded-lg p-1.5 text-[var(--vs-text-muted)] hover:bg-[var(--vs-surface-subtle)] hover:text-[var(--vs-text)]"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex min-h-[180px] flex-col items-center justify-center p-4">
            <LoadingSpinner label="Loading GIFs..." />
          </div>
        ) : errorNotice ? (
          <div className="flex min-h-[160px] items-center justify-center p-4 text-center">
            <p className="text-xs text-[var(--vs-live)]">{errorNotice}</p>
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex min-h-[160px] flex-col items-center justify-center p-4 text-center">
            <p className="text-xs font-medium text-[var(--vs-text)]">No GIFs found</p>
            <p className="mt-1 text-[11px] text-[var(--vs-text-muted)]">
              Try searching with different keywords.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => {
                  onSelectGif(gif.originalUrl || gif.previewUrl);
                  onClose();
                }}
                className="group relative flex aspect-video w-full overflow-hidden rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vs-accent)]"
              >
                <img
                  src={gif.previewUrl}
                  alt={gif.title || "GIF"}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--vs-border)] px-3 py-1.5 text-right">
        <span className="text-[10px] font-semibold text-[var(--vs-text-muted)]">
          Powered by <span className="font-bold text-[var(--vs-text)]">GIPHY</span>
        </span>
      </div>
    </div>
  );
}
