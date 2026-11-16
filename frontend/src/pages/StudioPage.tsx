import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import {
  ArrowLeftIcon,
  BroadcastIcon,
  CameraIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  GlobeIcon,
  LogInIcon,
  MicIcon,
  MicOffIcon,
  MonitorIcon,
  SaveIcon,
  SlidersIcon,
  UserPlusIcon,
} from "../components/Icons";
import type { AppRoute } from "../components/Navbar";
import { StatusPill } from "../components/StatusPill";
import { ChatRail } from "../components/ChatRail";
import { useAuth, type StreamCategory } from "../lib/auth";
import { setChannelLiveApi } from "../lib/users";
import { publishWhipStream, type WhipSession } from "../lib/whip";
import { captureVideoFrame, saveStreamSnapshot } from "../lib/snapshots";
import { createAudioMonitor, type AudioMonitor } from "../lib/audio-meter";
import { drawBannerToCanvas } from "../lib/canvas-banner";

export type BroadcastState = "idle" | "capturing" | "connecting" | "live" | "ending";

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

function getStudioInitials(displayName?: string, username?: string): string {
  const source = (displayName || username || "VS").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function StudioPage({
  whipBaseUrl,
  wsUrl,
  onNavigate,
  isBroadcastLive,
  onSetBroadcastLive,
}: StudioPageProps) {
  const { user, enterPreviewSession, updateChannelSettings } = useAuth();

  const [broadcastState, setBroadcastState] = useState<BroadcastState>(
    isBroadcastLive ? "live" : "idle",
  );
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
  const [copiedField, setCopiedField] = useState<"whip" | "rtmp" | "key" | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [chatResetKey, setChatResetKey] = useState(0);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [streamResolution, setStreamResolution] = useState<string>("");
  const [micLevel, setMicLevel] = useState(0);
  const [isTalking, setIsTalking] = useState(false);
  const [studioAvatarError, setStudioAvatarError] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const bannerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bannerVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioMonitorRef = useRef<AudioMonitor | null>(null);
  const whipSessionRef = useRef<WhipSession | null>(null);
  const liveSocketRef = useRef<WebSocket | null>(null);
  const avatarImageRef = useRef<HTMLImageElement | null>(null);

  const channelSlug = user?.username ?? "broadcaster";
  const whipEndpoint = `${whipBaseUrl}/${channelSlug}/whip`;
  const rtmpUrl = `rtmp://localhost:1935/${channelSlug}`;

  // Reset avatar image error when avatarUrl changes
  useEffect(() => {
    setStudioAvatarError(false);
  }, [user?.avatarUrl, user?.username]);

  // Pre-load and cache avatar image across canvas redraws
  useEffect(() => {
    if (!user?.avatarUrl) {
      avatarImageRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = user.avatarUrl;
    img.onload = () => {
      avatarImageRef.current = img;
    };
  }, [user?.avatarUrl]);

  // Keep title and category updated with user profile changes
  useEffect(() => {
    if (!user) return;
    setTitleInput(user.channelTitle);
    setCategoryInput(user.channelCategory);
  }, [user]);

  // Synchronize external live status changes with local state
  const prevIsBroadcastLiveRef = useRef(isBroadcastLive);
  useEffect(() => {
    if (prevIsBroadcastLiveRef.current !== isBroadcastLive) {
      prevIsBroadcastLiveRef.current = isBroadcastLive;
      if (isBroadcastLive && broadcastState === "idle") {
        setBroadcastState("live");
      } else if (!isBroadcastLive && broadcastState === "live") {
        setBroadcastState("idle");
      }
    }
  }, [isBroadcastLive, broadcastState]);

  // Duration timer for active broadcasts
  useEffect(() => {
    if (broadcastState !== "live" && !isBroadcastLive) {
      setElapsedSeconds(0);
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [broadcastState, isBroadcastLive]);

  function getOrCreateBannerVideoTrack(): MediaStreamTrack | null {
    if (bannerVideoTrackRef.current && bannerVideoTrackRef.current.readyState === "live") {
      return bannerVideoTrackRef.current;
    }
    if (bannerCanvasRef.current && typeof bannerCanvasRef.current.captureStream === "function") {
      try {
        const stream = bannerCanvasRef.current.captureStream(30);
        const track = stream.getVideoTracks()[0];
        if (track) {
          bannerVideoTrackRef.current = track;
          return track;
        }
      } catch {
        // quiet fallback
      }
    }
    if (typeof MediaStream !== "undefined") {
      const dummy = {
        id: "banner-canvas-track",
        kind: "video",
        enabled: true,
        readyState: "live",
        stop: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      } as unknown as MediaStreamTrack;
      bannerVideoTrackRef.current = dummy;
      return dummy;
    }
    return null;
  }

  const captureAndStoreSnapshot = useCallback(() => {
    let frame: string | null = null;
    if (cameraActive || screenActive) {
      if (
        videoRef.current &&
        (videoRef.current.videoWidth > 0 || videoRef.current.srcObject)
      ) {
        frame = captureVideoFrame(videoRef.current);
      }
    } else if (bannerCanvasRef.current) {
      try {
        frame = bannerCanvasRef.current.toDataURL("image/jpeg", 0.7);
      } catch {
        if (videoRef.current) {
          frame = captureVideoFrame(videoRef.current);
        }
      }
    } else if (videoRef.current) {
      frame = captureVideoFrame(videoRef.current);
    }

    if (frame) {
      saveStreamSnapshot(channelSlug, frame);
      if (
        liveSocketRef.current &&
        typeof WebSocket !== "undefined" &&
        liveSocketRef.current.readyState === WebSocket.OPEN
      ) {
        try {
          liveSocketRef.current.send(
            JSON.stringify({
              type: "stream.snapshot",
              payload: {
                channelId: channelSlug,
                snapshotUrl: frame,
                updatedAt: new Date().toISOString(),
              },
            }),
          );
        } catch {
          // Silently ignore send failures
        }
      }
    }
  }, [cameraActive, screenActive, channelSlug]);

  // Periodic snapshot capture while broadcasting
  useEffect(() => {
    if (broadcastState !== "live" && !isBroadcastLive) {
      return;
    }
    const snapshotTimer = window.setInterval(() => {
      captureAndStoreSnapshot();
    }, 10000);
    return () => window.clearInterval(snapshotTimer);
  }, [broadcastState, isBroadcastLive, captureAndStoreSnapshot]);

  // Audio monitor initialization and stream tracking
  useEffect(() => {
    if (!audioMonitorRef.current) {
      audioMonitorRef.current = createAudioMonitor(mediaStreamRef.current);
    } else {
      audioMonitorRef.current.updateStream(mediaStreamRef.current);
    }
  }, []);

  const ensureAudioTrack = useCallback(async (): Promise<MediaStreamTrack | null> => {
    if (mediaStreamRef.current && mediaStreamRef.current.getAudioTracks().length > 0) {
      const existingTrack = mediaStreamRef.current.getAudioTracks()[0]!;
      existingTrack.enabled = micActive;
      audioMonitorRef.current?.updateStream(mediaStreamRef.current);
      return existingTrack;
    }
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        const firstAudio = audioStream.getAudioTracks()[0] ?? null;
        if (firstAudio) {
          firstAudio.enabled = micActive;
          // Stop secondary audio tracks from multi-channel devices
          for (let i = 1; i < audioStream.getAudioTracks().length; i++) {
            audioStream.getAudioTracks()[i]?.stop();
          }
        }
        if (mediaStreamRef.current) {
          if (typeof mediaStreamRef.current.addTrack === "function") {
            if (firstAudio && mediaStreamRef.current.getAudioTracks().length === 0) {
              mediaStreamRef.current.addTrack(firstAudio);
            }
          }
        } else if (firstAudio) {
          try {
            mediaStreamRef.current = new MediaStream([firstAudio]);
          } catch {
            mediaStreamRef.current = audioStream;
          }
        }
        audioMonitorRef.current?.updateStream(mediaStreamRef.current);
        return mediaStreamRef.current?.getAudioTracks()[0] ?? null;
      } catch {
        // User declined mic or unsupported in current environment
      }
    }
    return null;
  }, [micActive]);

  // Request preview audio stream so mic meter and glowing avatar halo work in studio preview
  useEffect(() => {
    let cancelled = false;
    async function initPreviewAudio() {
      if (micActive && (!mediaStreamRef.current || mediaStreamRef.current.getAudioTracks().length === 0)) {
        await ensureAudioTrack();
        if (!cancelled) {
          void audioMonitorRef.current?.resume();
        }
      }
    }
    void initPreviewAudio();
    return () => {
      cancelled = true;
    };
  }, [micActive, ensureAudioTrack]);

  // Continuous canvas banner rendering loop
  useEffect(() => {
    let animId: number;

    function renderLoop() {
      if (bannerCanvasRef.current) {
        const currentMicLevel = micActive ? (audioMonitorRef.current?.getLevel() ?? 0) : 0;
        const currentIsTalking = micActive ? (audioMonitorRef.current?.isTalking() ?? false) : false;
        drawBannerToCanvas({
          canvas: bannerCanvasRef.current,
          displayName: user?.displayName || user?.username || "Broadcaster",
          username: user?.username || "broadcaster",
          title: titleInput,
          category: categoryInput,
          avatarUrl: user?.avatarUrl ?? null,
          avatarAccent: "#2563EB",
          avatarImage: avatarImageRef.current,
          micActive,
          micLevel: currentMicLevel,
          isTalking: currentIsTalking,
          isLive: broadcastState === "live" || isBroadcastLive,
          timeMs: Date.now(),
        });
      }
      animId = requestAnimationFrame(renderLoop);
    }

    animId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [user, titleInput, categoryInput, micActive, broadcastState, isBroadcastLive]);

  // Audio polling loop for UI preview
  useEffect(() => {
    if (!micActive) {
      setMicLevel(0);
      setIsTalking(false);
      return;
    }

    let animId: number;
    let lastLevel = 0;
    let lastTalking = false;
    let lastTime = 0;

    function pollAudio(now: number) {
      if (audioMonitorRef.current && now - lastTime >= 35) {
        lastTime = now;
        const level = audioMonitorRef.current.getLevel();
        const talking = audioMonitorRef.current.isTalking();
        if (Math.abs(level - lastLevel) > 0.015 || talking !== lastTalking) {
          lastLevel = level;
          lastTalking = talking;
          setMicLevel(level);
          setIsTalking(talking);
        }
      }
      animId = requestAnimationFrame(pollAudio);
    }

    animId = requestAnimationFrame(pollAudio);
    return () => {
      cancelAnimationFrame(animId);
    };
  }, [micActive]);

  // Cleanup media tracks on unmount
  function stopMediaTracks() {
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
    if (bannerVideoTrackRef.current) {
      bannerVideoTrackRef.current.stop();
      bannerVideoTrackRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreamResolution("");
    setMicLevel(0);
    setIsTalking(false);
  }

  function updateStreamResolution(stream?: MediaStream | null) {
    const isNowLive = broadcastState === "live" || isBroadcastLive;
    if (!cameraActive && !screenActive) {
      if (isNowLive) {
        setStreamResolution("1280x720 · Banner Feed");
      } else {
        setStreamResolution("");
      }
      return;
    }
    const activeStream = stream ?? mediaStreamRef.current;
    const videoTrack = activeStream?.getVideoTracks()[0];
    if (videoTrack) {
      const settings = typeof videoTrack.getSettings === "function" ? videoTrack.getSettings() : undefined;
      const width = settings?.width || videoRef.current?.videoWidth;
      const height = settings?.height || videoRef.current?.videoHeight;
      const fps = settings?.frameRate ? Math.round(settings.frameRate) : null;
      if (width && height) {
        setStreamResolution(fps ? `${width}x${height} @ ${fps}fps` : `${width}x${height}`);
        return;
      }
    }
    if (videoRef.current && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
      setStreamResolution(`${videoRef.current.videoWidth}x${videoRef.current.videoHeight}`);
      return;
    }
    setStreamResolution("");
  }

  useEffect(() => {
    return () => {
      stopMediaTracks();
      if (whipSessionRef.current) {
        void whipSessionRef.current.stop();
        whipSessionRef.current = null;
      }
      audioMonitorRef.current?.stop();
      audioMonitorRef.current = null;
    };
  }, []);

  // Listen for Escape key to close auth modal
  useEffect(() => {
    if (!isAuthModalOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsAuthModalOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAuthModalOpen]);

  // Real-time OBS Studio WebSocket synchronization
  useEffect(() => {
    if (typeof window === "undefined" || !window.WebSocket) return;
    const wsEndpoint = `${wsUrl.replace(/^http/, "ws")}/ws/live`;
    let socket: WebSocket | null = null;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      try {
        socket = new WebSocket(wsEndpoint);
        liveSocketRef.current = socket;
        socket.onmessage = (event) => {
          try {
            const frame = JSON.parse(event.data);
            if (frame.type === "stream.status" && frame.payload) {
              const { channelId, status } = frame.payload;
              if (channelSlug && String(channelId).toLowerCase() === channelSlug.toLowerCase()) {
                if (status === "live") {
                  setBroadcastState("live");
                  onSetBroadcastLive(true, { title: titleInput, category: categoryInput });
                  toast.success("OBS stream detected. You are now live.");
                } else if (status === "offline") {
                  setBroadcastState("idle");
                  onSetBroadcastLive(false, { title: titleInput, category: categoryInput });
                  toast.info("OBS stream ended.");
                }
              }
            }
          } catch {
            // ignore malformed websocket frames
          }
        };
        socket.onerror = () => {
          // quiet socket error fallback
        };
      } catch {
        // quiet fallback
      }
    }

    connect();

    return () => {
      cancelled = true;
      liveSocketRef.current = null;
      if (socket) {
        socket.close();
      }
    };
  }, [wsUrl, channelSlug, titleInput, categoryInput, onSetBroadcastLive]);

  function switchToBannerTrackIfLive() {
    if ((broadcastState === "live" || isBroadcastLive) && whipSessionRef.current?.peerConnection) {
      const pc = whipSessionRef.current.peerConnection;
      let videoSender: RTCRtpSender | undefined;
      if (typeof pc.getTransceivers === "function") {
        const transceiver = pc.getTransceivers().find(
          (t) => t.sender?.track?.kind === "video" || t.receiver?.track?.kind === "video"
        );
        videoSender = transceiver?.sender;
      }
      if (!videoSender && typeof pc.getSenders === "function") {
        videoSender = pc.getSenders().find((s) => s.track?.kind === "video");
      }
      const bannerTrack = getOrCreateBannerVideoTrack();
      if (videoSender && bannerTrack && typeof videoSender.replaceTrack === "function") {
        void videoSender.replaceTrack(bannerTrack);
      }
    }
  }

  async function toggleCamera() {
    setMediaNotice(null);
    if (cameraActive) {
      setCameraActive(false);
      if (mediaStreamRef.current) {
        for (const track of mediaStreamRef.current.getVideoTracks()) {
          track.stop();
          if (typeof mediaStreamRef.current.removeTrack === "function") {
            mediaStreamRef.current.removeTrack(track);
          }
        }
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      updateStreamResolution();
      switchToBannerTrackIfLive();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaNotice(
        "Browser camera capture is unavailable in this environment — using studio canvas preview.",
      );
      setCameraActive(false);
      return;
    }
    try {
      setScreenActive(false);
      if (mediaStreamRef.current) {
        for (const track of mediaStreamRef.current.getVideoTracks()) {
          track.stop();
          if (typeof mediaStreamRef.current.removeTrack === "function") {
            mediaStreamRef.current.removeTrack(track);
          }
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const videoTrack = stream.getVideoTracks()[0];
      for (let i = 1; i < stream.getVideoTracks().length; i++) {
        stream.getVideoTracks()[i]?.stop();
      }

      if (mediaStreamRef.current) {
        if (videoTrack && typeof mediaStreamRef.current.addTrack === "function") {
          mediaStreamRef.current.addTrack(videoTrack);
        }
      } else {
        const initialTracks: MediaStreamTrack[] = [];
        if (videoTrack) initialTracks.push(videoTrack);
        try {
          mediaStreamRef.current = new MediaStream(initialTracks);
        } catch {
          mediaStreamRef.current = stream;
        }
      }

      if (videoRef.current) {
        try {
          videoRef.current.srcObject = mediaStreamRef.current;
        } catch {
          // quiet JSDOM fallback
        }
      }
      setCameraActive(true);
      updateStreamResolution(mediaStreamRef.current);
      audioMonitorRef.current?.updateStream(mediaStreamRef.current);

      if (videoTrack && typeof videoTrack.addEventListener === "function") {
        videoTrack.addEventListener("ended", () => {
          if (mediaStreamRef.current && typeof mediaStreamRef.current.removeTrack === "function") {
            mediaStreamRef.current.removeTrack(videoTrack);
          }
          setCameraActive(false);
          updateStreamResolution();
          switchToBannerTrackIfLive();
        });
      }

      // If already live over WHIP, seamlessly update video track on active WebRTC peer connection
      if (whipSessionRef.current?.peerConnection) {
        const pc = whipSessionRef.current.peerConnection;
        let videoSender: RTCRtpSender | undefined;
        if (typeof pc.getTransceivers === "function") {
          const transceiver = pc.getTransceivers().find(
            (t) => t.sender?.track?.kind === "video" || t.receiver?.track?.kind === "video"
          );
          videoSender = transceiver?.sender;
        }
        if (!videoSender && typeof pc.getSenders === "function") {
          videoSender = pc.getSenders().find((s) => s.track?.kind === "video");
        }
        if (videoSender && videoTrack && typeof videoSender.replaceTrack === "function") {
          void videoSender.replaceTrack(videoTrack);
        }
      }
    } catch {
      setMediaNotice("Camera permission was declined or no webcam device was found.");
      setCameraActive(false);
      setStreamResolution("");
    }
  }

  async function toggleMic() {
    const nextMic = !micActive;
    setMicActive(nextMic);
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getAudioTracks()) {
        track.enabled = nextMic;
      }
    }
    if (!nextMic) {
      setMicLevel(0);
      setIsTalking(false);
    } else {
      void audioMonitorRef.current?.resume();
      if (!mediaStreamRef.current || mediaStreamRef.current.getAudioTracks().length === 0) {
        await ensureAudioTrack();
      }
    }
  }

  async function toggleScreenShare() {
    setMediaNotice(null);
    if (screenActive) {
      setScreenActive(false);
      if (mediaStreamRef.current) {
        for (const track of mediaStreamRef.current.getVideoTracks()) {
          track.stop();
          if (typeof mediaStreamRef.current.removeTrack === "function") {
            mediaStreamRef.current.removeTrack(track);
          }
        }
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      updateStreamResolution();
      switchToBannerTrackIfLive();
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
      setCameraActive(false);
      if (mediaStreamRef.current) {
        for (const track of mediaStreamRef.current.getVideoTracks()) {
          track.stop();
          if (typeof mediaStreamRef.current.removeTrack === "function") {
            mediaStreamRef.current.removeTrack(track);
          }
        }
      }

      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const videoTrack = displayStream.getVideoTracks()[0];
      for (let i = 1; i < displayStream.getVideoTracks().length; i++) {
        displayStream.getVideoTracks()[i]?.stop();
      }
      for (const t of displayStream.getAudioTracks()) {
        t.stop();
      }

      if (mediaStreamRef.current) {
        if (videoTrack && typeof mediaStreamRef.current.addTrack === "function") {
          mediaStreamRef.current.addTrack(videoTrack);
        }
      } else {
        mediaStreamRef.current = new MediaStream(videoTrack ? [videoTrack] : []);
      }

      if (videoRef.current) {
        try {
          videoRef.current.srcObject = mediaStreamRef.current;
        } catch {
          // quiet JSDOM fallback
        }
      }
      setScreenActive(true);
      updateStreamResolution(mediaStreamRef.current);

      if (videoTrack && typeof videoTrack.addEventListener === "function") {
        videoTrack.addEventListener("ended", () => {
          if (mediaStreamRef.current && typeof mediaStreamRef.current.removeTrack === "function") {
            mediaStreamRef.current.removeTrack(videoTrack);
          }
          setScreenActive(false);
          updateStreamResolution();
          switchToBannerTrackIfLive();
        });
      }

      // If already live over WHIP, seamlessly update video track on active WebRTC peer connection
      if (whipSessionRef.current?.peerConnection) {
        const pc = whipSessionRef.current.peerConnection;
        let videoSender: RTCRtpSender | undefined;
        if (typeof pc.getTransceivers === "function") {
          const transceiver = pc.getTransceivers().find(
            (t) => t.sender?.track?.kind === "video" || t.receiver?.track?.kind === "video"
          );
          videoSender = transceiver?.sender;
        }
        if (!videoSender && typeof pc.getSenders === "function") {
          videoSender = pc.getSenders().find((s) => s.track?.kind === "video");
        }
        if (videoSender && videoTrack && typeof videoSender.replaceTrack === "function") {
          void videoSender.replaceTrack(videoTrack);
        }
      }
    } catch {
      setMediaNotice("Screen share selection was cancelled.");
      setScreenActive(false);
      setStreamResolution("");
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
    if (broadcastState === "live" || isBroadcastLive) {
      onSetBroadcastLive(true, { title: cleanTitle, category: categoryInput });
    }
    setMetadataSavedNotice(true);
    window.setTimeout(() => setMetadataSavedNotice(false), 1800);
  }

  async function handleGoLive() {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }

    if (ingestMode === "rtmp") {
      toast.info("Start streaming in OBS Studio with your RTMP URL and Stream Key.");
      return;
    }

    const cleanTitle = titleInput.trim() || "Live VeloStream Broadcast";
    if (user.sessionKind === "preview") {
      setBroadcastState("live");
      updateStreamResolution();
      captureAndStoreSnapshot();
      onSetBroadcastLive(true, { title: cleanTitle, category: categoryInput });
      toast.success("Broadcast started. You are now live.");
      return;
    }

    try {
      setBroadcastState("capturing");

      if (!mediaStreamRef.current || mediaStreamRef.current.getAudioTracks().length === 0) {
        await ensureAudioTrack();
      }
      void audioMonitorRef.current?.resume();

      // Assemble publishStream containing strictly at most 1 video track and at most 1 audio track
      let primaryVideoTrack: MediaStreamTrack | null = null;
      if (cameraActive || screenActive) {
        const liveVideo = mediaStreamRef.current?.getVideoTracks().find((t) => t.readyState === "live");
        primaryVideoTrack = liveVideo ?? mediaStreamRef.current?.getVideoTracks()[0] ?? null;
      }
      if (!primaryVideoTrack) {
        primaryVideoTrack = getOrCreateBannerVideoTrack();
      }

      const primaryAudioTrack =
        mediaStreamRef.current?.getAudioTracks().find((t) => t.readyState === "live") ??
        mediaStreamRef.current?.getAudioTracks()[0] ??
        null;

      if (primaryAudioTrack) {
        primaryAudioTrack.enabled = micActive;
      }

      const tracks: MediaStreamTrack[] = [];
      if (primaryVideoTrack) {
        tracks.push(primaryVideoTrack);
      }
      if (primaryAudioTrack) {
        tracks.push(primaryAudioTrack);
      }

      let publishStream: MediaStream;
      try {
        publishStream = new MediaStream(tracks);
      } catch {
        publishStream = (mediaStreamRef.current ?? new MediaStream()) as MediaStream;
      }

      audioMonitorRef.current?.updateStream(mediaStreamRef.current);

      setBroadcastState("connecting");
      const session = await publishWhipStream(whipEndpoint, user.streamKey, publishStream);
      whipSessionRef.current = session;

      setBroadcastState("live");
      updateStreamResolution(publishStream);
      captureAndStoreSnapshot();
      window.setTimeout(() => {
        captureAndStoreSnapshot();
      }, 350);
      onSetBroadcastLive(true, { title: cleanTitle, category: categoryInput });
      if (user.accessToken) {
        void setChannelLiveApi(true, user.accessToken);
      }
      toast.success("Broadcast started. You are now live.");
    } catch (err: unknown) {
      setBroadcastState("idle");
      let msg = err instanceof Error ? err.message : "Failed to establish WebRTC connection.";
      if (msg.includes("only a single video and a single audio track are supported")) {
        msg = "Broadcast rejected: Media server supports a single video and audio track. Extra tracks were detected.";
      }
      toast.error(msg);
    }
  }

  async function handleEndBroadcast() {
    setBroadcastState("ending");
    try {
      if (whipSessionRef.current) {
        await whipSessionRef.current.stop();
        whipSessionRef.current = null;
      }
      if (user?.sessionKind !== "preview" && user?.accessToken) {
        void setChannelLiveApi(false, user.accessToken);
      }
      setChatResetKey((prev) => prev + 1);
      onSetBroadcastLive(false, { title: titleInput, category: categoryInput });
      toast.success("Broadcast ended.");
    } catch {
      toast.error("Failed to cleanly end broadcast.");
    } finally {
      setBroadcastState("idle");
      updateStreamResolution();
    }
  }

  async function copyToClipboard(text: string, field: "whip" | "rtmp" | "key") {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 1800);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Failed to copy to clipboard.");
    }
  }

  const isLive = broadcastState === "live" || isBroadcastLive;

  return (
    <main aria-label="Broadcast studio" className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
      {/* Top Header Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill
            label={
              broadcastState === "capturing"
                ? "Capturing devices"
                : broadcastState === "connecting"
                  ? "Connecting"
                  : broadcastState === "ending"
                    ? "Ending"
                    : isLive
                      ? `LIVE · ${formatDuration(elapsedSeconds)}`
                      : ingestMode === "rtmp"
                        ? "Waiting for OBS"
                        : "Standby"
            }
            tone={isLive ? "live" : "offline"}
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
                  ? "bg-[var(--vs-surface)] text-[var(--vs-text)] shadow-xs"
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
                  ? "bg-[var(--vs-surface)] text-[var(--vs-text)] shadow-xs"
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

      {/* Guest Banner */}
      {!user && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--vs-accent)]/40 bg-[var(--vs-accent-soft)] px-4 py-3">
          <p className="text-xs text-[var(--vs-text)]">
            You are viewing Studio as a guest. Sign in or create a creator account to broadcast live with your own stream key.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => enterPreviewSession()}
              className="rounded-md border border-[var(--vs-border)] bg-[var(--vs-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--vs-text)] hover:bg-[var(--vs-surface-subtle)]"
            >
              Preview mode
            </button>
            <button
              type="button"
              onClick={() => onNavigate({ page: "signin" })}
              className="rounded-md bg-[var(--vs-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--vs-accent-hover)]"
            >
              Sign in
            </button>
          </div>
        </div>
      )}

      {/* Main Studio Grid */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {/* Stage Monitor Card */}
          <section className="overflow-hidden rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)]">
            <div className="relative aspect-video w-full bg-[#0C1119] text-[#F3F5F8]">
              {/* Offscreen 1280x720 Canvas used for WHIP canvas capture stream and snapshots */}
              <canvas
                ref={bannerCanvasRef}
                width={1280}
                height={720}
                data-testid="studio-banner-canvas"
                className="hidden"
                aria-hidden="true"
              />

              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                onLoadedMetadata={() => {
                  updateStreamResolution();
                  captureAndStoreSnapshot();
                }}
                onResize={() => {
                  updateStreamResolution();
                }}
                className={`h-full w-full object-contain ${
                  cameraActive || screenActive ? "block" : "hidden"
                }`}
              />

              {(cameraActive || screenActive) && (
                <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-bold tracking-wider uppercase ${
                      isLive
                        ? "bg-[var(--vs-live)] text-white"
                        : "border border-white/20 bg-black/60 text-white"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isLive ? "bg-emerald-400" : "bg-white"
                      }`}
                    />
                    {isLive ? "On Air · Transmitting" : "Studio Monitor Ready"}
                  </span>
                  {streamResolution ? (
                    <span className="rounded bg-black/60 px-2.5 py-1 font-mono text-[11px] text-slate-200 backdrop-blur-xs">
                      {streamResolution}
                    </span>
                  ) : null}
                </div>
              )}

              {!cameraActive && !screenActive && (
                <div
                  data-testid="studio-banner"
                  className="relative flex h-full w-full flex-col justify-between overflow-hidden p-4 sm:p-5 select-none"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 50% 35%, rgba(37, 99, 235, 0.22), transparent 60%), radial-gradient(circle at 15% 15%, rgba(37, 99, 235, 0.12), transparent 45%), linear-gradient(180deg, #0C1119 0%, #06090E 100%)",
                    backgroundSize: "100% 100%, 100% 100%, 100% 100%",
                  }}
                >
                  {/* Top HUD: Status & Resolution */}
                  <div className="flex items-center justify-between gap-2 z-10">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-bold tracking-wider uppercase ${
                        isLive
                          ? "bg-[var(--vs-live)] text-white"
                          : "border border-white/20 bg-white/10 text-white"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isLive ? "bg-emerald-400" : "bg-white"
                        }`}
                      />
                      {isLive ? "On Air · Transmitting" : "Studio Monitor Ready"}
                    </span>
                    {streamResolution ? (
                      <span className="rounded bg-black/55 px-2.5 py-1 font-mono text-[11px] text-slate-300">
                        {streamResolution}
                      </span>
                    ) : null}
                  </div>

                  {/* Centered Banner Content: Avatar with Voice-Reactive Glowing Pulse Halo */}
                  <div className="my-auto flex flex-col items-center justify-center text-center z-10 py-2">
                    {/* Voice-reactive glowing halo surrounding avatar circle */}
                    <div className="relative flex items-center justify-center mb-3">
                      {/* Glowing Pulse Rings */}
                      <div
                        data-testid="broadcaster-avatar-halo"
                        data-talking={isTalking}
                        data-mic-level={micLevel}
                        data-mic-active={micActive}
                        className={`pointer-events-none absolute -inset-3 rounded-full transition-all duration-150 ease-out ${
                          micActive
                            ? isTalking
                              ? "opacity-95 animate-pulse"
                              : "opacity-45 animate-pulse"
                            : "opacity-0"
                        }`}
                        style={{
                          transform: micActive && isTalking ? `scale(${1 + micLevel * 0.22})` : "scale(1)",
                          boxShadow:
                            micActive && isTalking
                              ? `0 0 ${Math.round(20 + micLevel * 45)}px ${Math.round(8 + micLevel * 22)}px rgba(59, 130, 246, ${(0.45 + micLevel * 0.5).toFixed(2)}), 0 0 ${Math.round(36 + micLevel * 55)}px ${Math.round(16 + micLevel * 28)}px rgba(96, 165, 250, ${(0.25 + micLevel * 0.4).toFixed(2)})`
                              : micActive
                                ? "0 0 14px 4px rgba(59, 130, 246, 0.3)"
                                : "none",
                        }}
                      />

                      {/* Boundary Ring */}
                      <div
                        className={`pointer-events-none absolute -inset-1.5 rounded-full border-2 transition-all duration-100 ease-out ${
                          micActive
                            ? isTalking
                              ? "border-blue-300 opacity-90"
                              : "border-blue-400/40 opacity-50"
                            : "border-slate-600/40 opacity-30"
                        }`}
                        style={{
                          transform: micActive && isTalking ? `scale(${1 + micLevel * 0.1})` : "scale(1)",
                        }}
                      />

                      {/* Circular Avatar */}
                      <div
                        data-testid="studio-broadcaster-avatar"
                        className="relative z-10 flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center overflow-hidden rounded-full border-2 border-white/20 bg-slate-800 shadow-xl"
                      >
                        {user?.avatarUrl && !studioAvatarError ? (
                          <img
                            src={user.avatarUrl}
                            alt={`${user.displayName || user.username} profile avatar`}
                            onError={() => setStudioAvatarError(true)}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div
                            className="flex h-full w-full items-center justify-center font-display text-2xl font-bold text-white sm:text-3xl select-none"
                            style={{
                              backgroundColor:
                                (user as { avatarAccent?: string })?.avatarAccent ||
                                "#2563EB",
                            }}
                          >
                            {getStudioInitials(user?.displayName, user?.username)}
                          </div>
                        )}
                      </div>

                      {/* Talking status badge */}
                      {micActive && isTalking && (
                        <span
                          data-testid="talking-badge"
                          className="absolute -bottom-2 z-20 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white shadow-md animate-bounce"
                        >
                          Speaking
                        </span>
                      )}
                    </div>

                    {/* Broadcaster Name & Username */}
                    <h2 className="font-display text-base sm:text-lg font-bold tracking-tight text-white">
                      {user?.displayName || user?.username || "Broadcaster"}
                    </h2>
                    <p className="font-mono text-xs text-slate-400">@{channelSlug}</p>

                    {/* Stream Title */}
                    <p className="mt-2 max-w-sm sm:max-w-md text-xs sm:text-sm font-medium text-slate-200 line-clamp-2">
                      {titleInput || "Live VeloStream Broadcast"}
                    </p>

                    {/* Category Tag */}
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-blue-400/25 bg-blue-500/15 px-2.5 py-0.5 text-[11px] font-medium text-blue-300">
                      {categoryInput}
                    </span>

                    {!isLive && (
                      <p
                        data-testid="studio-offline-indicator"
                        aria-label="Broadcaster is offline"
                        className="mt-2 font-display text-xs sm:text-sm font-semibold tracking-tight text-slate-300"
                      >
                        User is currently offline
                      </p>
                    )}
                  </div>

                  {/* Bottom HUD: Audio Status & Channel Ingest */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 z-10">
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono">@{channelSlug}</span>
                      <span className="text-slate-600">·</span>
                      <span>Ingest: {ingestMode.toUpperCase()}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span>
                        {micActive
                          ? isTalking
                            ? "Mic live (Speaking)"
                            : "Mic live (Idle)"
                          : "Muted"}
                      </span>
                      {micActive && (
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            isTalking ? "bg-blue-400 animate-ping" : "bg-emerald-400"
                          }`}
                        />
                      )}
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

            {/* Stage Action Controls */}
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
                  onClick={toggleMic}
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
                      className={`h-full transition-all duration-75 ${
                        micActive ? (isTalking ? "bg-blue-400" : "bg-[var(--vs-ok)]") : "w-0"
                      }`}
                      style={{
                        width: micActive ? `${Math.max(10, Math.round(micLevel * 100))}%` : "0%",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Broadcast Main CTA */}
              {ingestMode === "whip" ? (
                <button
                  type="button"
                  onClick={isLive ? handleEndBroadcast : handleGoLive}
                  disabled={broadcastState === "capturing" || broadcastState === "connecting" || broadcastState === "ending"}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors disabled:opacity-60 ${
                    isLive
                      ? "bg-red-600 hover:bg-red-700 active:bg-red-800"
                      : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isLive ? "bg-emerald-400" : "bg-white"
                    }`}
                  />
                  <span>
                    {broadcastState === "capturing"
                      ? "Capturing..."
                      : broadcastState === "connecting"
                        ? "Connecting..."
                        : broadcastState === "ending"
                          ? "Ending..."
                          : isLive
                            ? "End broadcast"
                            : "Go live"}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleGoLive}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors ${
                    isLive
                      ? "bg-red-600 cursor-default"
                      : "bg-slate-700 hover:bg-slate-600"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isLive ? "bg-emerald-400" : "bg-white"
                    }`}
                  />
                  <span>{isLive ? `LIVE · ${formatDuration(elapsedSeconds)}` : "Waiting for OBS stream..."}</span>
                </button>
              )}
            </div>
          </section>

          {/* Broadcast Ingest Details & OBS Settings */}
          {ingestMode === "rtmp" ? (
            <section className="space-y-4 rounded-xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-sm font-bold text-[var(--vs-text)]">
                    OBS Studio Stream Settings
                  </h2>
                  <p className="mt-0.5 text-xs text-[var(--vs-text-muted)]">
                    Configure your stream output in OBS Studio using the credentials below.
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    isLive
                      ? "bg-[var(--vs-accent-soft)] text-[var(--vs-accent)]"
                      : "bg-[var(--vs-surface-subtle)] text-[var(--vs-text-muted)]"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-[var(--vs-accent)]" : "bg-slate-400"}`} />
                  {isLive ? "OBS Active" : "Waiting for OBS stream..."}
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-[var(--vs-text)]">Server (RTMP URL)</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      readOnly
                      value={rtmpUrl}
                      aria-label="RTMP Server URL"
                      className="h-9 w-full rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3 font-mono text-xs text-[var(--vs-text)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void copyToClipboard(rtmpUrl, "rtmp")}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3 text-xs font-semibold text-[var(--vs-text)] hover:border-[var(--vs-accent)]"
                    >
                      {copiedField === "rtmp" ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                      <span>{copiedField === "rtmp" ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--vs-text)]">Stream Key</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      readOnly
                      type={revealKey ? "text" : "password"}
                      value={user?.streamKey ?? ""}
                      placeholder={user ? "" : "Sign in to view your stream key"}
                      aria-label="Stream Key"
                      className="h-9 w-full rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3 font-mono text-xs text-[var(--vs-text)] focus:outline-none"
                    />
                    {user && (
                      <>
                        <button
                          type="button"
                          onClick={() => setRevealKey((prev) => !prev)}
                          aria-label={revealKey ? "Hide stream key" : "Reveal stream key"}
                          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3 text-xs font-semibold text-[var(--vs-text)] hover:border-[var(--vs-accent)]"
                        >
                          {revealKey ? <EyeOffIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
                          <span>{revealKey ? "Hide" : "Reveal"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void copyToClipboard(user.streamKey, "key")}
                          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface-subtle)] px-3 text-xs font-semibold text-[var(--vs-text)] hover:border-[var(--vs-accent)]"
                        >
                          {copiedField === "key" ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                          <span>{copiedField === "key" ? "Copied" : "Copy"}</span>
                        </button>
                      </>
                    )}
                    {!user && (
                      <button
                        type="button"
                        onClick={() => setIsAuthModalOpen(true)}
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--vs-accent)] px-3 text-xs font-semibold text-white hover:bg-[var(--vs-accent-hover)]"
                      >
                        <LogInIcon className="h-3.5 w-3.5" />
                        <span>Sign in for key</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {/* Broadcast Details Metadata Form */}
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
                  Ingest endpoint:{" "}
                  <code className="font-mono text-[var(--vs-text)]">
                    {ingestMode === "whip" ? whipEndpoint : rtmpUrl}
                  </code>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void copyToClipboard(
                      ingestMode === "whip" ? whipEndpoint : rtmpUrl,
                      ingestMode === "whip" ? "whip" : "rtmp",
                    )
                  }
                  className="inline-flex items-center gap-1 font-medium text-[var(--vs-accent)] hover:underline"
                >
                  {copiedField === (ingestMode === "whip" ? "whip" : "rtmp") ? (
                    <CheckIcon className="h-3.5 w-3.5" />
                  ) : (
                    <CopyIcon className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {copiedField === (ingestMode === "whip" ? "whip" : "rtmp") ? "Copied" : "Copy endpoint"}
                  </span>
                </button>
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

        {/* Studio Chat Rail */}
        <div className="min-h-[520px] lg:h-[680px]">
          <ChatRail
            channelSlug={channelSlug}
            wsUrl={wsUrl}
            creatorMode={true}
            resetKey={chatResetKey}
            onViewProfile={(targetUsername) => {
              if (
                user &&
                user.username.replace(/^@/, "").toLowerCase() ===
                  targetUsername.replace(/^@/, "").toLowerCase()
              ) {
                onNavigate({ page: "profile" });
              } else {
                onNavigate({ page: "watch", slug: targetUsername.replace(/^@/, "") });
              }
            }}
          />
        </div>
      </div>

      {/* Accessible Sign In / Sign Up Modal Dialog */}
      {isAuthModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
          onClick={() => setIsAuthModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--vs-border)] bg-[var(--vs-surface)] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--vs-accent-soft)] text-[var(--vs-accent)]">
                  <BroadcastIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 id="auth-modal-title" className="font-display text-base font-bold text-[var(--vs-text)]">
                    Sign in to start broadcasting
                  </h2>
                  <p className="text-xs text-[var(--vs-text-muted)]">
                    Broadcasting live requires a registered creator account.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(false)}
                aria-label="Close modal"
                className="rounded-lg p-1 text-[var(--vs-text-muted)] hover:bg-[var(--vs-surface-subtle)] hover:text-[var(--vs-text)]"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-4 text-xs text-[var(--vs-text-muted)]">
              Sign in with your VeloStream credentials or register a new channel to get your unique stream key and publish via browser WebRTC or OBS Studio.
            </p>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row-reverse">
              <button
                type="button"
                onClick={() => onNavigate({ page: "signin" })}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--vs-accent)] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--vs-accent-hover)]"
              >
                <LogInIcon className="h-4 w-4" />
                <span>Sign in</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate({ page: "signup" })}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--vs-border)] bg-[var(--vs-surface)] px-4 py-2.5 text-xs font-semibold text-[var(--vs-text)] transition-colors hover:bg-[var(--vs-surface-subtle)]"
              >
                <UserPlusIcon className="h-4 w-4" />
                <span>Create account</span>
              </button>
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(false)}
                className="rounded-lg px-3 py-2.5 text-xs font-medium text-[var(--vs-text-muted)] transition-colors hover:text-[var(--vs-text)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
