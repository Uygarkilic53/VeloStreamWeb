import { prioritizeH264InSdp } from "./whip";

export interface WhepClientOptions {
  endpoint: string;
  iceServers?: RTCIceServer[] | undefined;
  onTrack?: ((track: MediaStreamTrack, stream: MediaStream) => void) | undefined;
}

export interface WhepSession {
  sessionUrl: string | null;
  peerConnection: RTCPeerConnection;
  stream: MediaStream;
  stop: () => Promise<void>;
}

export class WhepError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = "WhepError";
    Object.setPrototypeOf(this, WhepError.prototype);
  }
}

export class WhepClient {
  private pc: RTCPeerConnection | null = null;
  private sessionUrl: string | null = null;
  private stream: MediaStream | null = null;

  constructor(private readonly options: WhepClientOptions) {}

  async play(): Promise<WhepSession> {
    const { endpoint, iceServers, onTrack } = this.options;

    // Create stream instance safely in browser or test environment
    this.stream = typeof MediaStream !== "undefined" ? new MediaStream() : ({} as MediaStream);

    // 1. Initialize PeerConnection
    const pc = new RTCPeerConnection({
      iceServers: iceServers ?? [{ urls: "stun:stun.l.google.com:19302" }],
    });
    this.pc = pc;

    // 2. Set up incoming track handlers
    pc.ontrack = (event) => {
      const track = event.track;
      if (track && this.stream?.addTrack) {
        this.stream.addTrack(track);
      }
      const activeStream =
        event.streams && event.streams[0] ? event.streams[0] : this.stream;
      if (activeStream) {
        onTrack?.(track, activeStream);
      }
    };

    // 3. Add recvonly transceivers for video and audio
    if (typeof pc.addTransceiver === "function") {
      const videoTransceiver = pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });

      if (typeof RTCRtpSender !== "undefined" && typeof RTCRtpSender.getCapabilities === "function") {
        try {
          const capabilities = RTCRtpSender.getCapabilities("video");
          if (capabilities?.codecs) {
            const h264 = capabilities.codecs.filter((c) => c.mimeType.toLowerCase() === "video/h264");
            const others = capabilities.codecs.filter((c) => c.mimeType.toLowerCase() !== "video/h264");
            if (h264.length > 0 && typeof videoTransceiver.setCodecPreferences === "function") {
              videoTransceiver.setCodecPreferences([...h264, ...others]);
            }
          }
        } catch {
          // Ignore
        }
      }
    }

    // 4. Create local SDP offer and set local description
    const offer = await pc.createOffer();
    const mungedOffer = prioritizeH264InSdp(offer.sdp || "");
    await pc.setLocalDescription({ type: "offer", sdp: mungedOffer });

    // 5. Wait for ICE gathering to complete or timeout
    await this.waitForIceGathering(pc, 2000);

    let sdpOffer = pc.localDescription?.sdp;
    if (!sdpOffer) {
      throw new WhepError("Failed to generate local SDP offer for WHEP egress");
    }
    sdpOffer = prioritizeH264InSdp(sdpOffer);

    // 6. POST offer to WHEP endpoint with application/sdp
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/sdp",
        },
        body: sdpOffer,
      });
    } catch {
      throw new WhepError(`Unable to connect to WHEP endpoint at ${endpoint}. Ensure MediaMTX is running.`);
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new WhepError("Live stream not found or offline on media server.", 404);
      }
      const errText = await response.text().catch(() => "");
      throw new WhepError(errText || `WHEP playback rejected by media server (HTTP ${response.status})`, response.status);
    }

    // 7. Extract Location header for session URL
    const location = response.headers.get("Location");
    this.sessionUrl = location ? new URL(location, endpoint).toString() : null;

    // 8. Apply remote SDP answer
    const answerSdp = await response.text();
    await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: answerSdp }));

    return {
      sessionUrl: this.sessionUrl,
      peerConnection: pc,
      stream: this.stream ?? ({} as MediaStream),
      stop: () => this.stop(),
    };
  }

  async stop(): Promise<void> {
    if (this.sessionUrl) {
      try {
        await fetch(this.sessionUrl, { method: "DELETE" });
      } catch {
        // Silently tolerate network errors on teardown
      }
      this.sessionUrl = null;
    }

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    if (this.stream?.getTracks) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
    }
  }

  private waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 2000): Promise<void> {
    if (pc.iceGatheringState === "complete") {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let cleaned = false;
      const cleanup = () => {
        if (!cleaned) {
          cleaned = true;
          clearTimeout(timer);
          pc.removeEventListener?.("icegatheringstatechange", onStateChange);
        }
      };

      const onStateChange = () => {
        if (pc.iceGatheringState === "complete") {
          cleanup();
          resolve();
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, timeoutMs);

      pc.addEventListener?.("icegatheringstatechange", onStateChange);
    });
  }
}

export async function playWhepStream(
  endpoint: string,
  onTrack?: ((track: MediaStreamTrack, stream: MediaStream) => void) | undefined,
): Promise<WhepSession> {
  const client = new WhepClient({ endpoint, onTrack });
  return client.play();
}
