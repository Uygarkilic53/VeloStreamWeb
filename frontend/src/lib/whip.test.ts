import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enforceSingleTracksInSdp,
  prioritizeH264InSdp,
  publishWhipStream,
  WhipClient,
  WhipError,
} from "./whip";

describe("WhipClient & publishWhipStream", () => {
  let mockTrack: MediaStreamTrack;
  let mockStream: MediaStream;
  let mockPc: {
    iceServers?: RTCIceServer[] | undefined;
    iceGatheringState: RTCIceGatheringState;
    localDescription: { sdp: string; type: string } | null;
    remoteDescription: { sdp: string; type: string } | null;
    addTrack: ReturnType<typeof vi.fn>;
    createOffer: ReturnType<typeof vi.fn>;
    setLocalDescription: ReturnType<typeof vi.fn>;
    setRemoteDescription: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };

  const originalFetch = globalThis.fetch;
  const originalRTCPeerConnection = globalThis.RTCPeerConnection;
  const originalRTCSessionDescription = globalThis.RTCSessionDescription;

  beforeEach(() => {
    mockTrack = {
      id: "video-track-1",
      kind: "video",
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;

    mockStream = {
      getTracks: vi.fn().mockReturnValue([mockTrack]),
    } as unknown as MediaStream;

    mockPc = {
      iceGatheringState: "complete",
      localDescription: { sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=Offer", type: "offer" },
      remoteDescription: null,
      addTrack: vi.fn(),
      createOffer: vi.fn().mockResolvedValue({ sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=Offer", type: "offer" }),
      setLocalDescription: vi.fn().mockResolvedValue(undefined),
      setRemoteDescription: vi.fn().mockImplementation((desc) => {
        mockPc.remoteDescription = desc;
        return Promise.resolve();
      }),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    // Mock RTCPeerConnection constructor
    globalThis.RTCPeerConnection = vi.fn().mockImplementation(function (config?: RTCConfiguration) {
      mockPc.iceServers = config?.iceServers;
      return mockPc;
    }) as unknown as typeof RTCPeerConnection;

    // Mock RTCSessionDescription constructor
    globalThis.RTCSessionDescription = vi.fn().mockImplementation(function (init: RTCSessionDescriptionInit) {
      return init;
    }) as unknown as typeof RTCSessionDescription;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.RTCPeerConnection = originalRTCPeerConnection;
    globalThis.RTCSessionDescription = originalRTCSessionDescription;
    vi.restoreAllMocks();
  });

  it("successfully negotiates SDP offer/answer and extracts session URL", async () => {
    const mockEndpoint = "http://localhost:8889/testchannel/whip";
    const mockStreamKey = "sk_live_12345678";
    const mockAnswerSdp = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=Answer";

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: {
        get: (header: string) => {
          if (header.toLowerCase() === "location") return "/testchannel/whip/session_abc123";
          return null;
        },
      },
      text: vi.fn().mockResolvedValue(mockAnswerSdp),
    } as unknown as Response);

    const session = await publishWhipStream(mockEndpoint, mockStreamKey, mockStream);

    // Verify tracks attached
    expect(mockPc.addTrack).toHaveBeenCalledWith(mockTrack, mockStream);

    // Verify SDP offer created and set
    expect(mockPc.createOffer).toHaveBeenCalled();
    expect(mockPc.setLocalDescription).toHaveBeenCalled();

    // Verify fetch called with correct URL, method, headers, and body
    expect(globalThis.fetch).toHaveBeenCalledWith(mockEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/sdp",
        Authorization: `Bearer ${mockStreamKey}`,
      },
      body: mockPc.localDescription?.sdp,
    });

    // Verify remote description set with answer
    expect(mockPc.setRemoteDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: mockAnswerSdp,
    });

    // Verify sessionUrl resolved properly against endpoint
    expect(session.sessionUrl).toBe("http://localhost:8889/testchannel/whip/session_abc123");
    expect(session.peerConnection).toBe(mockPc);

    // Verify session.stop() performs HTTP DELETE and closes peer connection
    await session.stop();
    expect(globalThis.fetch).toHaveBeenCalledWith("http://localhost:8889/testchannel/whip/session_abc123", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${mockStreamKey}`,
      },
    });
    expect(mockPc.close).toHaveBeenCalled();
  });

  it("handles ICE gathering completion via state change listener", async () => {
    mockPc.iceGatheringState = "gathering";

    mockPc.addEventListener = vi.fn().mockImplementation((event: string, callback: () => void) => {
      if (event === "icegatheringstatechange") {
        setTimeout(() => {
          mockPc.iceGatheringState = "complete";
          callback();
        }, 10);
      }
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: {
        get: () => "/session/1",
      },
      text: vi.fn().mockResolvedValue("answer-sdp"),
    } as unknown as Response);

    const client = new WhipClient({
      endpoint: "http://localhost:8889/live/whip",
      streamKey: "test-key",
      mediaStream: mockStream,
    });

    const session = await client.publish();
    expect(session.sessionUrl).toBe("http://localhost:8889/session/1");
  });

  it("throws WhipError when HTTP status is 401 Unauthorized", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue("Unauthorized"),
    } as unknown as Response);

    const client = new WhipClient({
      endpoint: "http://localhost:8889/test/whip",
      streamKey: "invalid_key",
      mediaStream: mockStream,
    });

    await expect(client.publish()).rejects.toThrow(WhipError);
    await expect(client.publish()).rejects.toMatchObject({
      statusCode: 401,
      message: /invalid stream key or unauthorized/i,
    });
  });

  it("throws WhipError when HTTP status is 404 Channel Not Found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: vi.fn().mockResolvedValue("Not Found"),
    } as unknown as Response);

    const client = new WhipClient({
      endpoint: "http://localhost:8889/unknown/whip",
      streamKey: "some_key",
      mediaStream: mockStream,
    });

    await expect(client.publish()).rejects.toThrow(WhipError);
    await expect(client.publish()).rejects.toMatchObject({
      statusCode: 404,
      message: /channel or ingest endpoint not found/i,
    });
  });

  it("throws WhipError with media server error text on other error statuses", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue("Media server internal error"),
    } as unknown as Response);

    const client = new WhipClient({
      endpoint: "http://localhost:8889/test/whip",
      streamKey: "some_key",
      mediaStream: mockStream,
    });

    await expect(client.publish()).rejects.toThrow(WhipError);
    await expect(client.publish()).rejects.toMatchObject({
      statusCode: 500,
      message: "Media server internal error",
    });
  });

  it("throws WhipError on network failure when connecting to media server", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Failed to fetch"));

    const client = new WhipClient({
      endpoint: "http://localhost:8889/test/whip",
      streamKey: "some_key",
      mediaStream: mockStream,
    });

    await expect(client.publish()).rejects.toThrow(WhipError);
    await expect(client.publish()).rejects.toMatchObject({
      message: /unable to connect to media server/i,
    });
  });

  it("throws WhipError if localDescription SDP offer is missing", async () => {
    mockPc.localDescription = null;

    const client = new WhipClient({
      endpoint: "http://localhost:8889/test/whip",
      streamKey: "some_key",
      mediaStream: mockStream,
    });

    await expect(client.publish()).rejects.toThrow("Failed to generate local SDP offer");
  });

  it("prioritizes H.264 and associated RTX payload types in m=video line of SDP", () => {
    const rawSdp = [
      "v=0",
      "o=- 12345 2 IN IP4 127.0.0.1",
      "s=-",
      "t=0 0",
      "m=video 9 UDP/TLS/RTP/SAVPF 96 97 100 101 127",
      "c=IN IP4 0.0.0.0",
      "a=rtpmap:96 VP8/90000",
      "a=rtpmap:97 VP9/90000",
      "a=rtpmap:100 H264/90000",
      "a=fmtp:100 profile-level-id=42e01f;packetization-mode=1",
      "a=rtpmap:101 rtx/90000",
      "a=fmtp:101 apt=100",
      "a=rtpmap:127 ulpfec/90000",
      "m=audio 9 UDP/TLS/RTP/SAVPF 111",
      "a=rtpmap:111 opus/48000/2",
    ].join("\r\n");

    const munged = prioritizeH264InSdp(rawSdp);
    const mVideoLine = munged.split("\r\n").find((l) => l.startsWith("m=video "));
    expect(mVideoLine).toBe("m=video 9 UDP/TLS/RTP/SAVPF 100 101 96 97 127");
  });

  it("returns SDP unchanged if no m=video section or no H264 codecs are present", () => {
    const audioOnly = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n";
    expect(prioritizeH264InSdp(audioOnly)).toBe(audioOnly);

    const vp8Only = [
      "v=0",
      "m=video 9 UDP/TLS/RTP/SAVPF 96",
      "a=rtpmap:96 VP8/90000",
    ].join("\r\n");
    expect(prioritizeH264InSdp(vp8Only)).toBe(vp8Only);
  });

  it("attaches at most one video track and at most one audio track when mediaStream has multiple tracks", async () => {
    const videoTrack1 = { id: "vid-1", kind: "video", readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack;
    const videoTrack2 = { id: "vid-2", kind: "video", readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack;
    const audioTrack1 = { id: "aud-1", kind: "audio", readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack;
    const audioTrack2 = { id: "aud-2", kind: "audio", readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack;

    const multiTrackStream = {
      getVideoTracks: vi.fn().mockReturnValue([videoTrack1, videoTrack2]),
      getAudioTracks: vi.fn().mockReturnValue([audioTrack1, audioTrack2]),
      getTracks: vi.fn().mockReturnValue([videoTrack1, videoTrack2, audioTrack1, audioTrack2]),
    } as unknown as MediaStream;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: { get: () => "/session/multi" },
      text: vi.fn().mockResolvedValue("v=0\r\ns=Answer"),
    } as unknown as Response);

    const client = new WhipClient({
      endpoint: "http://localhost:8889/test/whip",
      streamKey: "sk_live_123",
      mediaStream: multiTrackStream,
    });

    await client.publish();

    // Verify only the first video track and first audio track are attached
    expect(mockPc.addTrack).toHaveBeenCalledTimes(2);
    expect(mockPc.addTrack).toHaveBeenCalledWith(videoTrack1, expect.anything());
    expect(mockPc.addTrack).toHaveBeenCalledWith(audioTrack1, expect.anything());
    expect(mockPc.addTrack).not.toHaveBeenCalledWith(videoTrack2, expect.anything());
    expect(mockPc.addTrack).not.toHaveBeenCalledWith(audioTrack2, expect.anything());
  });

  it("parses JSON error response from media server when WHIP ingest is rejected", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 406,
      text: vi.fn().mockResolvedValue(JSON.stringify({ error: "only a single video and a single audio track are supported" })),
    } as unknown as Response);

    const client = new WhipClient({
      endpoint: "http://localhost:8889/test/whip",
      streamKey: "sk_live_123",
      mediaStream: mockStream,
    });

    await expect(client.publish()).rejects.toThrow("only a single video and a single audio track are supported");
    await expect(client.publish()).rejects.toMatchObject({
      statusCode: 406,
      message: "only a single video and a single audio track are supported",
    });
  });

  describe("enforceSingleTracksInSdp", () => {
    it("prunes extraneous m=video and m=audio sections from SDP offer and updates BUNDLE", () => {
      const multiTrackSdp = [
        "v=0",
        "o=- 12345 2 IN IP4 127.0.0.1",
        "s=-",
        "t=0 0",
        "a=group:BUNDLE 0 1 2 3",
        "m=video 9 UDP/TLS/RTP/SAVPF 96",
        "a=mid:0",
        "a=rtpmap:96 H264/90000",
        "m=audio 9 UDP/TLS/RTP/SAVPF 111",
        "a=mid:1",
        "a=rtpmap:111 opus/48000/2",
        "m=video 9 UDP/TLS/RTP/SAVPF 97",
        "a=mid:2",
        "a=rtpmap:97 VP8/90000",
        "m=audio 9 UDP/TLS/RTP/SAVPF 112",
        "a=mid:3",
        "a=rtpmap:112 PCMU/8000",
      ].join("\r\n");

      const sanitized = enforceSingleTracksInSdp(multiTrackSdp);

      // Verify BUNDLE line updated to exclude pruned mids 2 and 3
      expect(sanitized).toContain("a=group:BUNDLE 0 1");
      expect(sanitized).not.toContain("a=group:BUNDLE 0 1 2 3");

      // Verify only one m=video and one m=audio section remain
      const videoLines = sanitized.split("\r\n").filter((l) => l.startsWith("m=video "));
      const audioLines = sanitized.split("\r\n").filter((l) => l.startsWith("m=audio "));
      expect(videoLines).toHaveLength(1);
      expect(audioLines).toHaveLength(1);

      // Verify the first video (H264, mid 0) and first audio (opus, mid 1) are preserved
      expect(sanitized).toContain("a=mid:0");
      expect(sanitized).toContain("a=mid:1");
      expect(sanitized).not.toContain("a=mid:2");
      expect(sanitized).not.toContain("a=mid:3");
    });

    it("returns SDP unmodified when at most single video and single audio tracks exist", () => {
      const validSdp = [
        "v=0",
        "o=- 12345 2 IN IP4 127.0.0.1",
        "s=-",
        "t=0 0",
        "a=group:BUNDLE 0 1",
        "m=video 9 UDP/TLS/RTP/SAVPF 96",
        "a=mid:0",
        "m=audio 9 UDP/TLS/RTP/SAVPF 111",
        "a=mid:1",
      ].join("\r\n");

      expect(enforceSingleTracksInSdp(validSdp)).toBe(validSdp);
    });

    it("handles audio-only or video-only SDP without modification", () => {
      const audioOnlySdp = [
        "v=0",
        "o=- 12345 2 IN IP4 127.0.0.1",
        "s=-",
        "m=audio 9 UDP/TLS/RTP/SAVPF 111",
        "a=mid:0",
      ].join("\r\n");

      expect(enforceSingleTracksInSdp(audioOnlySdp)).toBe(audioOnlySdp);
    });
  });
});
