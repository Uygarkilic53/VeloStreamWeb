import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import {
  EyeIcon,
  MaximizeIcon,
  MinimizeIcon,
  TvIcon,
} from "./Icons";
import { StatusPill } from "./StatusPill";
import { StreamThumbnail } from "./StreamThumbnail";
import type { StreamDirectoryItem } from "../lib/streams";

interface StageViewportProps {
  hlsBaseUrl: string;
  channel: StreamDirectoryItem;
  theaterMode: boolean;
  onToggleTheater: () => void;
}

export function StageViewport({
  hlsBaseUrl,
  channel,
  theaterMode,
  onToggleTheater,
}: StageViewportProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [useLiveHls, setUseLiveHls] = useState(false);
  const [hlsStatus, setHlsStatus] = useState<string>("Preview active");
  const hlsUrl = `${hlsBaseUrl.replace(/\/+$/, "")}/${channel.slug}/index.m3u8`;

  useEffect(() => {
    if (!useLiveHls) {
      setHlsStatus("Preview active");
      return;
    }

    const videoEl = videoRef.current;
    if (!videoEl) {
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true });
      hls.loadSource(hlsUrl);
      hls.attachMedia(videoEl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setHlsStatus("HLS stream connected");
        void videoEl.play().catch(() => {
          setHlsStatus("Stream ready — click play");
        });
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setHlsStatus("MediaMTX feed offline — showing channel preview");
        }
      });
      return () => {
        hls.destroy();
      };
    }

    if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
      videoEl.src = hlsUrl;
      setHlsStatus("Native HLS ready");
      return;
    }

    setHlsStatus("HLS unsupported in this browser");
  }, [hlsUrl, useLiveHls]);

  return (
    <section aria-label="Broadcast stage" className="flex flex-col gap-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[var(--vs-border)] bg-[#0B0F17]">
        {useLiveHls ? (
          <video
            ref={videoRef}
            controls
            playsInline
            muted
            className="h-full w-full object-cover"
          />
        ) : (
          <StreamThumbnail
            scene={channel.scene}
            viewerCount={channel.viewerCount}
            quality={channel.quality}
            isLive={channel.isLive}
            compact
          />
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
          <div className="flex items-center gap-2">
            {channel.isLive ? (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--vs-live)] px-2.5 py-1 text-xs font-semibold text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden="true" />
                LIVE · {channel.viewerCount.toLocaleString()}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-black/75 px-2.5 py-1 text-xs font-semibold text-white/90">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden="true" />
                OFFLINE
              </span>
            )}
            <span className="rounded-md bg-black/75 px-2.5 py-1 font-mono text-xs text-white/90">
              {channel.ingestProtocol}
            </span>
          </div>
          <span className="rounded-md bg-black/75 px-2.5 py-1 font-mono text-xs text-white/90">
            {channel.quality}
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-2 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pt-6 pb-3">
          <div className="flex items-center gap-2">
            <StatusPill
              label={useLiveHls ? hlsStatus : channel.isLive ? hlsStatus : "Channel offline"}
              tone={useLiveHls ? "ok" : channel.isLive ? "live" : "offline"}
            />
            <span className="font-mono text-xs text-white/80 tabular-nums">
              {channel.uptime}
            </span>
          </div>

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
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--vs-text-muted)]">
        <span className="font-mono">HLS endpoint: {hlsUrl}</span>
        <span>Low-latency plain broadcast</span>
      </div>
    </section>
  );
}
