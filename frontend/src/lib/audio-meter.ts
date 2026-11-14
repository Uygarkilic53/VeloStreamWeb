export const DEFAULT_TALKING_THRESHOLD = 0.05;

export interface AudioMonitorOptions {
  fftSize?: number;
  smoothingTimeConstant?: number;
  noiseFloor?: number;
  talkingThreshold?: number;
}

export interface AudioMonitor {
  getLevel: () => number;
  isTalking: () => boolean;
  updateStream: (stream: MediaStream | null) => void;
  resume: () => Promise<void>;
  stop: () => void;
}

function getStreamAudioTrackIds(stream: MediaStream | null): string {
  if (!stream || typeof stream.getAudioTracks !== "function") return "";
  return stream
    .getAudioTracks()
    .map((t) => t.id)
    .sort()
    .join(",");
}

export function createAudioMonitor(
  initialStream: MediaStream | null,
  options: AudioMonitorOptions = {},
): AudioMonitor {
  const fftSize = options.fftSize ?? 256;
  const smoothing = options.smoothingTimeConstant ?? 0.5;
  const noiseFloor = options.noiseFloor ?? 0.025;
  const talkingThreshold = options.talkingThreshold ?? DEFAULT_TALKING_THRESHOLD;

  let currentStream: MediaStream | null = initialStream;
  let currentTrackIds = getStreamAudioTrackIds(initialStream);
  let audioCtx: AudioContext | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let analyserNode: AnalyserNode | null = null;
  let freqData: Uint8Array<ArrayBuffer> | null = null;
  let currentSmoothedLevel = 0;
  let isStopped = false;

  function teardownNodes() {
    try {
      sourceNode?.disconnect();
    } catch {
      // quiet cleanup
    }
    try {
      analyserNode?.disconnect();
    } catch {
      // quiet cleanup
    }
    sourceNode = null;
    analyserNode = null;
    freqData = null;
  }

  function setupNodes() {
    if (isStopped || !currentStream) return;
    const audioTracks = currentStream.getAudioTracks ? currentStream.getAudioTracks() : [];
    if (audioTracks.length === 0) return;

    const AudioContextClass =
      typeof window !== "undefined"
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;

    if (!AudioContextClass) return;

    try {
      if (!audioCtx || audioCtx.state === "closed") {
        audioCtx = new AudioContextClass();
      }

      if (audioCtx.state === "suspended") {
        void audioCtx.resume().catch(() => {});
      }

      sourceNode = audioCtx.createMediaStreamSource(currentStream);
      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = fftSize;
      analyserNode.smoothingTimeConstant = smoothing;
      sourceNode.connect(analyserNode);
      freqData = new Uint8Array(new ArrayBuffer(analyserNode.frequencyBinCount));
      currentTrackIds = getStreamAudioTrackIds(currentStream);
    } catch {
      teardownNodes();
    }
  }

  setupNodes();

  async function resume(): Promise<void> {
    if (isStopped) return;
    if (audioCtx && audioCtx.state === "suspended") {
      try {
        await audioCtx.resume();
      } catch {
        // quiet cleanup
      }
    }
  }

  function getLevel(): number {
    if (isStopped || !currentStream) {
      currentSmoothedLevel = 0;
      return 0;
    }

    const audioTracks = currentStream.getAudioTracks ? currentStream.getAudioTracks() : [];
    const isAnyTrackActive = audioTracks.length > 0 && audioTracks.some((t) => t.enabled);
    if (!isAnyTrackActive) {
      currentSmoothedLevel = 0;
      return 0;
    }

    // Auto-resume if audio context was suspended by autoplay policy
    if (audioCtx && audioCtx.state === "suspended") {
      void audioCtx.resume().catch(() => {});
    }

    // Detect if tracks were added or changed on the current stream dynamically
    const latestTrackIds = getStreamAudioTrackIds(currentStream);
    if (!analyserNode || !freqData || latestTrackIds !== currentTrackIds) {
      teardownNodes();
      setupNodes();
      if (!analyserNode || !freqData) {
        return 0;
      }
    }

    try {
      analyserNode.getByteFrequencyData(freqData);
    } catch {
      return 0;
    }

    let sumSquares = 0;
    for (let i = 0; i < freqData.length; i++) {
      const normalized = freqData[i]! / 255;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / freqData.length);

    const raw =
      rms <= noiseFloor ? 0 : Math.min(1, (rms - noiseFloor) / Math.max(0.1, 0.5 - noiseFloor));

    if (raw > currentSmoothedLevel) {
      // Rapid attack for immediate vocal responsiveness
      currentSmoothedLevel = currentSmoothedLevel * 0.25 + raw * 0.75;
    } else {
      // Smooth decay to prevent flickering
      currentSmoothedLevel = currentSmoothedLevel * 0.8 + raw * 0.2;
    }

    if (currentSmoothedLevel < 0.005) {
      currentSmoothedLevel = 0;
    }

    return Math.min(1, Math.max(0, currentSmoothedLevel));
  }

  function isTalking(): boolean {
    return getLevel() >= talkingThreshold;
  }

  function updateStream(nextStream: MediaStream | null) {
    const nextTrackIds = getStreamAudioTrackIds(nextStream);
    if (currentStream === nextStream && currentTrackIds === nextTrackIds) {
      return;
    }
    teardownNodes();
    currentStream = nextStream;
    currentTrackIds = nextTrackIds;
    currentSmoothedLevel = 0;
    setupNodes();
  }

  function stop() {
    isStopped = true;
    teardownNodes();
    try {
      if (audioCtx && audioCtx.state !== "closed") {
        void audioCtx.close();
      }
    } catch {
      // quiet cleanup
    }
    audioCtx = null;
    currentSmoothedLevel = 0;
  }

  return {
    getLevel,
    isTalking,
    updateStream,
    resume,
    stop,
  };
}
