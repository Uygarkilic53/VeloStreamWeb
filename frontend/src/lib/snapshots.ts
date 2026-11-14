import Hls from "hls.js";
import { useEffect, useState } from "react";
import { playWhepStream } from "./whep";

const snapshotCache = new Map<string, string>();
const inFlightCaptures = new Map<string, Promise<string | null>>();
const offlineNegativeCache = new Map<string, number>();
const OFFLINE_COOLDOWN_MS = 20000;
const STORAGE_PREFIX = "velostream_snapshot_";
const SNAPSHOT_EVENT = "velostream:snapshot-updated";

/**
 * Stores a captured base64 data URL snapshot for a given channel slug.
 * Caches in-memory and persists to localStorage/sessionStorage when available,
 * notifying all active snapshot hooks across tabs and components.
 */
export function saveStreamSnapshot(identifier: string, dataUrl: string): void {
  if (!identifier || !dataUrl) return;
  const key = identifier.toLowerCase().trim();
  snapshotCache.set(key, dataUrl);

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, dataUrl);
    }
  } catch {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.setItem(`${STORAGE_PREFIX}${key}`, dataUrl);
      }
    } catch {
      // Storage unavailable or quota exceeded; memory cache remains
    }
  }

  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent(SNAPSHOT_EVENT, { detail: { slug: key, dataUrl } }));
  }
}

/**
 * Retrieves a cached base64 data URL snapshot for a given channel slug, if present.
 * Checks in-memory cache first, then localStorage, then sessionStorage.
 */
export function getStreamSnapshot(identifier: string): string | null {
  if (!identifier) return null;
  const key = identifier.toLowerCase().trim();
  const memoryHit = snapshotCache.get(key);
  if (memoryHit) return memoryHit;

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const stored = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
      if (stored) {
        snapshotCache.set(key, stored);
        return stored;
      }
    }
  } catch {
    // localStorage unavailable
  }

  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      const stored = window.sessionStorage.getItem(`${STORAGE_PREFIX}${key}`);
      if (stored) {
        snapshotCache.set(key, stored);
        return stored;
      }
    }
  } catch {
    // sessionStorage unavailable
  }

  return null;
}

/**
 * Captures a single image frame from an HTMLVideoElement and returns it as a JPEG data URL.
 */
export function captureVideoFrame(video: HTMLVideoElement): string | null {
  try {
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }
    if (typeof video.readyState === "number" && video.readyState < 2) {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(video.videoWidth, 480);
    canvas.height = Math.round((canvas.width / video.videoWidth) * video.videoHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}

export interface CaptureSnapshotOptions {
  hlsBaseUrl?: string | undefined;
  whepBaseUrl?: string | undefined;
}

/**
 * Actively captures a single snapshot frame from a live stream using WHEP egress
 * or HLS video playback, saving it to memory/storage and returning the data URL.
 */
export async function captureLiveStreamSnapshot(
  slug: string,
  options?: CaptureSnapshotOptions | undefined,
): Promise<string | null> {
  if (!slug || typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }
  const cacheKey = slug.toLowerCase().trim();

  // If known offline recently, avoid hammering media server
  const lastOffline = offlineNegativeCache.get(cacheKey) ?? 0;
  if (Date.now() - lastOffline < OFFLINE_COOLDOWN_MS) {
    return null;
  }

  // Deduplicate in-flight capture attempts for the same channel slug
  const existingInFlight = inFlightCaptures.get(cacheKey);
  if (existingInFlight) {
    return existingInFlight;
  }

  const capturePromise = (async () => {
    const whepBase =
      options?.whepBaseUrl ||
      (options?.hlsBaseUrl
        ? options.hlsBaseUrl.replace(/:8888\b/, ":8889").replace(/\/+$/, "")
        : "http://localhost:8889");
    const whepUrl = `${whepBase}/${cacheKey}/whep`;

    const hlsBase = (options?.hlsBaseUrl || "http://localhost:8888").replace(/\/+$/, "");
    const hlsUrl = `${hlsBase}/${cacheKey}/index.m3u8`;

    // Attempt 1: Headless WHEP capture
    if (typeof RTCPeerConnection !== "undefined" && typeof fetch !== "undefined") {
      try {
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.style.position = "fixed";
        video.style.top = "-9999px";
        video.style.left = "-9999px";
        video.style.width = "1px";
        video.style.height = "1px";
        video.style.opacity = "0";
        video.style.pointerEvents = "none";
        if (typeof document !== "undefined" && document.body) {
          document.body.appendChild(video);
        }

        const frame = await new Promise<string | null>((resolve) => {
          let cleaned = false;
          let whepSession: { stop: () => Promise<void> } | null = null;

          const cleanup = () => {
            if (!cleaned) {
              cleaned = true;
              clearTimeout(timer);
              if (video.parentNode) {
                video.parentNode.removeChild(video);
              }
              video.srcObject = null;
              if (whepSession) {
                void whepSession.stop();
              }
            }
          };

          const timer = setTimeout(() => {
            cleanup();
            resolve(null);
          }, 3500);

          const tryCapture = () => {
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              const captured = captureVideoFrame(video);
              if (captured) {
                cleanup();
                resolve(captured);
              }
            }
          };

          video.onloadeddata = tryCapture;
          video.onplaying = tryCapture;
          video.ontimeupdate = tryCapture;

          playWhepStream(whepUrl, (track, stream) => {
            if (!cleaned) {
              const activeStream =
                stream && stream.getTracks().length > 0 ? stream : new MediaStream([track]);
              video.srcObject = activeStream;
              void video.play().catch(() => {});
            }
          })
            .then((session) => {
              whepSession = session;
              if (!cleaned && session.stream && session.stream.getTracks().length > 0) {
                video.srcObject = session.stream;
                void video.play().catch(() => {});
              }
            })
            .catch((err) => {
              if (err && typeof err === "object" && "statusCode" in err && err.statusCode === 404) {
                offlineNegativeCache.set(cacheKey, Date.now());
              }
              cleanup();
              resolve(null);
            });
        });

        if (frame) {
          saveStreamSnapshot(cacheKey, frame);
          return frame;
        }
      } catch {
        // Fall back to HLS headless capture
      }
    }

    // Attempt 2: Headless HLS capture
    if (Hls.isSupported()) {
      try {
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.style.position = "fixed";
        video.style.top = "-9999px";
        video.style.left = "-9999px";
        video.style.width = "1px";
        video.style.height = "1px";
        video.style.opacity = "0";
        video.style.pointerEvents = "none";
        if (typeof document !== "undefined" && document.body) {
          document.body.appendChild(video);
        }

        const frame = await new Promise<string | null>((resolve) => {
          let cleaned = false;
          const hls = new Hls({
            lowLatencyMode: true,
            manifestLoadingMaxRetry: 2,
            levelLoadingMaxRetry: 2,
          });

          const cleanup = () => {
            if (!cleaned) {
              cleaned = true;
              clearTimeout(timer);
              if (video.parentNode) {
                video.parentNode.removeChild(video);
              }
              video.removeAttribute("src");
              hls.destroy();
            }
          };

          const timer = setTimeout(() => {
            cleanup();
            resolve(null);
          }, 3500);

          const tryCapture = () => {
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              const captured = captureVideoFrame(video);
              if (captured) {
                cleanup();
                resolve(captured);
              }
            }
          };

          video.onloadeddata = tryCapture;
          video.onplaying = tryCapture;
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data?.response?.code === 404) {
              offlineNegativeCache.set(cacheKey, Date.now());
            }
            cleanup();
            resolve(null);
          });

          hls.loadSource(hlsUrl);
          hls.attachMedia(video);
          void video.play().catch(() => {});
        });

        if (frame) {
          saveStreamSnapshot(cacheKey, frame);
          return frame;
        }
      } catch {
        // Tolerated
      }
    }

    offlineNegativeCache.set(cacheKey, Date.now());
    return null;
  })();

  inFlightCaptures.set(cacheKey, capturePromise);
  try {
    return await capturePromise;
  } finally {
    inFlightCaptures.delete(cacheKey);
  }
}

/**
 * Hook that retrieves the snapshot for a live stream.
 * Automatically stays synchronized across tabs and within the application when new snapshots are captured.
 */
export function useStreamSnapshot(
  slug: string,
  hlsBaseUrl?: string | undefined,
  isLive?: boolean | undefined,
  whepBaseUrl?: string | undefined,
): string | null {
  const cacheKey = slug ? slug.toLowerCase().trim() : "";
  const [snapshot, setSnapshot] = useState<string | null>(() =>
    cacheKey ? getStreamSnapshot(cacheKey) : null,
  );

  useEffect(() => {
    if (!cacheKey) return;

    // Synchronize initial value from cache/storage
    const currentCached = getStreamSnapshot(cacheKey);
    setSnapshot(currentCached);

    if (typeof window === "undefined") return;

    // If channel is live and has no cached snapshot yet, actively capture frame from live feed
    if (isLive && !currentCached) {
      void captureLiveStreamSnapshot(cacheKey, { hlsBaseUrl, whepBaseUrl });
    }

    // Periodically refresh live channel snapshots every 30s so homepage cards stay fresh
    let refreshTimer: number | undefined;
    if (isLive) {
      refreshTimer = window.setInterval(() => {
        void captureLiveStreamSnapshot(cacheKey, { hlsBaseUrl, whepBaseUrl });
      }, 30000);
    }

    // Listen for storage events from other tabs
    function handleStorage(e: StorageEvent) {
      if (e.key === `${STORAGE_PREFIX}${cacheKey}`) {
        setSnapshot(e.newValue);
      }
    }

    // Listen for local custom events from current tab or WebSocket stream.snapshot
    function handleLocalUpdate(e: Event) {
      const custom = e as CustomEvent<{ slug?: string; dataUrl?: string }>;
      if (custom.detail?.slug === cacheKey) {
        setSnapshot(custom.detail.dataUrl ?? null);
      }
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener(SNAPSHOT_EVENT, handleLocalUpdate);

    return () => {
      if (refreshTimer) {
        window.clearInterval(refreshTimer);
      }
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(SNAPSHOT_EVENT, handleLocalUpdate);
    };
  }, [cacheKey, hlsBaseUrl, isLive, whepBaseUrl]);

  return snapshot;
}
