export interface WhipClientOptions {
  endpoint: string;
  streamKey: string;
  mediaStream: MediaStream;
  iceServers?: RTCIceServer[] | undefined;
}

export interface WhipSession {
  sessionUrl: string | null;
  peerConnection: RTCPeerConnection;
  stop: () => Promise<void>;
}

export class WhipError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = "WhipError";
    Object.setPrototypeOf(this, WhipError.prototype);
  }
}

/**
 * Reorders the payload types in the m=video line of an SDP offer so that
 * H.264 payload types (and their corresponding RTX retransmission payload types)
 * are placed first. This prevents MediaMTX from picking VP8, which breaks HLS muxing.
 */
export function prioritizeH264InSdp(sdp: string): string {
  if (!sdp || !sdp.includes("m=video")) {
    return sdp;
  }
  const isCrlf = sdp.includes("\r\n");
  const lines = sdp.split(/\r?\n/);
  const mVideoIndex = lines.findIndex((l) => l.startsWith("m=video "));
  if (mVideoIndex === -1) {
    return sdp;
  }

  let nextMIndex = lines.findIndex((l, idx) => idx > mVideoIndex && l.startsWith("m="));
  if (nextMIndex === -1) {
    nextMIndex = lines.length;
  }

  const h264Payloads: string[] = [];
  for (let i = mVideoIndex + 1; i < nextMIndex; i++) {
    const line = lines[i];
    if (!line) continue;
    const match = line.match(/^a=rtpmap:(\d+)\s+H264\/90000/i);
    if (match && match[1]) {
      h264Payloads.push(match[1]);
    }
  }

  if (h264Payloads.length === 0) {
    return sdp;
  }

  const rtxPayloads: string[] = [];
  for (let i = mVideoIndex + 1; i < nextMIndex; i++) {
    const line = lines[i];
    if (!line) continue;
    const match = line.match(/^a=fmtp:(\d+)\s+apt=(\d+)/i);
    if (match && match[1] && match[2] && h264Payloads.includes(match[2])) {
      rtxPayloads.push(match[1]);
    }
  }

  const preferredPayloads = [...h264Payloads, ...rtxPayloads];
  const mLine = lines[mVideoIndex];
  if (!mLine) {
    return sdp;
  }
  const parts = mLine.split(" ");
  if (parts.length > 3) {
    const header = parts.slice(0, 3);
    const existingPayloads = parts.slice(3);
    const reordered: string[] = [];

    for (const pt of preferredPayloads) {
      if (existingPayloads.includes(pt) && !reordered.includes(pt)) {
        reordered.push(pt);
      }
    }
    for (const pt of existingPayloads) {
      if (!reordered.includes(pt)) {
        reordered.push(pt);
      }
    }

    lines[mVideoIndex] = [...header, ...reordered].join(" ");
  }

  return lines.join(isCrlf ? "\r\n" : "\n");
}

/**
 * Ensures an SDP offer strictly contains at most one m=video and at most one m=audio
 * media description block, pruning any duplicate media sections and updating
 * the session-level a=group:BUNDLE line to maintain MediaMTX RFC 8829/9675 compatibility.
 */
export function enforceSingleTracksInSdp(sdp: string): string {
  if (!sdp) return sdp;
  const isCrlf = sdp.includes("\r\n");
  const newline = isCrlf ? "\r\n" : "\n";
  const lines = sdp.split(/\r?\n/);

  interface MediaSection {
    kind: "video" | "audio" | "other";
    startIdx: number;
    endIdx: number;
    keep: boolean;
    mid?: string;
  }

  const sections: MediaSection[] = [];
  let sessionEndIdx = lines.length;
  let hasVideo = false;
  let hasAudio = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("m=")) {
      if (sections.length === 0) {
        sessionEndIdx = i;
      } else {
        sections[sections.length - 1]!.endIdx = i;
      }

      let kind: "video" | "audio" | "other" = "other";
      if (line.startsWith("m=video ")) kind = "video";
      else if (line.startsWith("m=audio ")) kind = "audio";

      let keep = true;
      if (kind === "video") {
        if (hasVideo) keep = false;
        else hasVideo = true;
      } else if (kind === "audio") {
        if (hasAudio) keep = false;
        else hasAudio = true;
      }

      sections.push({ kind, startIdx: i, endIdx: lines.length, keep });
    }
  }

  // If no sections require pruning, return unchanged
  const needsPruning = sections.some((s) => !s.keep);
  if (!needsPruning) {
    return sdp;
  }

  const prunedMids = new Set<string>();
  for (const sec of sections) {
    for (let j = sec.startIdx; j < sec.endIdx; j++) {
      const match = lines[j]?.match(/^a=mid:(\S+)/);
      if (match && match[1]) {
        sec.mid = match[1];
        if (!sec.keep) {
          prunedMids.add(match[1]);
        }
        break;
      }
    }
  }

  const resultLines: string[] = [];

  // Session-level lines (updating a=group:BUNDLE)
  for (let i = 0; i < sessionEndIdx; i++) {
    const line = lines[i]!;
    if (line.startsWith("a=group:BUNDLE")) {
      const parts = line.split(" ");
      const bundleHeader = parts[0]!; // "a=group:BUNDLE"
      const bundleMids = parts.slice(1).filter((mid) => !prunedMids.has(mid));
      resultLines.push([bundleHeader, ...bundleMids].join(" "));
    } else {
      resultLines.push(line);
    }
  }

  // Kept media sections
  for (const sec of sections) {
    if (sec.keep) {
      for (let j = sec.startIdx; j < sec.endIdx; j++) {
        resultLines.push(lines[j]!);
      }
    }
  }

  return resultLines.join(newline);
}

export class WhipClient {
  private pc: RTCPeerConnection | null = null;
  private sessionUrl: string | null = null;

  constructor(private readonly options: WhipClientOptions) {}

  async publish(): Promise<WhipSession> {
    const { endpoint, streamKey, mediaStream, iceServers } = this.options;

    // 1. Initialize PeerConnection with default Google STUN server
    const pc = new RTCPeerConnection({
      iceServers: iceServers ?? [{ urls: "stun:stun.l.google.com:19302" }],
    });
    this.pc = pc;

    // 2. Attach media tracks from the stream (enforcing at most a single video and a single audio track for MediaMTX compliance)
    const allTracks = typeof mediaStream.getTracks === "function" ? mediaStream.getTracks() : [];
    const videoTracks = typeof mediaStream.getVideoTracks === "function"
      ? mediaStream.getVideoTracks()
      : allTracks.filter((t) => t.kind === "video");
    const audioTracks = typeof mediaStream.getAudioTracks === "function"
      ? mediaStream.getAudioTracks()
      : allTracks.filter((t) => t.kind === "audio");

    const primaryVideoTrack =
      videoTracks.find((t) => t.kind === "video" && t.readyState === "live") ??
      videoTracks.find((t) => t.kind === "video") ??
      (videoTracks[0]?.kind === "video" ? videoTracks[0] : undefined);

    const primaryAudioTrack =
      audioTracks.find((t) => t.kind === "audio" && t.readyState === "live") ??
      audioTracks.find((t) => t.kind === "audio") ??
      (audioTracks[0]?.kind === "audio" ? audioTracks[0] : undefined);

    const cleanStream = typeof MediaStream !== "undefined" ? new MediaStream() : mediaStream;

    if (primaryVideoTrack) {
      try {
        if (typeof cleanStream.addTrack === "function") {
          cleanStream.addTrack(primaryVideoTrack);
        }
      } catch {
        // quiet fallback
      }
      pc.addTrack(primaryVideoTrack, cleanStream);
    }
    if (primaryAudioTrack && primaryAudioTrack !== primaryVideoTrack) {
      try {
        if (typeof cleanStream.addTrack === "function") {
          cleanStream.addTrack(primaryAudioTrack);
        }
      } catch {
        // quiet fallback
      }
      pc.addTrack(primaryAudioTrack, cleanStream);
    }

    // Fallback if mediaStream has tracks without kind explicitly set or custom structure
    if (!primaryVideoTrack && !primaryAudioTrack && allTracks.length > 0) {
      let videoAdded = false;
      let audioAdded = false;
      for (const track of allTracks) {
        if (track.kind === "video" && !videoAdded) {
          pc.addTrack(track, cleanStream);
          videoAdded = true;
        } else if (track.kind === "audio" && !audioAdded) {
          pc.addTrack(track, cleanStream);
          audioAdded = true;
        } else if (!track.kind && !videoAdded) {
          pc.addTrack(track, cleanStream);
          videoAdded = true;
        }
      }
    }

    // Prioritize H.264 video codec if browser supports codec preferences
    if (typeof RTCRtpSender !== "undefined" && typeof RTCRtpSender.getCapabilities === "function") {
      try {
        const capabilities = RTCRtpSender.getCapabilities("video");
        if (capabilities?.codecs) {
          const h264 = capabilities.codecs.filter((c) => c.mimeType.toLowerCase() === "video/h264");
          const others = capabilities.codecs.filter((c) => c.mimeType.toLowerCase() !== "video/h264");
          const prioritized = [...h264, ...others];
          if (h264.length > 0 && typeof pc.getTransceivers === "function") {
            for (const transceiver of pc.getTransceivers()) {
              if (
                (transceiver.sender?.track?.kind === "video" ||
                  transceiver.receiver?.track?.kind === "video") &&
                typeof transceiver.setCodecPreferences === "function"
              ) {
                transceiver.setCodecPreferences(prioritized);
              }
            }
          }
        }
      } catch {
        // Fall back to SDP offer munging if setCodecPreferences fails
      }
    }

    // 3. Create local SDP offer and set local description
    const offer = await pc.createOffer();
    let mungedOffer = prioritizeH264InSdp(offer.sdp || "");
    mungedOffer = enforceSingleTracksInSdp(mungedOffer);
    await pc.setLocalDescription({ type: "offer", sdp: mungedOffer });

    // 4. Wait for ICE gathering candidates to be bundled in non-trickle SDP
    await this.waitForIceGathering(pc, 2000);

    let sdpOffer = pc.localDescription?.sdp;
    if (!sdpOffer) {
      throw new WhipError("Failed to generate local SDP offer");
    }

    // Ensure H.264 payload types are prioritized and single video/audio track constraint is enforced
    sdpOffer = prioritizeH264InSdp(sdpOffer);
    sdpOffer = enforceSingleTracksInSdp(sdpOffer);

    // 5. POST to WHIP endpoint with Bearer auth and application/sdp
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/sdp",
          Authorization: `Bearer ${streamKey}`,
        },
        body: sdpOffer,
      });
    } catch {
      throw new WhipError(`Unable to connect to media server at ${endpoint}. Ensure MediaMTX is running.`);
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new WhipError("Invalid stream key or unauthorized broadcast credentials.", response.status);
      }
      if (response.status === 404) {
        throw new WhipError("Channel or ingest endpoint not found.", response.status);
      }
      const errText = await response.text().catch(() => "");
      let errorMessage = "";
      try {
        const parsed = JSON.parse(errText);
        if (parsed && typeof parsed.error === "string") {
          errorMessage = parsed.error;
        } else if (parsed && typeof parsed.message === "string") {
          errorMessage = parsed.message;
        }
      } catch {
        // Not JSON formatted error
      }
      if (!errorMessage) {
        errorMessage = errText || `WHIP ingest rejected by media server (HTTP ${response.status})`;
      }
      throw new WhipError(errorMessage, response.status);
    }

    // 6. Extract Location header to resolve session URL (RFC 9675)
    const location = response.headers.get("Location");
    this.sessionUrl = location ? new URL(location, endpoint).toString() : null;

    // 7. Parse SDP answer and set remote description
    const answerSdp = await response.text();
    await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: answerSdp }));

    return {
      sessionUrl: this.sessionUrl,
      peerConnection: pc,
      stop: () => this.stop(),
    };
  }

  async stop(): Promise<void> {
    if (this.sessionUrl) {
      try {
        await fetch(this.sessionUrl, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${this.options.streamKey}`,
          },
        });
      } catch {
        // Silently tolerate network errors on teardown
      }
      this.sessionUrl = null;
    }

    if (this.pc) {
      this.pc.close();
      this.pc = null;
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

export async function publishWhipStream(
  endpoint: string,
  streamKey: string,
  mediaStream: MediaStream,
): Promise<WhipSession> {
  const client = new WhipClient({ endpoint, streamKey, mediaStream });
  return client.publish();
}
