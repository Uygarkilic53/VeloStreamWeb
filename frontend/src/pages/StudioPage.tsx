import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import {
  ArrowLeftIcon,
  BroadcastIcon,
  CameraIcon,
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  GlobeIcon,
  MicIcon,
  MicOffIcon,
  MonitorIcon,
  SaveIcon,
  SlidersIcon,
} from "../components/Icons";
import type { AppRoute } from "../components/Navbar";
import { StatusPill } from "../components/StatusPill";
import { ChatRail } from "../components/ChatRail";
import { useAuth, type StreamCategory } from "../lib/auth";

interface StudioPageProps {
  whipBaseUrl: string;
  wsUrl: string;
  onNavigate: (route: AppRoute) => void;
  isBroadcastLive: boolean;
  onSetBroadcastLive: (
    nextLive: boolean,
    details: { title: string; category: StreamCategory },
  ) => void;
}

const STUDIO_CATEGORIES: readonly StreamCategory[] = [
  "Gaming",
  "Just Chatting",
  "Programming",
  "Music & Audio",
  "Creative",
];

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return [hours, mins, secs].map((unit) => String(unit).padStart(2, "0")).join(":");
}

export function StudioPage({
  whipBaseUrl,
  wsUrl,
  onNavigate,
  isBroadcastLive,
  onSetBroadcastLive,
}: StudioPageProps) {
  const { user, enterPreviewSession, updateChannelSettings } = useAuth();

  const [ingestMode, setIngestMode] = useState<"whip" | "rtmp">("whip");
  const [titleInput, setTitleInput] = useState(
    user?.channelTitle ?? "Live systems engineering & low-latency WebRTC tuning",
  );
  const [categoryInput, setCategoryInput] = useState<StreamCategory>(
    user?.channelCategory ?? "Programming",
  );

  const [cameraActive, setCameraActive] = useState(false);
  const [micActive, setMicActive] = useState(true);
  const [screenActive, setScreenActive] = useState(false);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const [metadataSavedNotice, setMetadataSavedNotice] = useState(false);
  const [revealKey, setRevealKey] = useState(false);
  const [copiedIngest, setCopiedIngest] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!user) return;
    setTitleInput(user.channelTitle);
    setCategoryInput(user.channelCategory);
  }, [user]);

  useEffect(() => {
    if (!isBroadcastLive) {
      setElapsedSeconds(0);
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isBroadcastLive]);

  function stopMediaTracks() {
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  useEffect(() => {
    return () => {
      stopMediaTracks();
    };
  }, []);

  async function toggleCamera() {
    setMediaNotice(null);
    if (cameraActive) {
      setCameraActive(false);
      stopMediaTracks();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaNotice(
        "Browser camera capture is unavailable here — using studio canvas preview.",
      );
      setCameraActive(false);
      return;
    }
    try {
      stopMediaTracks();
      setScreenActive(false);
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: micActive });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch {
      setMediaNotice("Camera permission was declined or no webcam device was found.");
      setCameraActive(false);
    }
  }

  async function toggleScreenShare() {
    setMediaNotice(null);
    if (screenActive) {
      setScreenActive(false);
      stopMediaTracks();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setMediaNotice(
        "Screen sharing API is unavailable in this browser — switch to OBS RTMP or enable desktop capture.",
      );
      setScreenActive(false);
      return;
    }
    try {
      stopMediaTracks();
      setCameraActive(false);
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setScreenActive(true);
    } catch {
      setMediaNotice("Screen share selection was cancelled.");
      setScreenActive(false);
    }
  }

  async function handleSaveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = titleInput.trim() || "Untitled VeloStream Broadcast";
    if (user) {
      const result = await updateChannelSettings({
        channelTitle: cleanTitle,
        channelCategory: categoryInput,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Failed to save channel settings.");
        return;
      }
      toast.success(result.message ?? "Channel settings saved.");
    } else {
      toast.success("Broadcast metadata updated.");
    }
    if (isBroadcastLive) {
      onSetBroadcastLive(true, { title: cleanTitle, category: categoryInput });
    }
    setMetadataSavedNotice(true);
    window.setTimeout(() => setMetadataSavedNotice(false), 1800);
  }

  function handleGoLiveToggle() {
    const cleanTitle = titleInput.trim() || "Live VeloStream Broadcast";
    const nextLive = !isBroadcastLive;
    if (!user) {
      enterPreviewSession();
    } else {
      void updateChannelSettings({
        channelTitle: cleanTitle,
        channelCategory: categoryInput,
      }).then((result) => {
        if (!result.ok) {
          toast.error(result.error ?? "Could not sync channel settings.");
        }
      });
    }
    onSetBroadcastLive(nextLive, {
      title: cleanTitle,
      category: categoryInput,
    });
    toast.success(nextLive ? "Broadcast started. You are now live." : "Broadcast ended.");
  }

  async function handleCopyIngest() {
    const endpoint =
      ingestMode === "whip"
        ? `${whipBaseUrl}/${user?.username ?? "channel"}/whip`
        : "rtmp://localhost:1935/live";
    try {
      await navigator.clipboard?.writeText(endpoint);
      setCopiedIngest(true);
      window.setTimeout(() => setCopiedIngest(false), 1800);
    } catch {
      setMediaNotice("Clipboard copy failed in this browser.");
    }
  }

  const rtmpUrl = "rtmp://localhost:1935/live";
  const channelSlug = user?.username ?? "deniz_k";
  const whipEndpoint = `${whipBaseUrl}/${channelSlug}/whip`;

  return (
    <main aria-label="Broadcast studio" className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill
            label={isBroadcastLive ? `LIVE · ${formatDuration(elapsedSeconds)}` : "Standby"}
            tone={isBroadcastLive ? "live" : "offline"}
          />
          <h1 className="font-display text-lg font-bold tracking-tight text-[var(--vs-text)]">
            Broadcast studio
          </h1>
          <span className="rounded border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-2 py-0.5 font-mono text-[11px] text-[var(--vs-text-muted)]">
            @{channelSlug}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Ingest transport"
            className="inline-flex rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] p-0.5"
          >
            <button
              type="button"
              onClick={() => setIngestMode("whip")}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                ingestMode === "whip"
                  ? "bg-[var(--vs-surface)] text-[var(--vs-text)]"
                  : "text-[var(--vs-text-muted)] hover:text-[var(--vs-text)]"
              }`}
            >
              <GlobeIcon className="h-3.5 w-3.5 shrink-0" />
              <span>Browser WebRTC (WHIP)</span>
            </button>
            <button
              type="button"
              onClick={() => setIngestMode("rtmp")}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                ingestMode === "rtmp"
                  ? "bg-[var(--vs-surface)] text-[var(--vs-text)]"
                  : "text-[var(--vs-text-muted)] hover:text-[var(--vs-text)]"
              }`}
            >
              <SlidersIcon className="h-3.5 w-3.5 shrink-0" />
              <span>OBS Studio (RTMP)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => onNavigate({ page: "home" })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--vs-text)] transition-colors hover:bg-[var(--vs-surface-subtle)]"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5 shrink-0" />
            <span>Directory</span>
          </button>
        </div>
      </div>

      {!user && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--vs-accent)]/40 bg-[var(--vs-accent-soft)] px-4 py-3">
          <p className="text-xs text-[var(--vs-text)]">
            You are viewing Studio as a guest. Clicking <strong>Go live</strong> or{" "}
            <strong>Sign in</strong> attaches your creator handle and stream key.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => enterPreviewSession()}
              className="rounded-md bg-[var(--vs-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--vs-accent-hover)]"
            >
              Use preview session
            </button>
            <button
              type="button"
              onClick={() => onNavigate({ page: "signin" })}
              className="rounded-md border border-[var(--vs-border)] bg-[var(--vs-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--vs-text)]"
            >
              Sign in
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <section className="overflow-hidden rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)]">
            <div className="relative aspect-video w-full bg-[#0C1119] text-[#F3F5F8]">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={`h-full w-full object-cover ${
                  cameraActive || screenActive ? "block" : "hidden"
                }`}
              />

              {!cameraActive && !screenActive && (
                <div
                  className="flex h-full w-full flex-col justify-between p-5"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 20% 20%, rgba(37, 99, 235, 0.2), transparent 55%), linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
                    backgroundSize: "100% 100%, 36px 36px, 36px 36px",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-bold tracking-wider uppercase ${
                        isBroadcastLive
                          ? "bg-[var(--vs-live)] text-white"
                          : "border border-white/20 bg-white/10 text-white"
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {isBroadcastLive ? "On Air · Transmitting" : "Studio Monitor Ready"}
                    </span>
                    <span className="rounded bg-black/55 px-2.5 py-1 font-mono text-[11px] text-slate-300">
                      1080p60 · H.264 / Opus
                    </span>
                  </div>

                  <div className="mx-auto max-w-md space-y-2 text-center">
                    <BroadcastIcon className="mx-auto h-8 w-8 text-[#60A5FA]" />
                    <p className="font-display text-base font-semibold text-white">
                      {ingestMode === "whip"
                        ? "Enable Camera or Screen Share for browser WebRTC ingest"
                        : "Waiting for OBS Studio RTMP signal"}
                    </p>
                    <p className="font-mono text-xs text-slate-300">
                      {ingestMode === "whip" ? whipEndpoint : rtmpUrl}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Channel: @{channelSlug}</span>
                    <span>
                      Audio: {micActive ? "Mic live (-18 dBFS)" : "Muted"} · Ingest:{" "}
                      {ingestMode.toUpperCase()}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {mediaNotice && (
              <div className="border-t border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-4 py-2 text-xs text-[var(--vs-text-muted)]">
                {mediaNotice}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--vs-border)] bg-[var(--vs-surface)] px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void toggleCamera()}
                  aria-pressed={cameraActive}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    cameraActive
                      ? "border-[var(--vs-accent)] bg-[var(--vs-accent-soft)] text-[var(--vs-accent)]"
                      : "border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] text-[var(--vs-text)] hover:border-[var(--vs-accent)]"
                  }`}
                >
                  <CameraIcon className="h-3.5 w-3.5" />
                  <span>{cameraActive ? "Camera on" : "Camera"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMicActive((prev) => !prev)}
                  aria-pressed={micActive}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    micActive
                      ? "border-[var(--vs-accent)] bg-[var(--vs-accent-soft)] text-[var(--vs-accent)]"
                      : "border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] text-[var(--vs-text-muted)] hover:text-[var(--vs-text)]"
                  }`}
                >
                  {micActive ? <MicIcon className="h-3.5 w-3.5" /> : <MicOffIcon className="h-3.5 w-3.5" />}
                  <span>{micActive ? "Mic active" : "Mic muted"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void toggleScreenShare()}
                  aria-pressed={screenActive}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    screenActive
                      ? "border-[var(--vs-accent)] bg-[var(--vs-accent-soft)] text-[var(--vs-accent)]"
                      : "border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] text-[var(--vs-text)] hover:border-[var(--vs-accent)]"
                  }`}
                >
                  <MonitorIcon className="h-3.5 w-3.5" />
                  <span>{screenActive ? "Sharing screen" : "Share screen"}</span>
                </button>

                <div
                  className="hidden items-center gap-1.5 pl-2 sm:flex"
                  aria-label="Microphone meter"
                >
                  <span className="text-[11px] text-[var(--vs-text-muted)]">Audio</span>
                  <div className="flex h-2 w-20 overflow-hidden rounded-full bg-[var(--vs-border)]">
                    <div
                      className={`h-full transition-all ${
                        micActive ? "w-2/3 bg-[var(--vs-ok)]" : "w-0"
                      }`}
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoLiveToggle}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-white transition-colors ${
                  isBroadcastLive
                    ? "bg-[var(--vs-text)] hover:opacity-90"
                    : "bg-[var(--vs-live)] hover:opacity-90"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-current" />
                <span>{isBroadcastLive ? "End broadcast" : "Go live"}</span>
              </button>
            </div>
          </section>

          <form
            onSubmit={handleSaveMetadata}
            className="space-y-4 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-bold text-[var(--vs-text)]">
                Broadcast details
              </h2>
              {metadataSavedNotice && (
                <span className="text-xs font-medium text-[var(--vs-ok)]">
                  Updated broadcast details
                </span>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-12">
              <div className="space-y-1 sm:col-span-8">
                <label
                  htmlFor="studio-title"
                  className="text-xs font-semibold text-[var(--vs-text)]"
                >
                  Stream title
                </label>
                <input
                  id="studio-title"
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3 text-sm text-[var(--vs-text)] focus:border-[var(--vs-accent)] focus:bg-[var(--vs-surface)] focus:outline-none"
                />
              </div>

              <div className="space-y-1 sm:col-span-4">
                <label
                  htmlFor="studio-category"
                  className="text-xs font-semibold text-[var(--vs-text)]"
                >
                  Category
                </label>
                <select
                  id="studio-category"
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value as StreamCategory)}
                  className="h-9 w-full rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3 text-sm text-[var(--vs-text)] focus:border-[var(--vs-accent)] focus:outline-none"
                >
                  {STUDIO_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--vs-border)] pt-3">
              <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--vs-text-muted)]">
                <span>
                  Ingest:{" "}
                  <code className="font-mono text-[var(--vs-text)]">
                    {ingestMode === "whip" ? whipEndpoint : rtmpUrl}
                  </code>
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopyIngest()}
                  className="inline-flex items-center gap-1 font-medium text-[var(--vs-accent)] hover:underline"
                >
                  {copiedIngest ? (
                    <CheckIcon className="h-3.5 w-3.5" />
                  ) : (
                    <CopyIcon className="h-3.5 w-3.5" />
                  )}
                  <span>{copiedIngest ? "Copied URL" : "Copy URL"}</span>
                </button>
                {user && ingestMode === "rtmp" && (
                  <button
                    type="button"
                    onClick={() => setRevealKey((prev) => !prev)}
                    className="inline-flex items-center gap-1 font-medium text-[var(--vs-text)] hover:text-[var(--vs-accent)]"
                  >
                    {revealKey ? (
                      <>
                        <EyeOffIcon className="h-3.5 w-3.5" />
                        <span className="font-mono">{user.streamKey}</span>
                      </>
                    ) : (
                      <>
                        <EyeIcon className="h-3.5 w-3.5" />
                        <span>Reveal key</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3.5 py-1.5 text-xs font-semibold text-[var(--vs-text)] transition-colors hover:border-[var(--vs-accent)] hover:text-[var(--vs-accent)]"
              >
                <SaveIcon className="h-3.5 w-3.5" />
                <span>Save title & category</span>
              </button>
            </div>
          </form>
        </div>

        <div className="min-h-[520px] lg:h-[680px]">
          <ChatRail
            channelSlug={channelSlug}
            wsUrl={wsUrl}
            creatorMode={true}
          />
        </div>
      </div>
    </main>
  );
}

