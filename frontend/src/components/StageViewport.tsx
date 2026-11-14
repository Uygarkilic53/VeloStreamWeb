import Hls from "hls.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  EyeIcon,
  MaximizeIcon,
  MinimizeIcon,
  SettingsIcon,
  TvIcon,
} from "./Icons";
import { StatusPill } from "./StatusPill";
import { StreamThumbnail } from "./StreamThumbnail";
import type { StreamDirectoryItem } from "../lib/streams";
import {
  captureVideoFrame,
  getStreamSnapshot,
  saveStreamSnapshot,
} from "../lib/snapshots";
import { playWhepStream, type WhepSession } from "../lib/whep";
import {
  evaluateCapacityAndPickResolution,
  formatMirroredResolution,
  getAvailableResolutionTiers,
  parseFpsFromQualityString,
  readNetworkCapacity,
  RESOLUTION_TIERS,
  type DiagnosisResult,
  type ResolutionTierId,
} from "../lib/resolution-diagnostics";

interface StageViewportProps {
  hlsBaseUrl: string;
  whepBaseUrl?: string | undefined;
  channel: StreamDirectoryItem;
  theaterMode: boolean;
  onToggleTheater: () => void;
}

const OVERLAY_HIDE_DELAY_MS = 2000;

function getOfflineInitials(
  avatarInitials?: string,
  displayName?: string,
  slug?: string,
): string {
  if (avatarInitials && avatarInitials.trim().length > 0) {
    return avatarInitials.trim().slice(0, 3).toUpperCase();
  }
  const source = (displayName || slug || "VS").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function StageViewport({
  hlsBaseUrl,
  whepBaseUrl,
  channel,
  theaterMode,
  onToggleTheater,
}: StageViewportProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const resolutionBtnRef = useRef<HTMLButtonElement | null>(null);
  const resolutionMenuRef = useRef<HTMLDivElement | null>(null);
  const stallCountRef = useRef(0);
  const prevFrameStatsRef = useRef<{ total: number; dropped: number; time: number } | null>(null);

  const [useLiveHls, setUseLiveHls] = useState(channel.isLive);
  const [hlsStatus, setHlsStatus] = useState<string>("Connecting live feed...");
  const [hlsHasError, setHlsHasError] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [avatarError, setAvatarError] = useState(false);

  // Resolution selection and real mirrored resolution states
  const [selectedResolution, setSelectedResolution] = useState<ResolutionTierId>("auto");
  const [isResolutionMenuOpen, setIsResolutionMenuOpen] = useState(false);
  const [detectedDimensions, setDetectedDimensions] = useState<{
    width: number;
    height: number;
    fps?: number | null;
  } | null>(null);
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult>(() =>
    evaluateCapacityAndPickResolution({ fallbackQuality: channel.quality }),
  );

  useEffect(() => {
    setAvatarError(false);
  }, [channel.avatarUrl, channel.slug]);

  // Reset detected dimensions when channel or live status switches
  useEffect(() => {
    setDetectedDimensions(null);
  }, [channel.slug, channel.isLive]);

  const effectiveWhepBase =
    whepBaseUrl || hlsBaseUrl.replace(/:8888\b/, ":8889").replace(/\/+$/, "");
  const whepUrl = `${effectiveWhepBase}/${channel.slug}/whep`;
  const hlsUrl = `${hlsBaseUrl.replace(/\/+$/, "")}/${channel.slug}/index.m3u8`;

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const revealOverlay = useCallback(() => {
    setOverlayVisible(true);
    clearHideTimer();
    // Keep overlay open while resolution menu is being interacted with
    if (isResolutionMenuOpen) return;
    hideTimerRef.current = window.setTimeout(() => {
      setOverlayVisible(false);
      hideTimerRef.current = null;
    }, OVERLAY_HIDE_DELAY_MS);
  }, [clearHideTimer, isResolutionMenuOpen]);

  useEffect(() => {
    revealOverlay();
    return clearHideTimer;
  }, [channel.isLive, channel.slug, clearHideTimer, revealOverlay, isResolutionMenuOpen]);

  useEffect(() => {
    setUseLiveHls(channel.isLive);
  }, [channel.isLive, channel.slug]);

  // Inspect the active video element and media stream tracks for real dimensions
  const updateDimensions = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;

    let width = el.videoWidth;
    let height = el.videoHeight;
    let fps: number | null = null;

    if (el.srcObject && typeof (el.srcObject as MediaStream).getVideoTracks === "function") {
      const tracks = (el.srcObject as MediaStream).getVideoTracks();
      if (tracks.length > 0 && typeof tracks[0]?.getSettings === "function") {
        const settings = tracks[0].getSettings();
        if (settings.width && settings.height) {
          width = settings.width;
          height = settings.height;
        }
        if (settings.frameRate) {
          fps = Math.round(settings.frameRate);
        }
      }
    }

    if (!fps) {
      fps = parseFpsFromQualityString(channel.quality);
    }

    if (width > 0 && height > 0) {
      setDetectedDimensions((prev) => ({
        width,
        height,
        fps: fps || prev?.fps || null,
      }));
    }
  }, [channel.quality]);

  const handleCaptureSnapshot = useCallback(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    updateDimensions();
    const frame = captureVideoFrame(videoEl);
    if (frame) {
      saveStreamSnapshot(channel.slug, frame);
    }
  }, [channel.slug, updateDimensions]);

  // Concurrent diagnosis execution
  const runConcurrentDiagnosis = useCallback(() => {
    const video = videoRef.current;
    let dropRate = 0;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (video && typeof (video as any).getVideoPlaybackQuality === "function") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const quality = (video as any).getVideoPlaybackQuality();
        if (quality && typeof quality.totalVideoFrames === "number") {
          const prev = prevFrameStatsRef.current;
          if (prev && quality.totalVideoFrames > prev.total) {
            const deltaTotal = quality.totalVideoFrames - prev.total;
            const deltaDropped = quality.droppedVideoFrames - prev.dropped;
            dropRate = deltaTotal > 0 ? Math.max(0, deltaDropped / deltaTotal) : 0;

            const deltaSeconds = Math.max(0.1, (now - prev.time) / 1000);
            const calculatedFps = Math.round(deltaTotal / deltaSeconds);
            if (calculatedFps >= 10 && calculatedFps <= 144) {
              setDetectedDimensions((cur) =>
                cur ? { ...cur, fps: calculatedFps } : cur,
              );
            }
          }
          prevFrameStatsRef.current = {
            total: quality.totalVideoFrames,
            dropped: quality.droppedVideoFrames,
            time: now,
          };
        }
      } catch {
        // Silently tolerate browser metric failures
      }
    }

    const network = readNetworkCapacity();
    const result = evaluateCapacityAndPickResolution({
      network,
      playbackHealth: {
        dropRate,
        stallCount: stallCountRef.current,
      },
      sourceHeight: detectedDimensions?.height,
      fallbackQuality: channel.quality,
    });

    setDiagnosisResult(result);
  }, [channel.quality, detectedDimensions?.height]);

  // Periodic and event-driven concurrent diagnosis monitor
  useEffect(() => {
    if (!channel.isLive || !useLiveHls) return;

    runConcurrentDiagnosis();
    const intervalTimer = window.setInterval(runConcurrentDiagnosis, 2500);

    const video = videoRef.current;
    function handleBufferStall() {
      stallCountRef.current += 1;
      runConcurrentDiagnosis();
    }

    if (video) {
      video.addEventListener("waiting", handleBufferStall);
      video.addEventListener("stalled", handleBufferStall);
    }

    // Reset stall count every 12 seconds to prevent stale starvation penalties
    const stallResetTimer = window.setInterval(() => {
      stallCountRef.current = 0;
    }, 12000);

    // Network shift listener
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn = (navigator as any)?.connection;
    if (conn && typeof conn.addEventListener === "function") {
      conn.addEventListener("change", runConcurrentDiagnosis);
    }

    return () => {
      window.clearInterval(intervalTimer);
      window.clearInterval(stallResetTimer);
      if (video) {
        video.removeEventListener("waiting", handleBufferStall);
        video.removeEventListener("stalled", handleBufferStall);
      }
      if (conn && typeof conn.removeEventListener === "function") {
        conn.removeEventListener("change", runConcurrentDiagnosis);
      }
    };
  }, [channel.isLive, runConcurrentDiagnosis, useLiveHls]);

  // Close resolution menu on click outside or escape key
  useEffect(() => {
    if (!isResolutionMenuOpen) return;

    function handlePointerDown(e: MouseEvent | TouchEvent) {
      if (
        resolutionMenuRef.current &&
        !resolutionMenuRef.current.contains(e.target as Node) &&
        resolutionBtnRef.current &&
        !resolutionBtnRef.current.contains(e.target as Node)
      ) {
        setIsResolutionMenuOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsResolutionMenuOpen(false);
        resolutionBtnRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isResolutionMenuOpen]);

  // Synchronize Hls.js quality level switching when resolution changes
  useEffect(() => {
    if (!hlsRef.current) return;
    const hls = hlsRef.current;

    if (selectedResolution === "auto") {
      hls.currentLevel = -1;
    } else {
      const targetTier = RESOLUTION_TIERS.find((t) => t.id === selectedResolution);
      if (targetTier && hls.levels && hls.levels.length > 0) {
        const matchingLevel = hls.levels.findIndex(
          (lvl) => Math.abs(lvl.height - targetTier.height) <= 30,
        );
        if (matchingLevel !== -1) {
          hls.currentLevel = matchingLevel;
        }
      }
    }
  }, [selectedResolution]);

  // Available options ladder starting from current stream's quality down to lower qualities
  const availableTiers = useMemo(() => {
    return getAvailableResolutionTiers(detectedDimensions?.height, channel.quality);
  }, [channel.quality, detectedDimensions?.height]);

  // Reconcile selected resolution if source resolution changes/drops below selection
  useEffect(() => {
    if (selectedResolution === "auto") return;
    const isAvailable = availableTiers.some((t) => t.id === selectedResolution);
    if (!isAvailable) {
      setSelectedResolution("auto");
    }
  }, [availableTiers, selectedResolution]);

  // Real mirrored resolution to display on the top-right overlay badge
  const mirroredResolution = useMemo(() => {
    return formatMirroredResolution({
      videoWidth: detectedDimensions?.width,
      videoHeight: detectedDimensions?.height,
      fps: detectedDimensions?.fps,
      selectedTierId: selectedResolution,
      diagnosedTierId: diagnosisResult.recommendedTierId,
      fallbackQuality: channel.quality,
    });
  }, [
    channel.quality,
    detectedDimensions,
    diagnosisResult.recommendedTierId,
    selectedResolution,
  ]);

  // Active diagnosed tier object for UI label
  const activeDiagnosedTier = useMemo(() => {
    return (
      RESOLUTION_TIERS.find((t) => t.id === diagnosisResult.recommendedTierId) ||
      RESOLUTION_TIERS[0]!
    );
  }, [diagnosisResult.recommendedTierId]);

  // Playback initialization effect
  useEffect(() => {
    if (!channel.isLive || !useLiveHls) {
      setHlsStatus("Channel online");
      setHlsHasError(false);
      return;
    }

    const currentVideo = videoRef.current;
    if (!currentVideo) {
      return;
    }

    let isCancelled = false;
    let whepSession: WhepSession | null = null;
    let hlsInstance: Hls | null = null;

    async function initPlayback() {
      if (!currentVideo) return;
      setHlsStatus("Connecting live feed...");
      setHlsHasError(false);

      let whepPlaying = false;
      let whepFallbackTimer: number | null = null;

      function startHlsFallback() {
        if (isCancelled || !currentVideo) return;
        if (currentVideo.srcObject) {
          currentVideo.srcObject = null;
        }

        if (Hls.isSupported()) {
          const hls = new Hls({
            lowLatencyMode: true,
            manifestLoadingMaxRetry: 6,
            manifestLoadingRetryDelay: 1000,
            levelLoadingMaxRetry: 6,
            levelLoadingRetryDelay: 1000,
          });
          hlsInstance = hls;
          hlsRef.current = hls;

          hls.loadSource(hlsUrl);
          hls.attachMedia(currentVideo);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (isCancelled) return;
            setHlsStatus("HLS stream connected");
            setHlsHasError(false);
            updateDimensions();
            void currentVideo.play().catch(() => {
              setHlsStatus("Stream ready — click play");
              setHlsHasError(false);
            });
          });

          hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
            if (isCancelled) return;
            updateDimensions();
            const lvl = hls.levels ? hls.levels[data.level] : undefined;
            if (lvl && lvl.height && lvl.width) {
              setDetectedDimensions((prev) => ({
                width: lvl.width,
                height: lvl.height,
                fps: prev?.fps ?? null,
              }));
            }
          });

          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (isCancelled) return;
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  hls.recoverMediaError();
                  break;
                default:
                  setHlsStatus("MediaMTX feed offline — showing channel preview");
                  setHlsHasError(true);
                  hls.destroy();
                  hlsRef.current = null;
                  break;
              }
            }
          });
        } else if (currentVideo.canPlayType("application/vnd.apple.mpegurl")) {
          currentVideo.src = hlsUrl;
          setHlsStatus("Native HLS ready");
          setHlsHasError(false);
          updateDimensions();
          void currentVideo.play().catch(() => {
            setHlsStatus("Stream ready — click play");
            setHlsHasError(false);
          });
        } else {
          setHlsStatus("Media stream unsupported in this browser");
          setHlsHasError(true);
        }
      }

      // Attempt 1: Real-time WHEP egress (sub-second latency WebRTC)
      if (typeof RTCPeerConnection !== "undefined" && typeof fetch !== "undefined") {
        try {
          const session = await playWhepStream(whepUrl, (track, stream) => {
            if (!isCancelled && currentVideo) {
              const activeStream =
                stream && stream.getTracks().length > 0 ? stream : new MediaStream([track]);
              if (currentVideo.srcObject !== activeStream) {
                currentVideo.srcObject = activeStream;
              }
              void currentVideo.play().catch(() => {});
              whepPlaying = true;
              if (whepFallbackTimer !== null) {
                window.clearTimeout(whepFallbackTimer);
                whepFallbackTimer = null;
              }
              updateDimensions();
              setHlsStatus("Live (WebRTC WHEP)");
              setHlsHasError(false);
            }
          });

          if (!isCancelled && currentVideo) {
            whepSession = session;

            if (session.stream && session.stream.getTracks().length > 0) {
              if (currentVideo.srcObject !== session.stream) {
                currentVideo.srcObject = session.stream;
              }
              void currentVideo.play().catch(() => {});
              whepPlaying = true;
              updateDimensions();
              setHlsStatus("Live (WebRTC WHEP)");
              setHlsHasError(false);
            }

            // Monitor ICE connection state: if ICE fails, fallback to HLS
            if (session.peerConnection) {
              session.peerConnection.oniceconnectionstatechange = () => {
                if (
                  session.peerConnection.iceConnectionState === "failed" ||
                  session.peerConnection.iceConnectionState === "disconnected"
                ) {
                  if (!isCancelled && !hlsInstance) {
                    void session.stop();
                    startHlsFallback();
                  }
                }
              };
            }

            // If WHEP connects but no media frames arrive within 3.5s, fall back to HLS
            whepFallbackTimer = window.setTimeout(() => {
              if (!isCancelled && !whepPlaying && !hlsInstance) {
                void session.stop();
                startHlsFallback();
              }
            }, 3500);
          } else {
            void session.stop();
            startHlsFallback();
          }
        } catch {
          if (whepSession) {
            void whepSession.stop();
            whepSession = null;
          }
          startHlsFallback();
        }
      } else {
        startHlsFallback();
      }
    }

    void initPlayback();

    return () => {
      isCancelled = true;
      if (whepSession) {
        void whepSession.stop();
      }
      if (hlsInstance) {
        hlsInstance.destroy();
        hlsRef.current = null;
      }
      if (currentVideo) {
        currentVideo.srcObject = null;
        currentVideo.removeAttribute("src");
      }
    };
  }, [channel.isLive, channel.slug, hlsUrl, updateDimensions, useLiveHls, whepUrl]);

  const statusLabel = channel.isLive
    ? useLiveHls
      ? hlsStatus
      : "Channel online"
    : "Channel offline";
  const statusTone = channel.isLive ? (hlsHasError ? "danger" : "ok") : "danger";

  return (
    <section aria-label="Broadcast stage" className="flex flex-col gap-3">
      <div
        data-testid="stage-viewport"
        onMouseEnter={revealOverlay}
        onMouseMove={revealOverlay}
        onMouseLeave={() => {
          if (!isResolutionMenuOpen) {
            clearHideTimer();
            setOverlayVisible(false);
          }
        }}
        onFocus={revealOverlay}
        onBlur={(event) => {
          if (
            !isResolutionMenuOpen &&
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            clearHideTimer();
            setOverlayVisible(false);
          }
        }}
        className="relative aspect-video w-full overflow-hidden rounded-xl border border-[var(--vs-border)] bg-black"
      >
        {!channel.isLive ? (
          <div
            data-testid="stage-offline-screen"
            className="relative flex h-full w-full flex-col items-center justify-center gap-3 bg-black px-6 text-center"
          >
            {getStreamSnapshot(channel.slug) && (
              <img
                src={getStreamSnapshot(channel.slug)!}
                alt="Previous stream snapshot"
                className="absolute inset-0 h-full w-full object-contain opacity-35"
              />
            )}
            <div className="relative z-10 flex flex-col items-center justify-center gap-2">
              {/* Broadcaster Circular Avatar */}
              <div
                data-testid="stage-offline-avatar"
                className="relative flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center overflow-hidden rounded-full border-2 border-white/20 bg-slate-800 shadow-xl"
              >
                {channel.avatarUrl && !avatarError ? (
                  <img
                    src={channel.avatarUrl}
                    alt={`${channel.displayName || channel.slug || "Broadcaster"} avatar`}
                    onError={() => setAvatarError(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center font-display text-xl sm:text-2xl font-bold text-white select-none"
                    style={{ backgroundColor: channel.avatarAccent || "#2563EB" }}
                  >
                    {getOfflineInitials(
                      channel.avatarInitials,
                      channel.displayName,
                      channel.slug,
                    )}
                  </div>
                )}
              </div>

              {/* Broadcaster Name & Handle */}
              <div className="flex flex-col items-center gap-0.5">
                <h3 className="font-display text-base sm:text-lg font-bold tracking-tight text-white">
                  {channel.displayName || channel.slug || "Broadcaster"}
                </h3>
                {channel.slug ? (
                  <p className="font-mono text-xs text-slate-400">@{channel.slug}</p>
                ) : null}
              </div>
            </div>

            <p className="relative z-10 font-display text-sm sm:text-base font-semibold tracking-tight text-white/90">
              User is currently offline
            </p>
          </div>
        ) : useLiveHls ? (
          <video
            ref={videoRef}
            controls
            autoPlay
            playsInline
            muted
            onLoadedMetadata={updateDimensions}
            onResize={updateDimensions}
            onLoadedData={() => {
              updateDimensions();
              handleCaptureSnapshot();
            }}
            onPlaying={() => {
              updateDimensions();
              handleCaptureSnapshot();
            }}
            onTimeUpdate={(e) => {
              const el = e.currentTarget;
              if (!detectedDimensions && el.videoWidth > 0 && el.videoHeight > 0) {
                updateDimensions();
              }
              if (Math.floor(el.currentTime) % 15 === 0) {
                handleCaptureSnapshot();
              }
            }}
            className="h-full w-full object-contain"
          />
        ) : (
          <StreamThumbnail
            scene={channel.scene}
            viewerCount={channel.viewerCount}
            quality={channel.quality}
            isLive={channel.isLive}
            compact
            snapshotUrl={getStreamSnapshot(channel.slug)}
          />
        )}

        {/* Top Overlay: Live badge & Real Mirrored Resolution */}
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3 transition-[opacity,visibility] duration-200 ${
            overlayVisible || isResolutionMenuOpen
              ? "visible opacity-100"
              : "invisible opacity-0"
          }`}
        >
          <div className="flex items-center gap-2">
            {channel.isLive ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--vs-live)] px-2.5 py-1 text-xs font-semibold text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden="true" />
                  LIVE · {channel.viewerCount.toLocaleString()}
                </span>
                <span className="rounded-md bg-black/75 px-2.5 py-1 font-mono text-xs text-white/90">
                  {channel.ingestProtocol}
                </span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-black/75 px-2.5 py-1 text-xs font-semibold text-white/90">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--vs-live)]" aria-hidden="true" />
                OFFLINE
              </span>
            )}
          </div>

          {/* Real Mirrored Stream Resolution at right top corner */}
          {channel.isLive && (
            <span
              data-testid="stage-resolution-badge"
              className="rounded-md bg-black/75 px-2.5 py-1 font-mono text-xs text-white/90"
            >
              {mirroredResolution}
            </span>
          )}
        </div>

        {/* Bottom Overlay: Status, Preview toggle, Theater, and Resolution Settings */}
        <div
          data-testid="stage-status-overlay"
          className={`absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-2 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pt-6 pb-3 transition-[opacity,visibility] duration-200 ${
            overlayVisible || isResolutionMenuOpen
              ? "visible opacity-100 pointer-events-auto"
              : "pointer-events-none invisible opacity-0"
          }`}
        >
          <div className="flex items-center gap-2">
            <StatusPill label={statusLabel} tone={statusTone} />
            {channel.isLive && (
              <span className="font-mono text-xs text-white/80 tabular-nums">
                {channel.uptime}
              </span>
            )}
          </div>

          {channel.isLive && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setUseLiveHls((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-black/65 px-2.5 py-1 text-xs font-medium text-white hover:bg-black/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)]"
              >
                {useLiveHls ? (
                  <>
                    <EyeIcon className="h-3.5 w-3.5" />
                    <span>Show preview</span>
                  </>
                ) : (
                  <>
                    <TvIcon className="h-3.5 w-3.5" />
                    <span>Attach live HLS</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onToggleTheater}
                aria-pressed={theaterMode}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-black/65 px-2.5 py-1 text-xs font-medium text-white hover:bg-black/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)]"
              >
                {theaterMode ? (
                  <>
                    <MinimizeIcon className="h-3.5 w-3.5" />
                    <span>Default view</span>
                  </>
                ) : (
                  <>
                    <MaximizeIcon className="h-3.5 w-3.5" />
                    <span>Theater</span>
                  </>
                )}
              </button>

              {/* Resolution Settings Menu Control */}
              <div className="relative">
                <button
                  ref={resolutionBtnRef}
                  type="button"
                  data-testid="stage-resolution-button"
                  aria-label="Stream resolution settings"
                  aria-haspopup="true"
                  aria-expanded={isResolutionMenuOpen}
                  onClick={() => setIsResolutionMenuOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-black/65 px-2.5 py-1 text-xs font-medium text-white hover:bg-black/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-accent)]"
                >
                  <SettingsIcon className="h-3.5 w-3.5 text-slate-300" />
                  <span>
                    {selectedResolution === "auto"
                      ? `Auto (${activeDiagnosedTier.id})`
                      : selectedResolution}
                  </span>
                </button>

                {isResolutionMenuOpen && (
                  <div
                    ref={resolutionMenuRef}
                    data-testid="stage-resolution-menu"
                    role="menu"
                    aria-label="Quality settings"
                    className="absolute bottom-full right-0 mb-2 w-60 rounded-lg border border-white/15 bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur-md z-30 flex flex-col gap-1 text-xs text-white"
                  >
                    <div className="flex items-center justify-between border-b border-white/10 px-2 py-1.5 text-[11px] font-semibold text-slate-400">
                      <span>Quality</span>
                      {diagnosisResult.networkSummary ? (
                        <span className="font-mono text-[10px] text-blue-400">
                          {diagnosisResult.networkSummary}
                        </span>
                      ) : null}
                    </div>

                    {/* Option: Auto with concurrent capacity diagnosis */}
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={selectedResolution === "auto"}
                      onClick={() => {
                        setSelectedResolution("auto");
                        setIsResolutionMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left transition-colors ${
                        selectedResolution === "auto"
                          ? "bg-blue-600/30 text-white font-medium"
                          : "text-slate-300 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="flex items-center gap-1.5">
                          <span className="font-semibold">Auto</span>
                          <span className="font-mono text-[10px] text-blue-300">
                            ({activeDiagnosedTier.label})
                          </span>
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {diagnosisResult.reason}
                        </span>
                      </div>
                      {selectedResolution === "auto" && (
                        <CheckIcon className="h-4 w-4 text-blue-400 shrink-0" />
                      )}
                    </button>

                    <div className="my-0.5 border-t border-white/10" />

                    {/* Available Resolution Tiers: from current stream quality down to lower qualities */}
                    {availableTiers.map((tier) => (
                      <button
                        key={tier.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selectedResolution === tier.id}
                        onClick={() => {
                          setSelectedResolution(tier.id);
                          setIsResolutionMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left transition-colors ${
                          selectedResolution === tier.id
                            ? "bg-blue-600/30 text-white font-medium"
                            : "text-slate-300 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{tier.label}</span>
                          <span className="text-[10px] text-slate-400">
                            {tier.width}x{tier.height}
                          </span>
                        </div>
                        {selectedResolution === tier.id && (
                          <CheckIcon className="h-4 w-4 text-blue-400 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
