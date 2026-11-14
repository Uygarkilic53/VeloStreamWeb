import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import { LoadingSpinner } from "./LoadingSpinner";
import { captureVideoFrame, saveStreamSnapshot } from "../lib/snapshots";
import { playWhepStream, type WhepSession } from "../lib/whep";

export interface StreamHoverPreviewProps {
  slug: string;
  hlsBaseUrl?: string | undefined;
  whepBaseUrl?: string | undefined;
  onStreamActive?: () => void;
  className?: string;
}

export function StreamHoverPreview({
  slug,
  hlsBaseUrl = "http://localhost:8888",
  whepBaseUrl,
  onStreamActive,
  className = "",
}: StreamHoverPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showConnecting, setShowConnecting] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    let hasPlayed = false;
    let whepSession: WhepSession | null = null;
    let hlsInstance: Hls | null = null;
    let fallbackTimer: number | null = null;
    let maxTimeoutTimer: number | null = null;

    const currentVideo = videoRef.current;
    if (!currentVideo) return;

    currentVideo.defaultMuted = true;
    currentVideo.muted = true;
    currentVideo.volume = 0;
    currentVideo.playsInline = true;

    // Grace delay (150ms) before rendering connecting spinner to prevent flashing on rapid cursor movements
    const connectingTimer = window.setTimeout(() => {
      if (!isCancelled && !hasPlayed) {
        setShowConnecting(true);
      }
    }, 150);

    // After 7 seconds max, hide connecting spinner if stream could not be loaded
    maxTimeoutTimer = window.setTimeout(() => {
      if (!isCancelled && !hasPlayed) {
        setShowConnecting(false);
      }
    }, 7000);

    const effectiveWhepBase = (
      whepBaseUrl || hlsBaseUrl.replace(/:8888\b/, ":8889")
    )
      .trim()
      .replace(/\/+$/, "");
    const whepUrl = `${effectiveWhepBase}/${slug}/whep`;
    const hlsUrl = `${hlsBaseUrl.trim().replace(/\/+$/, "")}/${slug}/index.m3u8`;

    function safePlay() {
      if (isCancelled || !currentVideo) return;
      try {
        const p = currentVideo.play();
        if (p && typeof p.catch === "function") {
          p.catch(() => {});
        }
      } catch {
        // Quiet fallback
      }
    }

    function markActive() {
      if (isCancelled) return;
      hasPlayed = true;
      setIsPlaying(true);
      setShowConnecting(false);
      onStreamActive?.();
    }

    function startHlsFallback() {
      if (isCancelled || !currentVideo) return;
      if (currentVideo.srcObject) {
        currentVideo.srcObject = null;
      }

      if (Hls.isSupported()) {
        const hls = new Hls({
          lowLatencyMode: true,
          manifestLoadingMaxRetry: 2,
          manifestLoadingRetryDelay: 800,
          levelLoadingMaxRetry: 2,
          levelLoadingRetryDelay: 800,
        });
        hlsInstance = hls;
        hls.loadSource(hlsUrl);
        hls.attachMedia(currentVideo);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (isCancelled) return;
          safePlay();
          markActive();
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (isCancelled) return;
          if (data.fatal) {
            // Terminate cleanly on 404 or unrecoverable error instead of infinite retry loop
            if (
              data.response?.code === 404 ||
              data.details === "manifestLoadError" ||
              data.details === "manifestLoadTimeOut"
            ) {
              hls.destroy();
              setShowConnecting(false);
            } else {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  hls.recoverMediaError();
                  break;
                default:
                  hls.destroy();
                  setShowConnecting(false);
                  break;
              }
            }
          }
        });
      } else if (currentVideo.canPlayType("application/vnd.apple.mpegurl")) {
        currentVideo.src = hlsUrl;
        safePlay();
        markActive();
      }
    }

    async function initPlayback() {
      if (!currentVideo || isCancelled) return;

      let whepPlaying = false;

      if (typeof RTCPeerConnection !== "undefined" && typeof fetch !== "undefined") {
        try {
          const session = await playWhepStream(whepUrl, (track, stream) => {
            if (!isCancelled && currentVideo) {
              // Mute any audio tracks so preview is completely silent
              if (track.kind === "audio") {
                track.enabled = false;
              }
              const activeStream =
                stream && typeof stream.getTracks === "function" && stream.getTracks().length > 0
                  ? stream
                  : typeof MediaStream !== "undefined"
                    ? new MediaStream([track])
                    : ({} as MediaStream);
              if (currentVideo.srcObject !== activeStream) {
                currentVideo.srcObject = activeStream;
              }
              safePlay();
              whepPlaying = true;
              if (fallbackTimer !== null) {
                window.clearTimeout(fallbackTimer);
                fallbackTimer = null;
              }
              markActive();
            }
          });

          if (isCancelled) {
            void session.stop();
            return;
          }

          if (currentVideo) {
            whepSession = session;

            if (session.stream) {
              // Ensure all tracks in session stream have audio disabled
              if (typeof session.stream.getAudioTracks === "function") {
                for (const aTrack of session.stream.getAudioTracks()) {
                  aTrack.enabled = false;
                }
              }
              currentVideo.srcObject = session.stream;
              safePlay();
              whepPlaying = true;
              markActive();
            }

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

            fallbackTimer = window.setTimeout(() => {
              if (!isCancelled && !whepPlaying && !hlsInstance) {
                void session.stop();
                startHlsFallback();
              }
            }, 3500);
          } else {
            void session.stop();
          }
        } catch {
          if (whepSession) {
            void whepSession.stop();
            whepSession = null;
          }
          if (!isCancelled) {
            startHlsFallback();
          }
        }
      } else {
        if (!isCancelled) {
          startHlsFallback();
        }
      }
    }

    void initPlayback();

    return () => {
      isCancelled = true;
      window.clearTimeout(connectingTimer);
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
      }
      if (maxTimeoutTimer !== null) {
        window.clearTimeout(maxTimeoutTimer);
      }

      if (currentVideo) {
        try {
          if (hasPlayed || (currentVideo.videoWidth > 0 && currentVideo.readyState >= 2)) {
            const frame = captureVideoFrame(currentVideo);
            if (frame) {
              saveStreamSnapshot(slug, frame);
            }
          }
        } catch {
          // Quiet
        }
        currentVideo.srcObject = null;
        currentVideo.removeAttribute("src");
      }

      if (whepSession) {
        void whepSession.stop();
        whepSession = null;
      }
      if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
      }
    };
  }, [hlsBaseUrl, onStreamActive, slug, whepBaseUrl]);

  return (
    <div
      data-testid="stream-hover-preview"
      className={`absolute inset-0 z-10 overflow-hidden pointer-events-none ${className}`}
    >
      <video
        ref={videoRef}
        data-testid="stream-hover-video"
        aria-label={`Live stream preview for ${slug}`}
        autoPlay
        muted
        playsInline
        onPlaying={() => {
          setIsPlaying(true);
          setShowConnecting(false);
          onStreamActive?.();
        }}
        onLoadedData={() => {
          setIsPlaying(true);
          setShowConnecting(false);
          onStreamActive?.();
        }}
        className={`h-full w-full object-cover transition-opacity duration-300 ${
          isPlaying ? "opacity-100" : "opacity-0"
        }`}
      />

      {!isPlaying && showConnecting && (
        <div
          data-testid="stream-hover-connecting"
          className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[1px]"
        >
          <LoadingSpinner
            label="Connecting live preview..."
            className="py-1"
            lineClassName="max-w-[120px]"
          />
        </div>
      )}
    </div>
  );
}
